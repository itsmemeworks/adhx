package com.adhx.share.share

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.adhx.share.main.MainActivity
import com.adhx.share.ui.AdhxTheme
import com.adhx.share.ui.openInAdhx

/**
 * The share target. Translucent, so the app you shared from shows behind
 * the sheet; it reads the link and hands it to [ShareViewModel].
 */
class ShareActivity : ComponentActivity() {

    private val vm: ShareViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)

        vm.start(sharedText(intent))

        setContent {
            AdhxTheme {
                ShareSheetScreen(
                    vm = vm,
                    onFinish = {
                        finish()
                        // The sheet has already slid away; skip the window animation.
                        overridePendingTransition(0, 0)
                    },
                    onOpenInAdhx = { server, path -> openInAdhx(this, server, path) },
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

    /** The shared text (EXTRA_TEXT), with the subject as a fallback some apps use. */
    private fun sharedText(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_SEND) return null
        val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
        return listOfNotNull(text, subject).joinToString("\n").ifBlank { null }
    }
}
