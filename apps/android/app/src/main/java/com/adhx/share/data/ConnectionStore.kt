package com.adhx.share.data

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The ADHX this phone saves to, and the phone key it got when pairing. */
data class Connection(
    val server: String,
    val key: String,
    val username: String? = null,
    val phoneName: String? = null,
)

/**
 * Keeps the server address and phone key in EncryptedSharedPreferences (the
 * encryption key lives in the Android Keystore).
 */
class ConnectionStore private constructor(context: Context) {

    private val prefs: SharedPreferences = open(context)
    private val _connection = MutableStateFlow(read())
    val connection: StateFlow<Connection?> = _connection.asStateFlow()

    /** Set when the server said the key was removed, so Connect can say why. */
    private val _removedNotice = MutableStateFlow(false)
    val removedNotice: StateFlow<Boolean> = _removedNotice.asStateFlow()

    fun current(): Connection? = _connection.value

    fun save(connection: Connection) {
        prefs.edit()
            .putString(K_SERVER, connection.server)
            .putString(K_KEY, connection.key)
            .putString(K_USERNAME, connection.username)
            .putString(K_PHONE, connection.phoneName)
            .apply()
        _removedNotice.value = false
        _connection.value = connection
    }

    fun updateIdentity(username: String?, phoneName: String?) {
        val now = _connection.value ?: return
        save(now.copy(username = username ?: now.username, phoneName = phoneName ?: now.phoneName))
    }

    /** Forget the key. The server address stays, to fill in next time. */
    fun clear(removedByServer: Boolean = false) {
        prefs.edit()
            .remove(K_KEY)
            .remove(K_USERNAME)
            .remove(K_PHONE)
            .apply()
        _removedNotice.value = removedByServer
        _connection.value = null
    }

    /** The last server address used, for the "Type the address" field. */
    fun lastServer(): String? = prefs.getString(K_SERVER, null)

    private fun read(): Connection? {
        val server = prefs.getString(K_SERVER, null) ?: return null
        val key = prefs.getString(K_KEY, null) ?: return null
        return Connection(
            server = server,
            key = key,
            username = prefs.getString(K_USERNAME, null),
            phoneName = prefs.getString(K_PHONE, null),
        )
    }

    companion object {
        private const val FILE = "adhx_connection"
        private const val K_SERVER = "server"
        private const val K_KEY = "key"
        private const val K_USERNAME = "username"
        private const val K_PHONE = "phone_name"

        @Volatile
        private var instance: ConnectionStore? = null

        fun get(context: Context): ConnectionStore =
            instance ?: synchronized(this) {
                instance ?: ConnectionStore(context.applicationContext).also { instance = it }
            }

        private fun open(context: Context): SharedPreferences {
            return try {
                create(context)
            } catch (e: Exception) {
                // The keystore key can go missing (e.g. after a restore). Start
                // over rather than crash; the phone just has to pair again.
                Log.w("ConnectionStore", "Couldn't open the key store, starting fresh", e)
                context.deleteSharedPreferences(FILE)
                create(context)
            }
        }

        private fun create(context: Context): SharedPreferences {
            val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
            return EncryptedSharedPreferences.create(
                FILE,
                masterKeyAlias,
                context,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        }
    }
}
