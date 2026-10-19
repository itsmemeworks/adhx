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

    private var privateState by mutableStateOf(readPrivate())
    private var soundState by mutableStateOf(prefs.getBoolean(K_SOUND, false))

    /** New saves from this phone start "Just for me". Null: never set here. */
    var privateDefault: Boolean?
        get() = privateState
        set(value) {
            prefs.edit().apply { if (value == null) remove(K_PRIVATE) else putBoolean(K_PRIVATE, value) }.apply()
            privateState = value
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

    private fun readPrivate(): Boolean? = if (prefs.contains(K_PRIVATE)) prefs.getBoolean(K_PRIVATE, false) else null

    companion object {
        private const val FILE = "settings"
        private const val K_PRIVATE = "private_default"
        private const val K_SOUND = "sound_on"

        @Volatile
        private var instance: SettingsPrefs? = null

        fun get(context: Context): SettingsPrefs =
            instance ?: synchronized(this) {
                instance ?: SettingsPrefs(context.applicationContext).also { instance = it }
            }
    }
}
