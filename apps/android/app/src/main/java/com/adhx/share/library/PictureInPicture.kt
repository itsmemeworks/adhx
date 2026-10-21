package com.adhx.share.library

import android.app.Activity
import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Rational
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.core.content.ContextCompat
import com.adhx.share.R

/** What the player offers the small window while a video is on screen. */
data class PipControls(
    val aspect: Rational,
    val playing: Boolean,
    val previous: () -> Unit,
    val next: () -> Unit,
    val togglePlay: () -> Unit,
)

/**
 * The small window (picture-in-picture) for videos, owned by MainActivity.
 * The player [offer]s controls while a video is on screen; the window then
 * opens from the player's button, or by itself when you leave the app while
 * it plays. Its buttons move the player to the previous or next save and
 * play or pause.
 */
class PipHost(private val activity: Activity) {

    /** The app is showing as a small window: the player shows only the video. */
    var inPip by mutableStateOf(false)
        private set

    private var controls: PipControls? = null

    val supported: Boolean =
        activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val c = controls ?: return
            when (intent.action) {
                PREVIOUS -> c.previous()
                NEXT -> c.next()
                TOGGLE -> c.togglePlay()
            }
        }
    }

    fun start() {
        val filter = IntentFilter().apply {
            addAction(PREVIOUS)
            addAction(NEXT)
            addAction(TOGGLE)
        }
        ContextCompat.registerReceiver(activity, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    fun stop() {
        activity.unregisterReceiver(receiver)
    }

    /** A video is on screen (or null: nothing that can go in a small window). */
    fun offer(controls: PipControls?) {
        this.controls = controls
        if (supported) activity.setPictureInPictureParams(params())
    }

    /** The player's button. */
    fun enter() {
        if (supported && controls != null) activity.enterPictureInPictureMode(params())
    }

    /** Below Android 12 there's no auto-enter: leaving the app asks here. */
    fun onUserLeaveHint() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && controls?.playing == true) enter()
    }

    fun onModeChanged(inPictureInPicture: Boolean) {
        inPip = inPictureInPicture
    }

    private fun params(): PictureInPictureParams {
        val c = controls
        val builder = PictureInPictureParams.Builder()
        if (c != null) {
            builder.setAspectRatio(c.aspect)
            builder.setActions(
                listOf(
                    action(PREVIOUS, R.drawable.ic_pip_previous, "Previous save"),
                    if (c.playing) action(TOGGLE, R.drawable.ic_pip_pause, "Pause") else action(TOGGLE, R.drawable.ic_pip_play, "Play"),
                    action(NEXT, R.drawable.ic_pip_next, "Next save"),
                ),
            )
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(c?.playing == true)
            builder.setSeamlessResizeEnabled(true)
        }
        return builder.build()
    }

    private fun action(name: String, icon: Int, label: String): RemoteAction {
        val intent = Intent(name).setPackage(activity.packageName)
        val pending = PendingIntent.getBroadcast(
            activity,
            name.hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return RemoteAction(Icon.createWithResource(activity, icon), label, label, pending)
    }

    companion object {
        private const val PREVIOUS = "com.adhx.share.pip.PREVIOUS"
        private const val NEXT = "com.adhx.share.pip.NEXT"
        private const val TOGGLE = "com.adhx.share.pip.TOGGLE"

        /** Keep a ratio Android accepts for the window (between 1:2.39 and 2.39:1). */
        fun aspect(width: Double?, height: Double?): Rational {
            if (width == null || height == null || width <= 0 || height <= 0) return Rational(16, 9)
            val ratio = (width / height).coerceIn(1 / 2.39 + 0.01, 2.39 - 0.01)
            return Rational((ratio * 1000).toInt(), 1000)
        }
    }
}

/** The activity's small-window host, for the player. Null where there isn't one. */
val LocalPip = staticCompositionLocalOf<PipHost?> { null }
