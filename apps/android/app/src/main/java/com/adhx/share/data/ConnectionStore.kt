package com.adhx.share.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/** AES-GCM record in noBackupFilesDir, with a non-exportable Android Keystore key. */
class ConnectionStore private constructor(context: Context) {
    private val vault = ConnectionVault(
        AndroidVaultFile(File(context.noBackupFilesDir, "connection-v1.enc")),
        ::keystoreKey,
        LegacyPreferences(context),
    ).apply { load() }
    private val _connection = MutableStateFlow(vault.record.connection)
    val connection: StateFlow<Connection?> = _connection.asStateFlow()
    private val _allowLegacyHistory = MutableStateFlow(vault.record.allowLegacyHistory)
    internal val allowLegacyHistory: StateFlow<Boolean> = _allowLegacyHistory.asStateFlow()
    private val _storageError = MutableStateFlow(vault.error)
    val storageError: StateFlow<String?> = _storageError.asStateFlow()
    private val _removedNotice = MutableStateFlow(false)
    val removedNotice: StateFlow<Boolean> = _removedNotice.asStateFlow()

    fun current(): Connection? = _connection.value

    @Synchronized
    fun save(connection: Connection): Boolean = persist(vault.record.pairedWith(connection)).also {
        if (it) _removedNotice.value = false
    }

    @Synchronized
    fun updateIdentity(expected: Connection, username: String?, phoneName: String?) {
        val next = vault.record.identityUpdated(expected, username, phoneName)
        if (next != vault.record) persist(next)
    }

    /** Forget only after a durable tombstone prevents re-importing legacy credentials. */
    @Synchronized
    fun clear(removedByServer: Boolean = false, expected: Connection? = null): Boolean {
        if (expected != null && !expected.sameCredential(current())) return false
        return persist(ConnectionRecord(lastServer = vault.record.lastServer, allowLegacyHistory = false)).also {
            if (it) _removedNotice.value = removedByServer
        }
    }

    fun lastServer(): String? = vault.record.lastServer
    internal fun changesAccount(next: Connection): Boolean = vault.record.changesAccount(next)
    internal fun ownsHistory(item: HistoryItem, connection: Connection): Boolean =
        item.belongsTo(connection, vault.record.allowLegacyHistory)

    private fun persist(next: ConnectionRecord): Boolean {
        val saved = vault.write(next)
        _storageError.value = vault.error
        if (saved) {
            _allowLegacyHistory.value = vault.record.allowLegacyHistory
            _connection.value = vault.record.connection
        }
        return saved
    }

    companion object {
        private const val KEY_ALIAS = "adhx.phone-connection.v1"
        @Volatile private var instance: ConnectionStore? = null
        fun get(context: Context): ConnectionStore = instance ?: synchronized(this) {
            instance ?: ConnectionStore(context.applicationContext).also { instance = it }
        }

        private fun keystoreKey(create: Boolean): SecretKey {
            val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
            check(create) { "Connection key unavailable" }
            return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
                init(KeyGenParameterSpec.Builder(KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .setRandomizedEncryptionRequired(true)
                    .build())
            }.generateKey()
        }
    }
}

private class AndroidVaultFile(private val file: File) : VaultFile {
    private val atomic = AtomicFile(file)
    override fun read(): ByteArray? {
        if (!recoverableFileExists(file)) return null
        return atomic.openRead().use {
            val output = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(1024)
            while (true) {
                val count = it.read(buffer)
                if (count == -1) break
                require(output.size() + count <= ConnectionVault.MAX_BYTES)
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        }
    }
    override fun write(bytes: ByteArray) {
        val stream = atomic.startWrite()
        try {
            stream.write(bytes)
            atomic.finishWrite(stream)
        } catch (e: Exception) {
            atomic.failWrite(stream)
            throw e
        }
    }
}

/** Deprecated library is read only, retained solely to migrate already paired installations. */
@Suppress("DEPRECATION")
private class LegacyPreferences(private val context: Context) : LegacyConnection {
    override fun read(): ConnectionRecord? {
        if (!recoverableFileExists(File(context.applicationInfo.dataDir, "shared_prefs/$FILE.xml"))) return null
        check(KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            .containsAlias(MasterKey.DEFAULT_MASTER_KEY_ALIAS))
        val prefs = EncryptedSharedPreferences.create(FILE,
            MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC), context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
        val server = prefs.getString("server", null) ?: return null
        val key = prefs.getString("key", null)
        val username = prefs.getString("username", null)
        return ConnectionRecord(key?.let { Connection(server, it,
            username, prefs.getString("phone_name", null)) }, server,
            allowLegacyHistory = key != null && !username.isNullOrBlank())
    }
    override fun remove() { context.deleteSharedPreferences(FILE) }
    private companion object { const val FILE = "adhx_connection" }
}
