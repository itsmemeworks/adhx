package com.adhx.share.main

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.data.Connection
import com.adhx.share.data.HistoryItem
import com.adhx.share.data.ShareState
import com.adhx.share.library.BackBar
import com.adhx.share.library.LibraryViewModel
import com.adhx.share.library.PlayerScreen
import com.adhx.share.library.Route
import com.adhx.share.library.SavesHome
import com.adhx.share.library.SearchScreen
import com.adhx.share.net.ApiResult
import com.adhx.share.ui.AdhxTheme
import com.adhx.share.ui.openInAdhx
import com.adhx.share.ui.openUrl
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** The host app: Connect, then My saves (the player), Search, Shared lately and Settings. */
class MainActivity : ComponentActivity() {

    private val vm: MainViewModel by viewModels()
    private val library: LibraryViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) handlePairLink(intent)

        setContent {
            AdhxTheme {
                MainApp(vm, library)
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
private fun MainApp(vm: MainViewModel, library: LibraryViewModel) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val connection by vm.connection.collectAsStateWithLifecycle()
    val reach by vm.reach.collectAsStateWithLifecycle()

    // While the app is in front, check the key: a removed one goes back to Connect.
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val resumed = lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    LaunchedEffect(resumed, connection?.key) {
        if (resumed && connection != null) vm.checkMe()
    }

    val current = connection
    if (current == null) {
        ConnectScreen(vm)
        return
    }

    BackHandler(enabled = library.stack.size > 1) { library.back() }
    val back = { library.back(); Unit }
    val route = library.stack.lastOrNull() ?: Route.Saves

    key(route) {
        when (route) {
            Route.Saves -> SavesHome(
                vm = library,
                connection = current,
                reach = reach,
                onSearch = { library.open(Route.Search) },
                onSharedLately = { library.open(Route.SharedLately) },
                onSettings = { library.open(Route.Settings) },
            )
            Route.Search -> SearchScreen(
                vm = library,
                server = current.server,
                onBack = back,
                onOpen = { library.open(Route.SearchPlayer(it)) },
            )
            is Route.SearchPlayer -> {
                val results by library.search.collectAsStateWithLifecycle()
                if (results.items.isEmpty()) {
                    LaunchedEffect(Unit) { library.back() }
                } else {
                    PlayerScreen(
                        posts = results.items,
                        server = current.server,
                        startIndex = route.start,
                        onPage = library::onSearchPage,
                        topBar = { BackBar(back) },
                    )
                }
            }
            Route.SharedLately -> SharedLatelyScreen(
                vm = vm,
                connection = current,
                onBack = back,
                onOpen = { item -> openShared(context, scope, library, current, item) },
            )
            is Route.Post -> PlayerScreen(
                posts = listOf(route.post),
                server = current.server,
                startIndex = 0,
                onPage = {},
                topBar = { BackBar(back) },
            )
            Route.Settings -> SettingsScreen(vm = vm, connection = current, onBack = back)
        }
    }
}

/** A row of Shared lately: the post in the player once it's saved, else the link itself. */
private fun openShared(
    context: Context,
    scope: CoroutineScope,
    library: LibraryViewModel,
    connection: Connection,
    item: HistoryItem,
) {
    val platform = item.platform
    val id = item.postId
    if (item.state != ShareState.SAVED || platform == null || id == null) {
        openUrl(context, item.link)
        return
    }
    scope.launch {
        when (val result = library.post(platform, id)) {
            is ApiResult.Ok -> library.open(Route.Post(result.value))
            is ApiResult.Failed -> when {
                result.status == 401 -> Unit
                item.openPath != null -> openInAdhx(context, connection.server, item.openPath)
                else -> openUrl(context, item.link)
            }
            ApiResult.Offline ->
                Toast.makeText(context, LibraryViewModel.OFFLINE, Toast.LENGTH_SHORT).show()
        }
    }
}
