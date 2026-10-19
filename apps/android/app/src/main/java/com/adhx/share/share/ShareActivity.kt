package com.adhx.share.share

import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.annotation.RequiresApi
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.adhx.share.main.MainActivity
import com.adhx.share.ui.AdhxTheme
import com.adhx.share.ui.openPostInApp
import java.util.function.Consumer

/**
 * The share target. Translucent, so the app you shared from shows behind
 * the card; it reads the link and hands it to [ShareViewModel]. On Android
 * 12+ the app behind is blurred (when the phone allows blur right now) and
 * the card is frosted glass; otherwise it's a plain dim and a darker card.
 */
class ShareActivity : ComponentActivity() {

    private val vm: ShareViewModel by viewModels()

    private var blurred by mutableStateOf(false)

    // Blur can come and go (battery saver, some power modes): follow it.
    private val blurListener: Consumer<Boolean>? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Consumer { on -> blur(on) } else null

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            window.addFlags(WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
        }
        blur(false)

        vm.start(sharedText(intent))

        setContent {
            AdhxTheme {
                ShareSheetScreen(
                    vm = vm,
                    frosted = blurred,
                    onFinish = {
                        finish()
                        // The sheet has already slid away; skip the window animation.
                        overridePendingTransition(0, 0)
                    },
                    onOpenInAdhx = { server, post ->
                        openPostInApp(this, server, post?.platform, post?.id, post?.openPath)
                    },
                    onOpenApp = {
                        startActivity(
                            Intent(this, MainActivity::class.java)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                        )
                    },
                )
            }
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) listenForBlur(true)
    }

    override fun onDetachedFromWindow() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) listenForBlur(false)
        super.onDetachedFromWindow()
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun listenForBlur(on: Boolean) {
        val listener = blurListener ?: return
        // Adding it calls it straight away with whether blur is on now.
        if (on) windowManager.addCrossWindowBlurEnabledListener(listener)
        else windowManager.removeCrossWindowBlurEnabledListener(listener)
    }

    /** A light dim over a blurred app, or a heavier dim where there's no blur. */
    private fun blur(on: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            window.attributes = window.attributes.apply {
                blurBehindRadius = if (on) (BLUR_DP * resources.displayMetrics.density).toInt() else 0
            }
        }
        window.setDimAmount(if (on) 0.25f else 0.5f)
        blurred = on
    }

    /** The shared text (EXTRA_TEXT), with the subject as a fallback some apps use. */
    private fun sharedText(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_SEND) return null
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
        return listOfNotNull(text, subject).joinToString("\n").ifBlank { null }
    }

    private companion object {
        const val BLUR_DP = 24
    }
}
