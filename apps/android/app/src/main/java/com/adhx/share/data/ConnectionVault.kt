package com.adhx.share.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** The ADHX this phone saves to, and the phone key it got when pairing. */
@Serializable
data class Connection(
    val server: String,
    val key: String,
    val username: String? = null,
    val phoneName: String? = null,
    /** Your picture (from `/api/app/me`), for your own reactions. null: your initial. */
    val avatarUrl: String? = null,
) {
    internal fun sameCredential(other: Connection?): Boolean =
        other != null && server == other.server && key == other.key
}

@Serializable
internal data class ConnectionRecord(
    val connection: Connection? = null,
    val lastServer: String? = null,
    // False after disconnect/account change, even if clearing old history failed.
    val allowLegacyHistory: Boolean = false,
) {
    fun pairedWith(next: Connection) = ConnectionRecord(next, next.server,
        allowLegacyHistory = allowLegacyHistory && !changesAccount(next))

    fun identityUpdated(expected: Connection, username: String?, phoneName: String?): ConnectionRecord =
        identityUpdated(expected, username, phoneName, connection?.avatarUrl)

    /** As above, with your picture; null means the generated icon (or an older server). */
    fun identityUpdated(expected: Connection, username: String?, phoneName: String?, avatarUrl: String?): ConnectionRecord {
        val now = connection ?: return this
        if (!now.sameCredential(expected)) return this
        return copy(connection = now.copy(username = username ?: now.username, phoneName = phoneName ?: now.phoneName,
            avatarUrl = avatarUrl))
    }

    fun changesAccount(next: Connection): Boolean {
        val previous = connection ?: return true
        return previous.server != next.server || previous.username != next.username
    }
}

internal interface VaultFile {
    fun read(): ByteArray?
    /** Must atomically replace and fsync, retaining the previous file if writing fails. */
    fun write(bytes: ByteArray)
}

internal interface LegacyConnection {
    fun read(): ConnectionRecord?
    fun remove()
}

/** No Android dependency: migration ordering and authentication failures have JVM regressions. */
internal class ConnectionVault(
    private val file: VaultFile,
    private val key: (create: Boolean) -> SecretKey,
    private val legacy: LegacyConnection,
) {
    var record = ConnectionRecord()
        private set
    var error: String? = null
        private set

    @Synchronized
    fun load() {
        record = ConnectionRecord()
        try {
            val bytes = file.read()
            if (bytes != null) {
                // Never fall back to an older credential after corrupt/new storage or a lost key.
                record = decrypt(bytes)
                error = null
                return
            }
            val old = legacy.read() ?: ConnectionRecord()
            record = old
            if (old != ConnectionRecord()) {
                write(old)
            } else {
                error = null
            }
        } catch (_: Exception) {
            error = STORAGE_ERROR
        }
    }

    @Synchronized
    fun write(next: ConnectionRecord): Boolean = try {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key(true))
        cipher.updateAAD(AAD)
        val encrypted = cipher.doFinal(Json.encodeToString(next).toByteArray(Charsets.UTF_8))
        val envelope = byteArrayOf(1, cipher.iv.size.toByte()) + cipher.iv + encrypted
        check(decrypt(envelope) == next)
        file.write(envelope)
        check(file.read()?.let(::decrypt) == next)
        record = next
        error = null
        // Deleting legacy data is safe only after the new copy is readable and durable.
        // Failure to remove it must not turn a successful pairing into a false failure.
        try { legacy.remove() } catch (_: Exception) { /* Retried after the next successful write. */ }
        true
    } catch (_: Exception) {
        error = STORAGE_ERROR
        false
    }

    private fun decrypt(bytes: ByteArray): ConnectionRecord {
        require(bytes.size in 31..MAX_BYTES && bytes[0].toInt() == 1 && bytes[1].toInt() == 12)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(false), GCMParameterSpec(128, bytes.copyOfRange(2, 14)))
        cipher.updateAAD(AAD)
        val plaintext = cipher.doFinal(bytes.copyOfRange(14, bytes.size)).toString(Charsets.UTF_8)
        return Json.decodeFromString<ConnectionRecord>(plaintext).also {
            require(it.connection == null || (it.connection.server.isNotBlank() && it.connection.key.isNotBlank()))
        }
    }

    companion object {
        const val STORAGE_ERROR = "Your phone’s secure storage isn’t available. Any existing connection files have been kept. Free some space and reopen ADHX, or pair again with a new code."
        const val MAX_BYTES = 32 * 1024
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private val AAD = "adhx.phone-connection.v1".toByteArray(Charsets.UTF_8)
    }
}

/** Android AtomicFile and SharedPreferences both recover their .bak file after interrupted writes. */
internal fun recoverableFileExists(file: File): Boolean = file.exists() || File(file.path + ".bak").exists()
