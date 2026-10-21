package com.adhx.share.main

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
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
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.alerts.LiveAlerts
import com.adhx.share.data.Connection
import com.adhx.share.data.HistoryItem
import com.adhx.share.data.ShareState
import com.adhx.share.doing.DoingScreen
import com.adhx.share.doing.DoingViewModel
import com.adhx.share.feed.ChannelScreen
import com.adhx.share.feed.FeedViewModel
import com.adhx.share.feed.HomeActions
import com.adhx.share.feed.HomeScreen
import com.adhx.share.feed.HomeTab
import com.adhx.share.feed.HomeHeader
import com.adhx.share.feed.newBadge
import com.adhx.share.feed.TunedInScreen
import com.adhx.share.library.BackTitleRow
import com.adhx.share.net.ChannelKind
import com.adhx.share.net.Saver
import com.adhx.share.library.BackBar
import com.adhx.share.library.LibraryViewModel
import com.adhx.share.library.LocalPip
import com.adhx.share.ui.LocalOrientation
import com.adhx.share.ui.OrientationHost
import com.adhx.share.library.PipHost
import com.adhx.share.library.PlayerScreen
import com.adhx.share.library.PostLinkScreen
import com.adhx.share.library.Route
import com.adhx.share.library.SavesHome
import com.adhx.share.library.SearchScreen
import com.adhx.share.net.ApiResult
import com.adhx.share.ui.AdhxTheme
import com.adhx.share.ui.SettingsCopy
import com.adhx.share.ui.openInAdhx
import com.adhx.share.ui.openUrl
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The host app: Connect, then home (New · Channels · Live), My saves,
 * channels, Live, Search, Shared lately and Settings.
 */
class MainActivity : ComponentActivity() {

    private val vm: MainViewModel by viewModels()
    private val library: LibraryViewModel by viewModels()
    private val feed: FeedViewModel by viewModels()
    private val doing: DoingViewModel by viewModels()
    private val people: PeopleViewModel by viewModels()
    private val pip by lazy { PipHost(this) }
    // Upright, except while a player with nothing over it says it may turn.
    private val orientation by lazy { OrientationHost { requestedOrientation = it } }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) handleLink(intent)
        pip.start()

        setContent {
            AdhxTheme {
                CompositionLocalProvider(LocalPip provides pip, LocalOrientation provides orientation) {
                    MainApp(vm, library, feed, doing, people)
                }
            }
        }
    }

    override fun onDestroy() {
        pip.stop()
        super.onDestroy()
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        pip.onUserLeaveHint()
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        pip.onModeChanged(isInPictureInPictureMode)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleLink(intent)
    }

    /**
     * adhx://pair?server=…&code=… from the phone's camera or a browser, or
     * adhx://post?platform=…&id=… (the share card's Open in ADHX), or
     * adhx://live?slug=… (a "now live" notification: Tune in).
     */
    private fun handleLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (intent.action != Intent.ACTION_VIEW || !data.scheme.equals("adhx", ignoreCase = true)) return
        when (data.host?.lowercase()) {
            "post" -> {
                val platform = data.getQueryParameter("platform")?.takeIf { it.isNotBlank() } ?: return
                val id = data.getQueryParameter("id")?.takeIf { it.isNotBlank() } ?: return
                library.openPostLink(platform, id)
            }
            "live" -> {
                val slug = data.getQueryParameter("slug")?.takeIf { it.isNotBlank() } ?: return
                val route = Route.TunedIn(slug)
                if (library.stack.lastOrNull() != route) library.open(route)
            }
            else -> vm.pairFromLink(data.toString())
        }
    }
}

@Composable
private fun MainApp(
    vm: MainViewModel,
    library: LibraryViewModel,
    feed: FeedViewModel,
    doing: DoingViewModel,
    people: PeopleViewModel,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val connection by vm.connection.collectAsStateWithLifecycle()
    val reach by vm.reach.collectAsStateWithLifecycle()
    val storageError by vm.storageError.collectAsStateWithLifecycle()
    LaunchedEffect(storageError) {
        storageError?.let { Toast.makeText(context, it, Toast.LENGTH_LONG).show() }
    }

    // While the app is in front, check the key: a removed one goes back to Connect.
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val resumed = lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    LaunchedEffect(resumed, connection?.key) {
        if (resumed && connection != null) vm.checkMe()
    }
    // "Tell me when it's live": while the app is open, look for groups that went live.
    LaunchedEffect(resumed, connection?.key) {
        val now = connection ?: return@LaunchedEffect
        while (resumed && LiveAlerts.wanted(context)) {
            LiveAlerts.check(context, now, foreground = true).forEach { alert ->
                Toast.makeText(context, LiveAlerts.inAppLine(alert), Toast.LENGTH_LONG).show()
            }
            delay(LiveAlerts.FOREGROUND_MS)
        }
    }

    val current = connection
    if (current == null) {
        ConnectScreen(vm)
        return
    }

    val peopleUi by people.ui.collectAsStateWithLifecycle()
    if (Welcome.pending) {
        BackHandler { Welcome.pending = false }
        ConnectedScreen(
            connection = current,
            people = people,
            onStart = { Welcome.pending = false },
        )
        return
    }
    BackHandler(enabled = library.stack.size > 1) { library.back() }
    val back = { library.back(); Unit }
    val route = library.stack.lastOrNull() ?: Route.Home

    // A face opens that person's saves; your own opens My saves.
    val openPerson: (Saver) -> Unit = { saver ->
        if (saver.isYou) {
            library.open(Route.MySaves)
        } else {
            library.open(Route.Channel(ChannelKind.FRIEND, saver.username, saver.label, saver.avatarUrl))
        }
    }

    key(route) {
        when (route) {
            Route.Home -> HomeScreen(
                feed = feed,
                library = library,
                connection = current,
                reach = reach,
                actions = HomeActions(
                    open = library::open,
                    openPerson = openPerson,
                    onSearch = { library.open(Route.Search) },
                    onSettings = { library.open(Route.Settings) },
                    onDoing = { library.open(Route.Doing) },
                    onPeople = { library.open(Route.People) },
                    onInvite = if (peopleUi.people?.canInvite != false) {
                        {
                            Toast.makeText(context, SettingsCopy.INVITE_NOTE, Toast.LENGTH_SHORT).show()
                            openInAdhx(context, current.server, "/settings#invite")
                        }
                    } else {
                        null
                    },
                ),
                doing = doing,
            )
            Route.MySaves -> SavesHome(
                vm = library,
                connection = current,
                reach = reach,
                bar = { BackTitleRow(com.adhx.share.ui.Copy.MY_SAVES, back) },
                onSaver = openPerson,
            )
            is Route.Channel -> ChannelScreen(
                feed = feed,
                route = route,
                server = current.server,
                onBack = back,
                onPlay = { library.open(Route.ChannelPlayer(it)) },
                onPlayNew = { library.open(Route.ChannelPlayer(0, onlyNew = true)) },
                onOpenPost = { platform, id -> library.open(Route.PostLink(platform, id)) },
                onOpenKept = { tag, title -> library.open(Route.Channel(ChannelKind.MINE, tag, title)) },
                // A channel sits under Channels: home's row with Channels lit, and a tab goes home to it.
                header = {
                    val feedUi by feed.feed.collectAsStateWithLifecycle()
                    HomeHeader(
                        tab = HomeTab.Channels,
                        onTab = { t ->
                            feed.tab = t
                            library.home()
                        },
                        onSettings = { library.open(Route.Settings) },
                        onSearch = { library.open(Route.Search) },
                        overMedia = false,
                        newBadge = newBadge(feedUi, feed.feedPage),
                    )
                },
            )
            is Route.ChannelPlayer -> {
                val channel by feed.channel.collectAsStateWithLifecycle()
                // "Play the 4 new" keeps the ones it started with, even as they turn seen.
                val posts = remember(channel.slug, channel.items.isEmpty()) { if (route.onlyNew) channel.fresh else channel.items }
                if (posts.isEmpty()) {
                    LaunchedEffect(Unit) { library.back() }
                } else {
                    PlayerScreen(
                        posts = posts,
                        server = current.server,
                        startIndex = route.start,
                        onPage = {},
                        topBar = { BackBar(back) },
                        onSaver = openPerson,
                    )
                }
            }
            is Route.TunedIn -> TunedInScreen(
                feed = feed,
                slug = route.slug,
                server = current.server,
                onBack = back,
                onSaver = openPerson,
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
                        onSaver = openPerson,
                    )
                }
            }
            Route.SharedLately -> SharedLatelyScreen(
                vm = vm,
                connection = current,
                onBack = back,
                onOpen = { item -> openShared(context, scope, library, current, item) },
            )
            is Route.PostLink -> PostLinkScreen(
                library = library,
                server = current.server,
                platform = route.platform,
                id = route.id,
                onBack = back,
            )
            is Route.Post -> PlayerScreen(
                posts = listOf(route.post),
                server = current.server,
                startIndex = 0,
                onPage = {},
                topBar = { BackBar(back) },
                onSaver = openPerson,
            )
            Route.Settings -> SettingsScreen(
                vm = vm,
                people = people,
                doing = doing,
                feed = feed,
                connection = current,
                actions = SettingsActions(
                    onBack = back,
                    onPeople = { library.open(Route.People) },
                    onDoing = { library.open(Route.Doing) },
                    onSharedLately = { library.open(Route.SharedLately) },
                ),
            )
            Route.People -> PeopleScreen(
                people = people,
                server = current.server,
                onBack = back,
                onPerson = openPerson,
            )
            Route.Doing -> DoingScreen(doing = doing, server = current.server, onBack = back)
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
