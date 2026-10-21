package com.adhx.share.ui

import android.content.pm.ActivityInfo
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember

/**
 * The app is upright everywhere except while media is playing full screen:
 * each player on screen says it may turn ([MayTurn]), anything put over it (a
 * sheet, the React picker, the reader) says upright ([KeepUpright]), and the
 * newest say wins. With nobody saying anything it's upright. [request]
 * sets the activity's requested orientation.
 */
class OrientationHost(private val request: (Int) -> Unit) {
    private var requested: Int? = null
    private val says = LinkedHashMap<Long, Boolean>()
    private var next = 0L

    init {
        apply()
    }

    /** Start saying [mayTurn]; returns the token to change or stop it with. */
    fun push(mayTurn: Boolean): Long {
        next += 1
        says[next] = mayTurn
        apply()
        return next
    }

    /** Change what [token] says, keeping its place. */
    fun set(token: Long, mayTurn: Boolean) {
        if (token !in says || says[token] == mayTurn) return
        says[token] = mayTurn
        apply()
    }

    fun pop(token: Long) {
        if (says.remove(token) != null) apply()
    }

    private fun apply() {
        val want = orientationFor(says.values.toList())
        if (requested != want) {
            requested = want
            request(want)
        }
    }
}

/**
 * What the screen may do, from what's on it (oldest first): turn with the
 * phone ([ActivityInfo.SCREEN_ORIENTATION_USER]: sideways either way, never
 * upside down, and only with the phone's own rotation unlocked) when the
 * newest says so, else upright.
 */
internal fun orientationFor(says: List<Boolean>): Int =
    if (says.lastOrNull() == true) ActivityInfo.SCREEN_ORIENTATION_USER else ActivityInfo.SCREEN_ORIENTATION_PORTRAIT

/** The activity's [OrientationHost]; null where nothing may turn (the share sheet). */
val LocalOrientation = compositionLocalOf<OrientationHost?> { null }

/**
 * Says whether the screen may turn while this is on screen ([mayTurn] can
 * change without losing its place), and stops saying it when it goes.
 */
@Composable
fun MayTurn(mayTurn: Boolean) {
    val host = LocalOrientation.current ?: return
    // Pushed once when it arrives (so things put over it later are newer), then updated in place.
    val token = remember(host) { longArrayOf(0L) }
    DisposableEffect(host) {
        token[0] = host.push(mayTurn)
        onDispose { host.pop(token[0]) }
    }
    SideEffect { if (token[0] != 0L) host.set(token[0], mayTurn) }
}

/** Keeps the screen upright while this is on screen (a sheet, a picker, the reader). */
@Composable
fun KeepUpright() = MayTurn(false)
