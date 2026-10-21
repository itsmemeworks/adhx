package com.adhx.share.feed

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.adhx.share.data.Connection
import com.adhx.share.data.ConnectionStore
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.ChannelsResponse
import com.adhx.share.net.FeedMode
import com.adhx.share.net.FormingMoment
import com.adhx.share.net.FriendNote
import com.adhx.share.net.LiveMoment
import com.adhx.share.net.LiveSaverUpdate
import com.adhx.share.net.LiveReaction
import com.adhx.share.net.MediaType
import com.adhx.share.net.PhonePost
import com.adhx.share.net.Saver
import com.adhx.share.ui.Copy
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

enum class HomeTab { New, Channels, Live }

data class FeedUi(
    val mode: String = FeedMode.NEW,
    val items: List<PhonePost> = emptyList(),
    val nextCursor: String? = null,
    /** No more pages to ask for. */
    val ended: Boolean = false,
    val caughtUp: Boolean = false,
    /** The server says there's nothing to see at all yet ("Nothing new yet."). */
    val nothingYet: Boolean = false,
    val loading: Boolean = false,
    val loadedOnce: Boolean = false,
    val error: String? = null,
    /** This server has no feed yet (404): home plays My saves instead. */
    val unavailable: Boolean = false,
    /** What the feed shows ([MediaType]): videos and photos unless you add words. */
    val types: Set<String> = MediaType.DEFAULT,
    /** Left out by the filter, as the server last said. */
    val hiddenByServer: Map<String, Int> = emptyMap(),
    /** Left out on the phone (a server that didn't filter them). */
    val hiddenHere: Map<String, Int> = emptyMap(),
) {
    /** What the filter is hiding, by type, for "4 text posts waiting". */
    val hidden: Map<String, Int>
        get() = MediaType.all.mapNotNull { t ->
            val n = (hiddenByServer[t] ?: 0) + (hiddenHere[t] ?: 0)
            if (n > 0 && t !in types) t to n else null
        }.toMap()
}

/** Channels → Reactions: posts with reactions you can see, newest reaction first (`/api/app/reacted`). */
data class ReactedUi(
    val items: List<PhonePost> = emptyList(),
    val nextOffset: Int? = 0,
    val loading: Boolean = false,
    val loadedOnce: Boolean = false,
    /** This server has no reactions feed yet: the row stays away. */
    val unavailable: Boolean = false,
) {
    /** Posts with reactions so far ("12 posts with reactions"): all of them once every page is in. */
    val count: Int get() = items.size
    val more: Boolean get() = nextOffset != null
}

data class ChannelsUi(
    val channels: ChannelsResponse = ChannelsResponse(),
    val loading: Boolean = false,
    val loadedOnce: Boolean = false,
    val error: String? = null,
    /** This server has no channels for the phone yet. */
    val unavailable: Boolean = false,
)

/** One channel, open: what it is, and its posts. */
data class ChannelUi(
    val kind: String = "",
    val slug: String = "",
    val title: String = "",
    /** A friend's channel: their face. */
    val person: Saver? = null,
    val size: Int = 0,
    val newCount: Int = 0,
    val items: List<PhonePost> = emptyList(),
    /** A friend's latest note, for the paper tile. */
    val note: FriendNote? = null,
    /** A group channel you've kept as one of yours ("Kept · Open"). */
    val kept: com.adhx.share.net.KeptChannel? = null,
    /** "Keep this channel" is on its way. */
    val keeping: Boolean = false,
    val loading: Boolean = false,
    val error: String? = null,
) {
    /** The posts marked New, in the channel's order ("Play the 4 new"). */
    val fresh: List<PhonePost> get() = items.filter { it.isNew }

    /** How many you haven't seen: the marks once they're in, else the overview's count. */
    val unseen: Int get() = if (items.any { it.isNew }) fresh.size else newCount
}

data class LiveUi(
    val moments: List<LiveMoment> = emptyList(),
    /** Groups not live yet ("1 more save to go live"). */
    val forming: List<FormingMoment> = emptyList(),
    val loading: Boolean = false,
    val loadedOnce: Boolean = false,
    val error: String? = null,
)

/** The moment you're tuned in to. */
data class TunedUi(
    val slug: String = "",
    val moment: LiveMoment? = null,
    val items: List<PhonePost> = emptyList(),
    val watchers: List<Saver> = emptyList(),
    val loadedOnce: Boolean = false,
    val error: String? = null,
    /** Posts that arrived while tuned in (the "new one, up next" note). */
    val arrived: Int = 0,
    /** The newest of them, for "Jo just saved one". */
    val arrival: PhonePost? = null,
)

/** A reaction floating up the screen while tuned in. [lane] (0–1) is where across it rises. */
data class Floating(
    val id: Long,
    val emoji: String?,
    val text: String?,
    val who: Saver?,
    val lane: Float,
    /** Wait this long before rising, so ones that came in one poll don't stack up. */
    val delayMs: Long = 0,
)

/**
 * The friends feed on the phone: New (and the other blend modes), Channels and
 * Live, plus which posts you've seen. Every endpoint here is newer than some
 * servers; a 404 shows the old home rather than an error.
 */
class FeedViewModel(app: Application) : AndroidViewModel(app) {

    private val store = ConnectionStore.get(app)
    private val prefs = FeedPrefs(app)

    var tab by mutableStateOf(HomeTab.New)

    /** The "What's in your feed" sheet is open. */
    var filterOpen by mutableStateOf(false)

    /** The page of the feed on screen, so the player comes back to it. */
    var feedPage = 0

    private val _feed = MutableStateFlow(FeedUi())
    val feed: StateFlow<FeedUi> = _feed.asStateFlow()

    private val _channels = MutableStateFlow(ChannelsUi())
    val channels: StateFlow<ChannelsUi> = _channels.asStateFlow()

    private val _reacted = MutableStateFlow(ReactedUi())
    val reacted: StateFlow<ReactedUi> = _reacted.asStateFlow()
    private var reactedJob: Job? = null

    private val _channel = MutableStateFlow(ChannelUi())
    val channel: StateFlow<ChannelUi> = _channel.asStateFlow()

    private val _live = MutableStateFlow(LiveUi())
    val live: StateFlow<LiveUi> = _live.asStateFlow()

    /** "Show less / more from …" (`/api/app/feed/weights`): username → -1 or 1. Null until read. */
    var weights by mutableStateOf<Map<String, Int>?>(null)
        private set

    /** The member whose weight is being changed. */
    var weightBusy by mutableStateOf<String?>(null)
        private set

    private val _tuned = MutableStateFlow(TunedUi())
    val tuned: StateFlow<TunedUi> = _tuned.asStateFlow()

    /** Reactions floating up the screen right now (yours, and new ones from the poll). */
    val floating = mutableStateListOf<Floating>()
    private var floatingId = 0L
    private val reactionsSeen = HashSet<String>()

    private val seen = SeenBatcher()
    private var feedJob: Job? = null
    private var flushJob: Job? = null
    private var channelJob: Job? = null

    init {
        store.connection
            .map { it?.server to it?.key }
            .distinctUntilChanged()
            .onEach { (server, key) ->
                feedJob?.cancel()
                channelJob?.cancel()
                flushJob?.cancel()
                if (server == null) prefs.clear()
                _feed.value = FeedUi(types = prefs.types)
                _channels.value = ChannelsUi()
                reactedJob?.cancel()
                _reacted.value = ReactedUi()
                _channel.value = ChannelUi()
                _live.value = LiveUi()
                _tuned.value = TunedUi()
                clearReactions()
                Privacy.clear()
                feedPage = 0
                tab = HomeTab.New
                filterOpen = false
                weights = null
                weightBusy = null
                if (server != null && key != null) {
                    loadMoreFeed()
                    syncTypes()
                }
            }
            .launchIn(viewModelScope)
    }

    // The feed

    fun loadMoreFeed() {
        val now = _feed.value
        if (now.loading || now.ended || now.unavailable) return
        val connection = store.current() ?: return
        val mode = now.mode
        val types = now.types
        _feed.value = now.copy(loading = true, error = null)
        feedJob = viewModelScope.launch {
            val result = AdhxApi(connection).feed(mode, now.nextCursor, types)
            val current = _feed.value
            if (current.mode != mode || current.types != types) return@launch
            _feed.value = when (result) {
                is ApiResult.Ok -> {
                    val had = current.items.mapTo(HashSet()) { it.key }
                    val page = result.value
                    val fresh = page.items.filter { it.key !in had }
                    // A server that ignores `types` still gets filtered here. A post
                    // someone sent you shows whatever its kind, as the server's New does.
                    val (shown, left) = fresh.partition { MediaType.of(it.kind) in types || it.sentToYou }
                    val hiddenHere = current.hiddenHere.toMutableMap()
                    left.forEach { val t = MediaType.of(it.kind); hiddenHere[t] = (hiddenHere[t] ?: 0) + 1 }
                    current.copy(
                        items = current.items + shown,
                        nextCursor = page.nextCursor,
                        // Also the end when a page brings nothing new, so it can't loop.
                        ended = page.nextCursor == null || page.caughtUp || fresh.isEmpty(),
                        caughtUp = page.caughtUp,
                        nothingYet = page.nothingYet && current.items.isEmpty() && shown.isEmpty(),
                        loading = false,
                        loadedOnce = true,
                        hiddenByServer = page.hidden.ifEmpty { current.hiddenByServer },
                        hiddenHere = hiddenHere,
                    )
                }
                is ApiResult.Failed -> {
                    signedOut(result, connection)
                    if (result.status == 404) {
                        current.copy(loading = false, loadedOnce = true, unavailable = true)
                    } else {
                        current.copy(loading = false, loadedOnce = true, error = result.message ?: Copy.FEED_CANT_LOAD)
                    }
                }
                ApiResult.Offline -> current.copy(loading = false, loadedOnce = true, error = OFFLINE)
            }
            // A page the filter mostly emptied: keep going while the player is near the end.
            val after = _feed.value
            if (result is ApiResult.Ok && !after.ended && after.items.size - feedPage <= NEAR_END) loadMoreFeed()
        }
    }

    /**
     * The feed filter from the sheet: [types] (at least one) and whose saves.
     * Starts the feed over once if either changed; the filter is kept on the
     * phone and, where the server can, on the server.
     */
    fun applyFilter(types: Set<String>, mode: String) {
        val now = _feed.value
        val clean = MediaType.clean(types)
        if (clean == now.types && mode == now.mode) return
        if (clean != now.types) saveTypes(clean)
        restart(mode, clean)
    }

    /** "Show them" on the caught-up page: add what the filter was hiding. */
    fun showHidden() {
        val now = _feed.value
        applyFilter(now.types + now.hidden.keys, now.mode)
    }

    private fun saveTypes(types: Set<String>) {
        prefs.types = types
        val connection = store.current() ?: return
        // Quietly not kept on a server without it yet: the phone remembers.
        viewModelScope.launch { AdhxApi(connection).setFeedTypes(types) }
    }

    /** The server's copy of the filter wins when it has one. */
    private fun syncTypes() {
        val connection = store.current() ?: return
        viewModelScope.launch {
            val result = AdhxApi(connection).feedTypes()
            if (result !is ApiResult.Ok || result.value.types.isEmpty()) return@launch
            val types = MediaType.clean(result.value.types)
            prefs.types = types
            if (types != _feed.value.types) restart(_feed.value.mode, types)
        }
    }

    private fun restart(mode: String, types: Set<String>) {
        seen.leaveStage(System.currentTimeMillis())
        flushSeen()
        feedJob?.cancel()
        feedPage = 0
        _feed.value = FeedUi(mode = mode, types = types)
        loadMoreFeed()
    }

    /** Start the feed over in [mode] ([FeedMode]): Watch it all again, or the Why sheet's switch. */
    fun setMode(mode: String) = restart(mode, _feed.value.types)

    fun reloadFeed() = setMode(_feed.value.mode)

    /** The player is at [page]: count what's left behind, fetch more near the end. */
    fun onFeedPage(page: Int) {
        feedPage = page
        val now = _feed.value
        seen.onStage(now.items.getOrNull(page)?.ref, page, System.currentTimeMillis())
        sendSeenSoon()
        if (now.error == null && page >= now.items.size - NEAR_END) loadMoreFeed()
    }

    /** Called a moment after a page settles: the post on stage may count as seen now. */
    fun tickSeen() {
        seen.tick(System.currentTimeMillis())
        sendSeenSoon()
    }

    /** The app is going to the background: send what's waiting now. */
    fun onPause() {
        seen.tick(System.currentTimeMillis())
        flushSeen()
    }

    private fun sendSeenSoon() {
        if (seen.waiting == 0) return
        if (seen.full) {
            flushSeen()
            return
        }
        if (flushJob?.isActive == true) return
        flushJob = viewModelScope.launch {
            delay(SeenBatcher.FLUSH_MS)
            flushSeen()
        }
    }

    private fun flushSeen() {
        val connection = store.current() ?: return
        val batch = seen.drain()
        if (batch.isEmpty() || !sendSeen) return
        viewModelScope.launch {
            when (val result = AdhxApi(connection).seen(batch)) {
                is ApiResult.Ok -> Unit
                // An older server without /seen: nothing to keep trying.
                is ApiResult.Failed -> if (result.status != 404 && result.status != 400) seen.failed(batch)
                ApiResult.Offline -> seen.failed(batch)
            }
        }
    }

    // Show less / more from …

    /** Read the weights once (Why this one asks); an older server (404) has none to show. */
    fun loadWeights() {
        if (weights != null) return
        val connection = store.current() ?: return
        viewModelScope.launch {
            val result = AdhxApi(connection).feedWeights()
            if (result is ApiResult.Ok) weights = result.value.weights
            else if (result is ApiResult.Failed) signedOut(result, connection)
        }
    }

    /**
     * More (1), less (-1) or back to normal (0) from [username]. Shown at once,
     * then the server's answer wins; a failure puts the old choice back.
     */
    fun setWeight(username: String, weight: Int) {
        val connection = store.current() ?: return
        val before = weights ?: emptyMap()
        weights = if (weight == 0) before - username else before + (username to weight)
        weightBusy = username
        viewModelScope.launch {
            val result = AdhxApi(connection).setFeedWeight(username, weight)
            weights = if (result is ApiResult.Ok) result.value.weights else before
            if (result is ApiResult.Failed) signedOut(result, connection)
            weightBusy = null
        }
    }

    // Channels

    fun loadChannels(force: Boolean = false) {
        val now = _channels.value
        if (now.loading || (now.loadedOnce && !force && now.error == null)) return
        val connection = store.current() ?: return
        _channels.value = now.copy(loading = true, error = null)
        viewModelScope.launch {
            val result = AdhxApi(connection).channels()
            _channels.value = when (result) {
                is ApiResult.Ok -> ChannelsUi(channels = result.value, loadedOnce = true)
                is ApiResult.Failed -> {
                    signedOut(result, connection)
                    if (result.status == 404) {
                        ChannelsUi(loadedOnce = true, unavailable = true)
                    } else {
                        _channels.value.copy(loading = false, loadedOnce = true, error = result.message ?: Copy.CHANNELS_CANT_LOAD)
                    }
                }
                ApiResult.Offline -> _channels.value.copy(loading = false, loadedOnce = true, error = OFFLINE)
            }
        }
    }

    /**
     * The Reactions row: its first page again ([force]: on every visit to
     * Channels, since reactions keep coming), else the next page.
     */
    fun loadReacted(force: Boolean = false) {
        val now = _reacted.value
        if (force) {
            if (now.loading && reactedJob?.isActive == true) return
        } else if (now.loading || now.nextOffset == null || now.unavailable) {
            return
        }
        val connection = store.current() ?: return
        val offset = if (force) 0 else now.nextOffset ?: return
        _reacted.value = now.copy(loading = true)
        reactedJob = viewModelScope.launch {
            val result = AdhxApi(connection).reacted(offset, REACTED_PAGE)
            val current = _reacted.value
            _reacted.value = when (result) {
                is ApiResult.Ok -> {
                    val page = result.value.items.filter { it.platform.isNotBlank() && it.id.isNotBlank() }
                    if (offset == 0) {
                        ReactedUi(items = page.distinctBy { it.key }, nextOffset = result.value.nextOffset, loadedOnce = true)
                    } else {
                        val had = current.items.mapTo(HashSet()) { it.key }
                        current.copy(
                            items = current.items + page.filter { it.key !in had },
                            nextOffset = result.value.nextOffset,
                            loading = false,
                            loadedOnce = true,
                        )
                    }
                }
                is ApiResult.Failed -> {
                    signedOut(result, connection)
                    current.copy(loading = false, loadedOnce = true, unavailable = result.status == 404 || current.unavailable,
                        nextOffset = if (offset == 0) current.nextOffset else null)
                }
                ApiResult.Offline -> current.copy(loading = false, loadedOnce = true)
            }
        }
    }

    /** The Reactions player is at [page]: fetch more near the end. */
    fun onReactedPage(page: Int) {
        val now = _reacted.value
        if (page >= now.items.size - 5) loadReacted()
    }

    /** Open a channel: [kind] is a [com.adhx.share.net.ChannelKind]. */
    fun openChannel(kind: String, slug: String, title: String, person: Saver? = null) {
        val now = _channel.value
        if (now.kind == kind && now.slug == slug && now.items.isNotEmpty()) return
        val friend = _channels.value.channels.friends.firstOrNull { it.username == slug }
        val size = when (kind) {
            com.adhx.share.net.ChannelKind.FRIEND -> friend?.size
            com.adhx.share.net.ChannelKind.GROUP -> _channels.value.channels.group.firstOrNull { it.slug == slug }?.size
            else -> _channels.value.channels.mine.firstOrNull { it.slug == slug }?.size
        } ?: 0
        _channel.value = ChannelUi(
            kind = kind,
            slug = slug,
            title = title,
            person = person ?: friend?.asSaver,
            size = size,
            newCount = friend?.newCount ?: _channels.value.channels.group.firstOrNull { it.slug == slug && kind == com.adhx.share.net.ChannelKind.GROUP }?.newCount ?: 0,
            loading = true,
        )
        loadChannel()
    }

    fun loadChannel() {
        val connection = store.current() ?: return
        val now = _channel.value
        if (now.slug.isBlank()) return
        _channel.value = now.copy(loading = true, error = null)
        channelJob?.cancel()
        channelJob = viewModelScope.launch {
            val result = AdhxApi(connection).channel(now.kind, now.slug)
            val current = _channel.value
            if (current.slug != now.slug || current.kind != now.kind) return@launch
            _channel.value = when (result) {
                is ApiResult.Ok -> current.copy(
                    items = result.value.items,
                    note = result.value.note,
                    kept = result.value.kept ?: current.kept,
                    size = current.size.takeIf { it > 0 } ?: result.value.items.size,
                    loading = false,
                )
                is ApiResult.Failed -> {
                    signedOut(result, connection)
                    current.copy(loading = false, error = if (result.status == 404) Copy.CHANNEL_EMPTY else result.message ?: Copy.CHANNELS_CANT_LOAD)
                }
                ApiResult.Offline -> current.copy(loading = false, error = OFFLINE)
            }
        }
    }

    /**
     * "Keep this channel" on a group channel: its posts become one of your
     * channels (saving the ones you hadn't). [onDone] gets what to say.
     */
    fun keepChannel(onDone: (String) -> Unit) {
        val connection = store.current() ?: return
        val now = _channel.value
        if (now.kind != com.adhx.share.net.ChannelKind.GROUP || now.keeping || now.kept != null) return
        _channel.value = now.copy(keeping = true)
        viewModelScope.launch {
            val result = AdhxApi(connection).keepGroupChannel(now.slug)
            val current = _channel.value
            val same = current.slug == now.slug && current.kind == now.kind
            when (result) {
                is ApiResult.Ok -> {
                    val kept = com.adhx.share.net.KeptChannel(result.value.tag.ifBlank { now.slug }, result.value.url)
                    if (same) _channel.value = current.copy(keeping = false, kept = kept)
                    // It's one of yours now: Channels lists it next time.
                    loadChannels(force = true)
                    onDone(Copy.keptCount(result.value.added))
                }
                is ApiResult.Failed -> {
                    signedOut(result, connection)
                    if (same) _channel.value = current.copy(keeping = false)
                    onDone(result.message?.takeIf { it.isNotBlank() } ?: Copy.KEEP_FAILED)
                }
                ApiResult.Offline -> {
                    if (same) _channel.value = current.copy(keeping = false)
                    onDone(OFFLINE)
                }
            }
        }
    }

    // Live

    /** The forming group whose bell is being changed. */
    var alertBusy by mutableStateOf<String?>(null)
        private set

    /**
     * Ring the bell on a forming group ("Tell me when it's live"), or stop.
     * Shown at once; a failure puts it back, and a group that's gone drops
     * from the list. [onDone] gets what to say.
     */
    fun setAlert(id: String, on: Boolean, onDone: (String) -> Unit) {
        val connection = store.current() ?: return
        val forming = _live.value.forming.firstOrNull { it.id == id } ?: return
        if (alertBusy != null || id.isBlank()) return
        fun mark(value: Boolean) {
            _live.value = _live.value.copy(forming = _live.value.forming.map { if (it.id == id) it.copy(alert = value) else it })
        }
        mark(on)
        alertBusy = id
        viewModelScope.launch {
            when (val result = AdhxApi(connection).setFormingAlert(id, on)) {
                is ApiResult.Ok -> {
                    mark(result.value.alert)
                    if (result.value.alert) com.adhx.share.alerts.LiveAlerts.want(getApplication())
                    onDone(if (result.value.alert) Copy.willTell(forming.title) else Copy.WONT_TELL)
                }
                is ApiResult.Failed -> {
                    signedOut(result, connection)
                    if (result.status == 404) {
                        _live.value = _live.value.copy(forming = _live.value.forming.filterNot { it.id == id })
                        onDone(Copy.FORMING_GONE)
                    } else {
                        mark(forming.alert)
                        onDone(result.message?.takeIf { it.isNotBlank() } ?: Copy.ALERT_FAILED)
                    }
                }
                ApiResult.Offline -> {
                    mark(forming.alert)
                    onDone(OFFLINE)
                }
            }
            alertBusy = null
        }
    }

    fun loadLive() {
        val now = _live.value
        if (now.loading) return
        val connection = store.current() ?: return
        _live.value = now.copy(loading = true, error = null)
        viewModelScope.launch {
            val result = AdhxApi(connection).live()
            _live.value = when (result) {
                is ApiResult.Ok -> {
                    // A bell being changed keeps the state shown until the server answers.
                    val busy = alertBusy
                    val shown = _live.value.forming.firstOrNull { it.id == busy }?.alert
                    val forming = result.value.forming.map { if (busy != null && it.id == busy && shown != null) it.copy(alert = shown) else it }
                    LiveUi(moments = result.value.moments, forming = forming, loadedOnce = true)
                }
                is ApiResult.Failed -> {
                    signedOut(result, connection)
                    // No Live on this server yet: nothing's live, as far as the phone can tell.
                    if (result.status == 404) LiveUi(loadedOnce = true) else _live.value.copy(loading = false, loadedOnce = true, error = result.message ?: Copy.LIVE_CANT_LOAD)
                }
                ApiResult.Offline -> _live.value.copy(loading = false, loadedOnce = true, error = OFFLINE)
            }
        }
    }

    /** Tune in to [slug]: shows what's known from the list straight away. */
    fun tuneIn(slug: String) {
        if (_tuned.value.slug == slug && _tuned.value.loadedOnce) return
        val known = _live.value.moments.firstOrNull { it.slug == slug }
        clearReactions()
        _tuned.value = TunedUi(slug = slug, moment = known, watchers = known?.watchers.orEmpty())
    }

    /**
     * Ask for the moment again (every ~5 s while tuned in). New posts join the
     * end, so the one playing never moves.
     */
    private var tunedPlayingKey: String? = null

    fun playingTuned(post: PhonePost?) { tunedPlayingKey = post?.key }

    suspend fun pollTuned(session: String? = null) {
        val connection = store.current() ?: return
        val slug = _tuned.value.slug.takeIf { it.isNotBlank() } ?: return
        val result = AdhxApi(connection).liveMoment(slug, session, _tuned.value.items.map { it.key })
        val current = _tuned.value
        if (current.slug != slug) return
        _tuned.value = when (result) {
            is ApiResult.Ok -> {
                val detail = result.value
                arrive(detail.reactions)
                val had = current.items.mapTo(HashSet()) { it.key }
                val fresh = detail.items.filter { it.key !in had }
                // Keep each post's newest savers (someone else may have saved it meanwhile).
                current.copy(
                    moment = detail.moment ?: current.moment,
                    items = mergeLivePosts(current.items, detail.items, detail.removedKeys.toSet(), tunedPlayingKey, detail.saverUpdates.associate { it.key to it }),
                    watchers = detail.watchers ?: detail.moment?.watchers?.takeIf { it.isNotEmpty() } ?: current.watchers,
                    loadedOnce = true,
                    error = null,
                    arrived = if (current.loadedOnce && fresh.isNotEmpty()) current.arrived + fresh.size else current.arrived,
                    arrival = if (current.loadedOnce && fresh.isNotEmpty()) fresh.last() else current.arrival,
                )
            }
            is ApiResult.Failed -> {
                signedOut(result, connection)
                current.copy(items = if (result.status == 404 || result.status == 401) emptyList() else current.items, watchers = emptyList(), loadedOnce = true, error = if (result.status == 404) Copy.LIVE_ENDED else result.message ?: Copy.LIVE_CANT_LOAD)
            }
            ApiResult.Offline -> current.copy(loadedOnce = true, error = if (current.items.isEmpty()) OFFLINE else null)
        }
    }

    suspend fun leaveTuned(slug: String, session: String) {
        val connection = store.current() ?: return
        AdhxApi(connection).leaveLive(slug, session)
    }

    fun seenArrivals() {
        if (_tuned.value.arrived != 0) _tuned.value = _tuned.value.copy(arrived = 0, arrival = null)
    }

    /**
     * React to [post] in the moment you're tuned in to: an emoji, or a few
     * words. Yours floats only after acknowledgement; false keeps the draft for retry.
     */
    suspend fun react(post: PhonePost, emoji: String? = null, text: String? = null): Boolean {
        val connection = store.current() ?: return false
        val slug = _tuned.value.slug.takeIf { it.isNotBlank() } ?: return false
        val words = text?.trim()?.let(com.adhx.share.net.Reaction::clip)?.takeIf { it.isNotEmpty() }
        if (emoji == null && words == null) return false
        val me = Saver(username = connection.username ?: "you", name = Copy.YOU, avatarUrl = connection.avatarUrl, isYou = true)
        val sent = AdhxApi(connection).react(slug, post.platform, post.id, emoji = emoji, text = words) is ApiResult.Ok
        if (sent) float(emoji, words, me)
        return sent
    }

    /** A floating reaction has finished. */
    fun landed(id: Long) {
        floating.removeAll { it.id == id }
    }

    /**
     * Reactions from the poll (the server sends the last 15 s, oldest first)
     * float up once each, by id. Yours were shown when you sent them.
     */
    private fun arrive(reactions: List<LiveReaction>) {
        if (reactionsSeen.size > 1000) reactionsSeen.retainAll(reactions.map { it.key }.toSet())
        val fresh = reactions.filter { reactionsSeen.add(it.key) }
        fresh.filterNot { it.who?.isYou == true }.takeLast(MAX_FLOATING)
            .forEachIndexed { i, r -> float(r.emoji, r.text, r.who, delayMs = i * STAGGER_MS) }
    }

    private fun float(emoji: String?, text: String?, who: Saver?, delayMs: Long = 0) {
        if (floating.size >= MAX_FLOATING) floating.removeAt(0)
        floatingId += 1
        // Spread them across: the golden ratio keeps neighbours apart.
        val lane = ((floatingId * 0.618034) % 1.0).toFloat()
        floating.add(Floating(floatingId, emoji, text, who, lane, delayMs))
    }

    private fun clearReactions() {
        floating.clear()
        reactionsSeen.clear()
    }

    private fun signedOut(result: ApiResult.Failed, connection: Connection) {
        if (result.status == 401 || result.code == "bad_key") {
            store.clear(removedByServer = true, expected = connection)
        }
    }

    companion object {
        /** Debug builds can turn this off to look around a test server without marking anything seen. */
        @Volatile
        var sendSeen: Boolean = true

        private const val NEAR_END = 5
        private const val MAX_FLOATING = 12

        /** Between reactions that arrived together (the poll is every 5 s). */
        private const val STAGGER_MS = 700L
        private const val OFFLINE = "Can’t reach your ADHX right now."
        private const val REACTED_PAGE = 30
    }
}


/** Refresh metadata in place; only explicit removal drops a cached post. Preserve the playing key under the cap. */
internal fun mergeLivePosts(current: List<PhonePost>, fresh: List<PhonePost>, removed: Set<String>, playing: String?, saverUpdates: Map<String, LiveSaverUpdate> = emptyMap()): List<PhonePost> {
    val byKey = fresh.associateBy { it.key }
    val have = current.mapTo(HashSet()) { it.key }
    val merged = current.filterNot { it.key in removed }.map { cached -> byKey[cached.key] ?: saverUpdates[cached.key]?.let { cached.copy(savers = it.savers, isPrivate = it.isPrivate) } ?: cached } + fresh.filter { it.key !in have && it.key !in removed }
    if (merged.size <= 200) return merged
    val index = merged.indexOfFirst { it.key == playing }.coerceAtLeast(0)
    val start = (index - 60).coerceIn(0, merged.size - 200)
    return merged.subList(start, start + 200)
}
