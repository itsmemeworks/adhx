package com.adhx.share.library

import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableLongStateOf

/** How the post on screen is playing. */
internal class Playback {
    var ready by mutableStateOf(false)
    // The shared player's surface keeps the last picture it drew, so the
    // video is only shown once this post's own first frame is in.
    var drawn by mutableStateOf(false)
    var paused by mutableStateOf(false)
    var problem by mutableStateOf<String?>(null)
    /** What kind of can't-play [problem] is, once known (boards 14.8, 14.9). */
    var trouble by mutableStateOf<Trouble?>(null)
    var positionMs by mutableLongStateOf(0L)
    var durationMs by mutableLongStateOf(0L)

    /** How far through it is, 0–1 (0 until the length is known). */
    val fraction: Float
        get() = if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f

    /** Decoder teardown must not erase the position needed when it comes back. */
    fun resetForPlayer(available: Boolean): Boolean {
        if (!available) return false
        ready = false
        drawn = false
        paused = false
        problem = null
        trouble = null
        positionMs = 0L
        durationMs = 0L
        return true
    }
}

/** A seek handle stays inside even a very narrow track at large text sizes. */
internal object SeekTrack {
    fun thumbCenter(fraction: Float, width: Float, radius: Float): Float {
        val w = width.coerceAtLeast(0f)
        val r = radius.coerceIn(0f, w / 2f)
        return (fraction.coerceIn(0f, 1f) * w).coerceIn(r, w - r)
    }
}
