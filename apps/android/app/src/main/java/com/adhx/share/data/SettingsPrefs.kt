package com.adhx.share.data

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Settings kept on this phone: "Just for me by default" and "Sound on by
 * default". There's no phone route for the account's own "Just for me by
 * default" yet, so the phone keeps its own: until it's touched here, saves
 * leave `private` out and the account's default on the server applies.
 */
class SettingsPrefs private constructor(context: Context) {
    private val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    private val store = ConnectionStore.get(context)

    private var privateState by mutableStateOf(readPrivate())
    private var soundState by mutableStateOf(prefs.getBoolean(K_SOUND, false))

    /** New saves from this phone start "Just for me". Null: never set here. */
    var privateDefault: Boolean?
        get() = privateState.forAccount(store.current(), store.allowLegacyHistory.value)
        set(value) {
            val next = PrivateDefault.capture(value, store.current())
            // Choice and ownership share one atomic preferences edit. If it never reaches disk,
            // old-owner/legacy values still fail closed against the durable connection record.
            prefs.edit().apply {
                if (next.value == null) remove(K_PRIVATE) else putBoolean(K_PRIVATE, next.value)
                putString(K_PRIVATE_SERVER, next.server)
                putString(K_PRIVATE_USERNAME, next.username)
            }.apply()
            privateState = next
        }

    /** Videos start with sound (they start muted otherwise). */
    var soundOn: Boolean
        get() = soundState
        set(value) {
            prefs.edit().putBoolean(K_SOUND, value).apply()
            soundState = value
        }

    /** A different ADHX: its own default applies again. */
    fun forgetAccount() {
        privateDefault = null
    }

    private fun readPrivate() = PrivateDefault(
        value = if (prefs.contains(K_PRIVATE)) prefs.getBoolean(K_PRIVATE, false) else null,
        server = prefs.getString(K_PRIVATE_SERVER, null),
        username = prefs.getString(K_PRIVATE_USERNAME, null),
    )

    companion object {
        private const val FILE = "settings"
        private const val K_PRIVATE = "private_default"
        private const val K_PRIVATE_SERVER = "private_default_server"
        private const val K_PRIVATE_USERNAME = "private_default_username"
        private const val K_SOUND = "sound_on"

        @Volatile
        private var instance: SettingsPrefs? = null

        fun get(context: Context): SettingsPrefs =
            instance ?: synchronized(this) {
                instance ?: SettingsPrefs(context.applicationContext).also { instance = it }
            }
    }
}
