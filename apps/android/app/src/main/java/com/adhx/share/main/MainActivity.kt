package com.adhx.share.main

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.ui.AdhxTheme

/** The host app: Connect, then "Shared lately" and Settings. */
class MainActivity : ComponentActivity() {

    private val vm: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) handlePairLink(intent)

        setContent {
            AdhxTheme {
                MainApp(vm)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handlePairLink(intent)
    }

    /** adhx://pair?server=…&code=… opened from the phone's camera or a browser. */
    private fun handlePairLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (intent.action == Intent.ACTION_VIEW && data.scheme.equals("adhx", ignoreCase = true)) {
            vm.pairFromLink(data.toString())
        }
    }
}

@Composable
private fun MainApp(vm: MainViewModel) {
    val connection by vm.connection.collectAsStateWithLifecycle()
    var showSettings by rememberSaveable { mutableStateOf(false) }

    val current = connection
    LaunchedEffect(current == null) {
        if (current == null) showSettings = false
    }

    when {
        current == null -> ConnectScreen(vm)
        showSettings -> {
            BackHandler { showSettings = false }
            SettingsScreen(vm = vm, connection = current, onBack = { showSettings = false })
        }
        else -> HomeScreen(vm = vm, connection = current, onSettings = { showSettings = true })
    }
}
