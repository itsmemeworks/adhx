package com.adhx.share.library

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.view.LayoutInflater
import android.widget.Toast
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import androidx.media3.ui.AspectRatioFrameLayout
import coil3.compose.AsyncImage
import com.adhx.share.R
import com.adhx.share.links.Links
import com.adhx.share.links.Networks
import com.adhx.share.net.AdhxApi
import com.adhx.share.feed.Privacy
import com.adhx.share.feed.FloatingReactions
import com.adhx.share.feed.ReactPicker
import com.adhx.share.data.ConnectionStore
import com.adhx.share.net.ApiResult
import com.adhx.share.data.SettingsPrefs
import com.adhx.share.net.PhonePost
import com.adhx.share.net.PostKind
import com.adhx.share.net.Saver
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.Faces
import com.adhx.share.ui.PrivateLock
import com.adhx.share.ui.rememberReducedMotion
import com.adhx.share.ui.NetworkMark
import com.adhx.share.ui.SansFamily
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.Spinner
import com.adhx.share.ui.openUrl
import com.adhx.share.ui.rememberLinked
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** How the post on screen is playing. */
private class Playback {
    var ready by mutableStateOf(false)
    // The shared player's surface keeps the last picture it drew, so the
    // video is only shown once this post's own first frame is in.
    var drawn by mutableStateOf(false)
    var paused by mutableStateOf(false)
    var problem by mutableStateOf<String?>(null)
    var positionMs by mutableLongStateOf(0L)
    var durationMs by mutableLongStateOf(0L)

    /** How far through it is, 0–1 (0 until the length is known). */
    val fraction: Float
        get() = if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f

    fun reset() {
        ready = false
        drawn = false
        paused = false
        problem = null
        positionMs = 0L
        durationMs = 0L
    }
}

/** A short line near the top ("Repeating this one", "Saved to your phone"). */
private data class Notice(val text: String, val at: Long = System.nanoTime())

/** A soft dark shadow, only for words laid over a picture or video. */
private val OverMedia = TextStyle(fontFamily = SansFamily, shadow = Shadow(Color.Black.copy(alpha = 0.6f), Offset(0f, 1f), 6f))

/**
 * The player: one post at a time, full screen. Swipe up for the next save,
 * down for the previous; tap to pause or play. One ExoPlayer is shared by
 * every page and plays the page the pager settled on. Videos start muted (or
 * with sound, under Settings → Sound on by default); with
 * Repeat off a video that ends moves on to the next save, with Repeat on it
 * loops. Hide clears everything but a thin progress line until the next tap.
 * [posts] must not be empty unless there is an [end] page.
 *
 * The friends feed adds to it: [onSaver] makes the faces on the byline open
 * that person's channel; [aboveCaption] and [belowCaption] put something
 * over the post (the why chip, the live reactions); [end] is one last page
 * after the posts (You're all caught up). React sits at the top of the
 * button column on every post: [onReact] hands it to Live's room ([reacting]
 * lights it while Live's picker is open); without it the player has its own
 * picker, keeps reactions on the post and replays the kept ones when a post
 * settles ([PostReactionsMemory], once per post per run of the app).
 */
@Composable
fun PlayerScreen(
    posts: List<PhonePost>,
    server: String,
    startIndex: Int,
    onPage: (Int) -> Unit,
    topBar: @Composable BoxScope.() -> Unit,
    newOnTop: Int = 0,
    onTop: () -> Unit = {},
    onSaver: ((Saver) -> Unit)? = null,
    aboveCaption: (@Composable (PhonePost) -> Unit)? = null,
    belowCaption: (@Composable (PhonePost) -> Unit)? = null,
    end: (@Composable () -> Unit)? = null,
    onReact: ((PhonePost) -> Unit)? = null,
    reacting: Boolean = false,
    /** Live privacy/metadata refreshes keep the keyed page rather than jumping to New's top. */
    preservePlaybackOnRefresh: Boolean = false,
    /** [topBar] steps aside while the send sheet is up (home's row, as on iPhone). */
    hideTopBarWhileSending: Boolean = false,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val pageCount = posts.size + if (end != null) 1 else 0
    val pager = rememberPagerState(initialPage = startIndex.coerceIn(0, (pageCount - 1).coerceAtLeast(0))) { posts.size + if (end != null) 1 else 0 }
    // With animations off (Remove animations), pages jump instead of sliding.
    val still = rememberReducedMotion()
    suspend fun goTo(page: Int) = if (still) pager.scrollToPage(page) else pager.animateScrollToPage(page)
    // Sound and Fit video are remembered on the phone: once sound is on, every
    // video plays with it until it's turned off (Settings shows the same switch).
    val prefs = SettingsPrefs.get(context)
    val muted = !prefs.soundOn
    val fit = prefs.fitVideo
    var repeat by rememberSaveable { mutableStateOf(false) }
    var hidden by rememberSaveable { mutableStateOf(false) }
    var notice by remember { mutableStateOf<Notice?>(null) }
    var saving by remember { mutableStateOf<String?>(null) }
    // Keeping a friend's post in your own saves (the bookmark), and the ones kept this time.
    var keeping by remember { mutableStateOf<String?>(null) }
    val kept = remember { androidx.compose.runtime.mutableStateListOf<String>() }
    // The post whose files are coming down for Share, and how far (null: unknown).
    var sharing by remember { mutableStateOf<String?>(null) }
    var shareProgress by remember { mutableStateOf<Float?>(null) }
    var player by remember { mutableStateOf<ExoPlayer?>(null) }
    val playback = remember { Playback() }
    var reading by remember { mutableStateOf<PhonePost?>(null) }
    var more by remember { mutableStateOf<PhonePost?>(null) }
    var sendingPost by remember { mutableStateOf<PhonePost?>(null) }
    // Outside Live, the player has its own React: the post whose picker is open, what's typed, and how sending went.
    val ownReact = onReact == null
    var picking by remember { mutableStateOf<PhonePost?>(null) }
    var reactWords by rememberSaveable { mutableStateOf("") }
    var reactSending by remember { mutableStateOf(false) }
    var reactError by remember { mutableStateOf<String?>(null) }
    val floats = remember { PostFloats() }
    val reactingNow = reacting || picking != null
    // Where the scrub line is being dragged to (0–1), or null: the controls fade out meanwhile.
    var scrub by remember { mutableStateOf<Float?>(null) }
    val chrome by animateFloatAsState(if (scrub == null) 1f else 0f, label = "chrome")
    val pip = LocalPip.current
    val inPip = pip?.inPip == true

    // While the app can be seen (full screen or as a small window): the
    // decoder is let go once it can't.
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> if (player == null) player = buildPlayer(context)
                Lifecycle.Event.ON_STOP -> {
                    player?.release()
                    player = null
                }
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            player?.release()
            player = null
        }
    }

    val settled = pager.settledPage
    val current = posts.getOrNull(settled)
    val mediaUrl = current?.takeIf { PostKind.plays(it.kind) }?.media?.firstOrNull()?.url
        ?.let { AdhxApi.resolve(server, it)?.toString() }

    LaunchedEffect(settled) {
        scrub = null
        // The end page has buttons of its own: never leave it hidden.
        if (end != null && settled == posts.size) hidden = false
        onPage(settled)
        if (settled == 0) onTop()
    }

    // A post that settles replays the reactions kept on it (once per post per run
    // of the app): the newest few, oldest first, each with the face of who sent
    // it. Moving on cancels the rest. Live has its own room and doesn't replay.
    LaunchedEffect(current?.key, inPip) {
        floats.clear()
        val post = current ?: return@LaunchedEffect
        if (!ownReact || inPip) return@LaunchedEffect
        val settledAt = SystemClock.uptimeMillis()
        val connection = ConnectionStore.get(context).current() ?: return@LaunchedEffect
        val key = PostReactionsMemory.key(connection.server, connection.username, post.key)
        if (PostReactionsMemory.replayed(key)) return@LaunchedEffect
        val kept = PostReactionsMemory.fetched(key)
            ?: when (val got = AdhxApi(connection).postReactions(post.platform, post.id)) {
                is ApiResult.Ok -> got.value.reactions.also { PostReactionsMemory.remember(key, it) }
                // Not visible to you (404) has nothing to replay; anything else can try again next time.
                is ApiResult.Failed -> if (got.status == 404) emptyList<com.adhx.share.net.LiveReaction>().also { PostReactionsMemory.remember(key, it) } else return@LaunchedEffect
                else -> return@LaunchedEffect
            }
        val plan = replayPlan(kept)
        if (plan.isEmpty()) {
            PostReactionsMemory.markReplayed(key)
            return@LaunchedEffect
        }
        delay(replayWait(SystemClock.uptimeMillis() - settledAt))
        if (!PostReactionsMemory.markReplayed(key)) return@LaunchedEffect
        plan.forEach { step -> floats.add(step.reaction.emoji, step.reaction.text, step.reaction.who, step.afterMs) }
    }

    // Yours floats at once with your face, then it's kept on the post; if it
    // doesn't go, it's taken back and the picker says so.
    fun sendReaction(post: PhonePost, emoji: String?, text: String?) {
        if (reactSending) return
        val connection = ConnectionStore.get(context).current()
        if (connection == null) {
            reactError = POST_REACT_FAILED
            return
        }
        val me = Saver(username = connection.username ?: "you", name = Copy.YOU, avatarUrl = connection.avatarUrl, isYou = true)
        val id = floats.add(emoji, text, me)
        reactSending = true
        reactError = null
        scope.launch {
            val sent = AdhxApi(connection).reactToPost(post.platform, post.id, emoji = emoji, text = text) is ApiResult.Ok
            reactSending = false
            if (sent) {
                if (text != null) reactWords = ""
                picking = null
            } else {
                floats.remove(id)
                reactError = POST_REACT_FAILED
            }
        }
    }

    // Something new on top (saved while the app was away, or a save that was
    // on its way): at the top, it slides in from above; further down the
    // "new saves" pill offers it instead.
    val firstKey = posts.firstOrNull()?.key
    var shownFirst by remember { mutableStateOf(firstKey) }
    LaunchedEffect(firstKey) {
        val before = shownFirst
        shownFirst = firstKey
        if (preservePlaybackOnRefresh || firstKey == before || newOnTop != 0) return@LaunchedEffect
        val was = posts.indexOfFirst { it.key == before }
        if (was > 0) pager.scrollToPage(was)
        goTo(0)
    }

    LaunchedEffect(player, muted) {
        val p = player ?: return@LaunchedEffect
        p.volume = if (muted) 0f else 1f
        // Muted, it plays alongside whatever else is playing; with sound, it asks for the speaker.
        p.setAudioAttributes(MOVIE, !muted)
    }

    LaunchedEffect(player, repeat) {
        player?.repeatMode = if (repeat) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
    }

    LaunchedEffect(notice) {
        if (notice != null) {
            delay(2_200)
            notice = null
        }
    }

    LaunchedEffect(player, mediaUrl) {
        playback.reset()
        val p = player ?: return@LaunchedEffect
        if (mediaUrl == null) {
            p.stop()
            p.clearMediaItems()
            return@LaunchedEffect
        }
        p.setMediaItem(MediaItem.fromUri(mediaUrl))
        p.prepare()
        p.playWhenReady = true
        while (isActive) {
            playback.positionMs = p.currentPosition.coerceAtLeast(0L)
            playback.durationMs = p.duration.takeIf { it != C.TIME_UNSET }?.coerceAtLeast(0L) ?: 0L
            delay(250)
        }
    }

    // In the small window only videos are played, so its buttons skip the rest.
    fun step(by: Int): Int? {
        var i = pager.settledPage + by
        while (i in posts.indices) {
            if (!inPip || posts[i].kind == PostKind.VIDEO) return i
            i += by
        }
        return null
    }

    fun togglePlay() {
        val p = player ?: return
        if (playback.problem != null) return
        if (p.playbackState == Player.STATE_ENDED) {
            p.seekTo(0)
            p.play()
            playback.paused = false
        } else {
            playback.paused = !playback.paused
            p.playWhenReady = !playback.paused
        }
    }

    // Where a post that's done moves on to: the next save, or the end page after the last one.
    fun following(): Int? = step(1) ?: pager.settledPage.plus(1).takeIf { end != null && !inPip && it == posts.size }

    // With Repeat off, a video that ends moves on to the next save.
    var ended by remember { mutableIntStateOf(0) }
    LaunchedEffect(ended) {
        if (ended > 0 && !repeat) following()?.let { goTo(it) }
    }

    // A video on screen can go in a small window.
    val video = current?.takeIf { it.kind == PostKind.VIDEO && player != null && playback.problem == null }
    val playingNow = video != null && !playback.paused
    DisposableEffect(pip, video?.key, playingNow, inPip, posts.size) {
        pip?.offer(
            video?.let { post ->
                val media = post.media.firstOrNull()
                PipControls(
                    aspect = PipHost.aspect(media?.width, media?.height),
                    playing = playingNow,
                    previous = { step(-1)?.let { scope.launch { pager.scrollToPage(it) } } },
                    next = { step(1)?.let { scope.launch { pager.scrollToPage(it) } } },
                    togglePlay = { togglePlay() },
                )
            },
        )
        onDispose { pip?.offer(null) }
    }

    var failedUrl by remember { mutableStateOf<String?>(null) }
    val kindNow by rememberUpdatedState(current?.kind)
    DisposableEffect(player) {
        val p = player
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_READY) playback.ready = true
                if (playbackState == Player.STATE_ENDED) ended++
            }

            override fun onRenderedFirstFrame() {
                playback.drawn = true
            }

            override fun onPlayerError(error: PlaybackException) {
                val url = p?.currentMediaItem?.localConfiguration?.uri?.toString()
                playback.problem = if (kindNow == PostKind.AUDIO) "This sound couldn’t load." else "This video couldn’t load."
                failedUrl = url
            }
        }
        p?.addListener(listener)
        onDispose { p?.removeListener(listener) }
    }
    // A video that can't play says why (404/410 with `{ reason }`), like the web player.
    LaunchedEffect(failedUrl) {
        val url = failedUrl ?: return@LaunchedEffect
        val reason = AdhxApi.reason(url)
        if (reason != null && url == mediaUrl) playback.problem = reason
        failedUrl = null
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Black),
    ) {
        VerticalPager(
            state = pager,
            beyondViewportPageCount = 1,
            key = { posts.getOrNull(it)?.key ?: it },
            modifier = Modifier.fillMaxSize(),
        ) { page ->
            if (page == posts.size && end != null) {
                Box(Modifier.fillMaxSize()) { end() }
                return@VerticalPager
            }
            val post = posts.getOrNull(page) ?: return@VerticalPager
            PostPage(
                post = post,
                server = server,
                onScreen = page == settled,
                player = player,
                playback = playback,
                fit = fit,
                repeat = repeat,
                // A photo's timer waits while a sheet or picker is up, in the small window and while the app is away.
                held = more != null || sendingPost != null || reading != null || reactingNow || inPip || player == null,
                onPhotosDone = { following()?.let { scope.launch { goTo(it) } } },
                onHide = { hidden = true },
                hidden = hidden,
                saving = saving == post.key,
                sharing = sharing == post.key,
                shareProgress = shareProgress,
                pip = inPip,
                scrub = if (page == settled) scrub else null,
                chrome = chrome,
                onScrub = { scrub = it },
                onTap = {
                    when {
                        hidden -> hidden = false
                        PostKind.plays(post.kind) -> togglePlay()
                    }
                },
                onRead = { reading = post },
                onMore = { more = post },
                onSaver = onSaver,
                aboveCaption = aboveCaption,
                belowCaption = belowCaption,
                // Live's React (its room), or the player's own on every other post.
                onReact = onReact?.let { react -> { react(post) } } ?: {
                    reactError = null
                    picking = if (picking == null) post else null
                },
                reacting = reactingNow,
                live = !ownReact,
                onKeep = if (post.yours || post.sourceUrl.isNullOrBlank()) null else {
                    {
                        if (keeping == null) {
                            keeping = post.key
                            scope.launch {
                                val (ok, said) = KeepToo.keep(context, post)
                                if (ok) kept.add(post.key)
                                notice = Notice(said)
                                keeping = null
                            }
                        }
                    }
                },
                keeping = keeping == post.key || kept.contains(post.key),
                onSave = {
                    if (saving == null) {
                        saving = post.key
                        scope.launch {
                            val said = ShareKept.save(context, server, post)
                            saving = null
                            if (said == ShareKept.COPIED) Toast.makeText(context, said, Toast.LENGTH_SHORT).show() else notice = Notice(said)
                        }
                    }
                },
                onShare = {
                    // Every post goes through the send sheet: files or words, and straight to your people.
                    sendingPost = post
                },
                onSeek = { ms -> player?.seekTo(ms) },
            )
        }
        if (!hidden && !inPip && !(hideTopBarWhileSending && sendingPost != null)) {
            Box(Modifier.fillMaxSize().graphicsLayer { alpha = chrome }) { topBar() }
        }
        if (newOnTop > 0 && !hidden && !inPip && scrub == null) {
            NewSavesPill(
                count = newOnTop,
                onClick = { scope.launch { goTo(0) } },
                modifier = Modifier.align(Alignment.TopCenter),
            )
        }
        if (ownReact && !inPip) {
            // Over the post, left of the button column, between the top bar and the caption (as in Live).
            FloatingReactions(
                items = floats.items,
                server = server,
                onLanded = floats::remove,
                modifier = Modifier
                    .statusBarsPadding()
                    .padding(start = 16.dp, end = 84.dp, top = 170.dp, bottom = 300.dp),
            )
        }
        if (!inPip) notice?.let { NoticePill(it.text, Modifier.align(Alignment.TopCenter)) }
        if (!inPip) {
            picking?.let { post ->
                ReactPicker(
                    words = reactWords,
                    onWordsChange = { reactWords = it },
                    sending = reactSending,
                    error = reactError,
                    onEmoji = { sendReaction(post, it, null) },
                    onText = { sendReaction(post, null, it) },
                    onDismiss = { picking = null },
                    prompt = Copy.SAY_SOMETHING_POST,
                )
            }
        }
        reading?.let { Reader(it, onClose = { reading = null }) }
        if (!inPip) {
            sendingPost?.let { post -> SendSheet(post, server, onNotice = { text -> notice = Notice(text) }, onDismiss = { sendingPost = null }) }
        }
        if (!inPip) {
            more?.let { post ->
                val plays = PostKind.plays(post.kind)
                MoreSheet(
                    post,
                    server,
                    onNotice = { text -> notice = Notice(text) },
                    onDismiss = { more = null },
                    controls = PlayerControls(
                        muted = muted.takeIf { plays },
                        onToggleMute = {
                            prefs.soundOn = muted
                            notice = Notice(if (muted) "Sound on for every video" else "Sound off")
                        },
                        fit = fit.takeIf { post.kind == PostKind.VIDEO },
                        onToggleFit = {
                            prefs.fitVideo = !fit
                            notice = Notice(if (fit) "Videos fill the screen" else "Videos fit the screen whole")
                        },
                        // Photos play for a while too, so they can repeat.
                        repeat = repeat.takeIf { plays || post.kind == PostKind.PHOTO },
                        onToggleRepeat = {
                            repeat = !repeat
                            notice = Notice(if (repeat) "Repeating this one" else "Plays the next save when this ends")
                        },
                        onPip = if (pip?.supported == true && post.kind == PostKind.VIDEO) {
                            { pip.enter() }
                        } else {
                            null
                        },
                        onHide = { hidden = true },
                    ),
                )
            }
        }
    }
}

@OptIn(UnstableApi::class)
private fun buildPlayer(context: Context): ExoPlayer {
    // The server can hold a request while it fetches the file from the network.
    val http = DefaultHttpDataSource.Factory()
        .setConnectTimeoutMs(30_000)
        .setReadTimeoutMs(30_000)
    val source = DefaultMediaSourceFactory(DefaultDataSource.Factory(context, http))
    return ExoPlayer.Builder(context)
        .setMediaSourceFactory(source)
        .build()
        .apply {
            repeatMode = Player.REPEAT_MODE_OFF
            volume = 0f
        }
}

private val MOVIE = AudioAttributes.Builder()
    .setUsage(C.USAGE_MEDIA)
    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
    .build()

/** Under the top bar: "1 new save" / "3 new saves" with an up arrow; tapping goes to the top. */
@Composable
private fun NewSavesPill(count: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val label = if (count == 1) "1 new save" else "$count new saves"
    Row(
        modifier
            .statusBarsPadding()
            .padding(top = 64.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(AdhxColors.Accent)
            .clickable(onClickLabel = "Go to the newest", onClick = onClick)
            .padding(start = 12.dp, end = 16.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.KeyboardArrowUp, contentDescription = null, tint = AdhxColors.Black, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(4.dp))
        Text(label, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Black)
    }
}

@Composable
private fun NoticePill(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        fontSize = 14.sp,
        fontWeight = FontWeight.Bold,
        color = AdhxColors.Black,
        textAlign = TextAlign.Center,
        modifier = modifier
            .statusBarsPadding()
            .padding(top = 64.dp, start = 24.dp, end = 24.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(AdhxColors.Cream)
            .padding(horizontal = 16.dp, vertical = 10.dp),
    )
}

@Composable
private fun PostPage(
    post: PhonePost,
    server: String,
    onScreen: Boolean,
    player: ExoPlayer?,
    playback: Playback,
    fit: Boolean,
    repeat: Boolean,
    held: Boolean,
    onPhotosDone: () -> Unit,
    onHide: () -> Unit,
    hidden: Boolean,
    saving: Boolean,
    sharing: Boolean,
    shareProgress: Float?,
    pip: Boolean,
    scrub: Float?,
    chrome: Float,
    onScrub: (Float?) -> Unit,
    onTap: () -> Unit,
    onRead: () -> Unit,
    onMore: () -> Unit,
    onSaver: ((Saver) -> Unit)?,
    aboveCaption: (@Composable (PhonePost) -> Unit)?,
    belowCaption: (@Composable (PhonePost) -> Unit)?,
    onReact: (() -> Unit)?,
    reacting: Boolean,
    live: Boolean,
    onKeep: (() -> Unit)?,
    keeping: Boolean,
    onSave: () -> Unit,
    onShare: () -> Unit,
    onSeek: (Long) -> Unit,
) {
    val photos = remember(post.key, server) {
        if (post.kind == PostKind.PHOTO) {
            post.media.mapNotNull { m -> (m.url.ifBlank { m.posterUrl })?.let { AdhxApi.resolve(server, it)?.toString() } }
        } else {
            emptyList()
        }
    }
    val album = rememberPagerState { photos.size }
    val plays = PostKind.plays(post.kind)
    val timed = post.kind == PostKind.PHOTO && photos.isNotEmpty()

    // Save keeps the video, sound or every photo; a text post's words are copied.
    val canSave = remember(post.key, server) { ShareKept.files(post, server).isEmpty() || SaveToPhone.supported }

    // A photo on screen shows for PHOTO_MS, then the album's next photo
    // or (after the last) the next save; Repeat starts it over.
    // Read through [photoPaused] or the progress lambdas, so the page itself doesn't recompose on every tick.
    val timerState = remember(post.key) { mutableStateOf(PhotoTimer()) }
    var timer by timerState
    val photoPaused by remember(timerState) { derivedStateOf { timerState.value.paused } }
    if (timed && onScreen) {
        val scope = rememberCoroutineScope()
        val still = rememberReducedMotion()
        val holding by rememberUpdatedState(held || album.isScrollInProgress)
        val repeating by rememberUpdatedState(repeat)
        val done by rememberUpdatedState(onPhotosDone)
        LaunchedEffect(album.settledPage) { timer = PhotoTimer() }
        LaunchedEffect(Unit) {
            var last = SystemClock.uptimeMillis()
            while (isActive) {
                delay(PHOTO_TICK_MS)
                val now = SystemClock.uptimeMillis()
                val before = timer
                timer = before.tick(now - last, holding)
                last = now
                if (before.done || !timer.done) continue
                val at = album.settledPage
                when (val next = afterPhoto(at, photos.size, repeating)) {
                    is PhotoStep.Photo -> if (next.index == at) {
                        timer = PhotoTimer()
                    } else {
                        scope.launch { if (still) album.scrollToPage(next.index) else album.animateScrollToPage(next.index) }
                    }
                    PhotoStep.NextPost -> done()
                }
            }
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            // Tap: brings the controls back, else pauses or plays. Hold: hides them, to see the post whole.
            .combinedClickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClickLabel = when {
                    hidden -> "Show controls"
                    plays -> if (playback.paused) "Play" else "Pause"
                    timed && onScreen -> if (photoPaused) "Play" else "Pause"
                    else -> null
                },
                onLongClickLabel = if (hidden) null else "Hide controls",
                onLongClick = { if (!hidden && !pip) onHide() },
                onClick = { if (!hidden && timed && onScreen) timer = timer.toggled() else onTap() },
            ),
    ) {
        when {
            plays -> MediaPage(post, server, onScreen, player, playback, pip, fit)
            timed -> Album(photos, album, hidden || pip)
            else -> WordsCard(post, onRead)
        }
        if (timed && onScreen && photoPaused && !pip) PausedMark(Modifier.align(Alignment.Center))
        // How far along it is: the video's own position, or the photo's time on screen.
        val progress: (() -> Float)? = when {
            !onScreen -> null
            plays -> { { playback.fraction } }
            timed -> { { timerState.value.fraction } }
            else -> null
        }
        if (pip) {
            // The small window shows only the video.
        } else if (hidden) {
            if (progress != null) {
                ProgressLine(
                    progress,
                    Modifier
                        .align(Alignment.BottomStart)
                        .navigationBarsPadding(),
                )
            }
        } else {
            // The progress line sits just above the gesture bar (so scrubbing never
            // swipes between apps), the caption 18dp above it and the column 6dp higher.
            val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
            val lineBottom = navBottom + 4.dp
            // With Live's React picker open, the caption and column sit just above it, as on the boards.
            val lift = lineBottom + 18.dp + if (reacting) REACT_PICKER_HEIGHT else 0.dp
            Box(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .height(navBottom + 420.dp)
                    .graphicsLayer { alpha = chrome }
                    .background(
                        Brush.verticalGradient(
                            0f to Color.Transparent,
                            0.35f to Color.Black.copy(alpha = 0.55f),
                            1f to Color.Black.copy(alpha = 0.92f),
                        ),
                    ),
            )
            Column(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .graphicsLayer { alpha = chrome }
                    .padding(bottom = lift),
            ) {
                if (photos.size > 1) Dots(count = photos.size, current = album.currentPage)
                if (aboveCaption != null) {
                    Box(Modifier.padding(start = 16.dp, end = 84.dp, bottom = 14.dp)) { aboveCaption(post) }
                }
                Copy.noteOf(post.savers)?.let { (saver, note) ->
                    NoteBubble(saver, note, server, Modifier.padding(start = 16.dp, end = 84.dp, bottom = 6.dp))
                }
                CaptionText(post, server, onSaver, Modifier.padding(start = 16.dp, end = 84.dp))
                if (belowCaption != null) {
                    // Clear of the button column on the right; it scrolls sideways if it's long.
                    Box(Modifier.padding(top = 12.dp, end = 72.dp)) { belowCaption(post) }
                }
            }
            ActionColumn(
                post = post,
                saving = saving,
                sharing = sharing,
                shareProgress = shareProgress,
                onKeep = onKeep,
                keeping = keeping,
                onSave = if (canSave) onSave else null,
                onShare = onShare,
                onMore = onMore,
                onReact = onReact,
                reacting = reacting,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .graphicsLayer { alpha = chrome }
                    .padding(end = 12.dp, bottom = lift + 6.dp),
            )
            BottomRow(
                playback = if (onScreen && plays) playback else null,
                photo = if (timed && onScreen) { { timerState.value.fraction } } else null,
                // Live's line is yellow, as on the boards; New's is cream.
                color = if (live) AdhxColors.Accent else AdhxColors.White,
                scrub = scrub,
                onScrub = onScrub,
                onSeek = onSeek,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(bottom = (lineBottom - 16.dp).coerceAtLeast(0.dp)),
            )
            if (scrub != null && onScreen && plays) {
                ScrubTime(
                    elapsedMs = (scrub * playback.durationMs).toLong(),
                    totalMs = playback.durationMs,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding()
                        .padding(bottom = 84.dp),
                )
            }
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
private fun MediaPage(
    post: PhonePost,
    server: String,
    onScreen: Boolean,
    player: ExoPlayer?,
    playback: Playback,
    pip: Boolean,
    fit: Boolean,
) {
    val media = post.media.firstOrNull()
    val poster = media?.posterUrl?.let { AdhxApi.resolve(server, it)?.toString() }
    // Full bleed, as on the boards (the picture covers the screen), or the whole
    // video at its own shape with Fit video on. A sound's cover always fills.
    val fills = post.kind == PostKind.AUDIO || !fit
    // The page's own size, clipped: a sound's cover fills it (cropped) and never pushes past it.
    Box(Modifier.fillMaxSize().clipToBounds(), contentAlignment = Alignment.Center) {
        if (poster != null) {
            AsyncImage(
                model = poster,
                contentDescription = null,
                contentScale = if (fills) ContentScale.Crop else ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (onScreen && player != null && post.kind == PostKind.VIDEO) {
            AndroidView(
                factory = { ctx -> LayoutInflater.from(ctx).inflate(R.layout.player_view, null) as PlayerView },
                update = { view ->
                    if (view.player !== player) view.player = player
                    val mode = if (fills) AspectRatioFrameLayout.RESIZE_MODE_ZOOM else AspectRatioFrameLayout.RESIZE_MODE_FIT
                    if (view.resizeMode != mode) view.resizeMode = mode
                },
                onRelease = { view -> view.player = null },
                // Hidden (the poster or black shows) until this post's first frame, and when it fails.
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer { alpha = if (playback.drawn && playback.problem == null) 1f else 0f },
            )
        }
        if (onScreen && !pip) {
            val problem = playback.problem
            when {
                problem != null -> Text(
                    problem,
                    fontSize = 15.sp,
                    lineHeight = 21.sp,
                    color = AdhxColors.Cream,
                    textAlign = TextAlign.Center,
                    // Centred in the space left of the right column, like the caption.
                    modifier = Modifier
                        .padding(start = 24.dp, end = 88.dp, top = 32.dp, bottom = 32.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color.Black.copy(alpha = 0.7f))
                        .padding(16.dp),
                )
                !playback.ready -> Spinner(size = 34.dp, stroke = 3.dp)
                playback.paused -> PausedMark()
            }
        }
    }
}

/** The play button in the middle of a paused video or photo. */
@Composable
private fun PausedMark(modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(76.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.55f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = AdhxColors.White, modifier = Modifier.size(44.dp))
    }
}

/** How long a photo stays on screen in the player before the next one. */
internal const val PHOTO_MS = 10_000L

/** How often a photo's timer moves on. */
private const val PHOTO_TICK_MS = 50L

/**
 * A photo's time on screen: [elapsedMs] of [lengthMs], paused by a tap.
 * It stands still while [tick] is told it's held (a sheet is open).
 */
internal data class PhotoTimer(val elapsedMs: Long = 0L, val paused: Boolean = false, val lengthMs: Long = PHOTO_MS) {
    val done: Boolean get() = elapsedMs >= lengthMs
    val fraction: Float get() = if (lengthMs > 0) (elapsedMs.toFloat() / lengthMs).coerceIn(0f, 1f) else 1f

    /** [deltaMs] later, unless it's paused, held or already done. */
    fun tick(deltaMs: Long, held: Boolean = false): PhotoTimer =
        if (paused || held || done || deltaMs <= 0) this else copy(elapsedMs = (elapsedMs + deltaMs).coerceAtMost(lengthMs))

    /** A tap: pause or carry on; once it's run out, start the photo over. */
    fun toggled(): PhotoTimer = if (done) PhotoTimer(lengthMs = lengthMs) else copy(paused = !paused)
}

/** What comes after a photo's time is up. */
internal sealed interface PhotoStep {
    /** Another photo of the album (or the same one again, on Repeat). */
    data class Photo(val index: Int) : PhotoStep

    /** The next save. */
    data object NextPost : PhotoStep
}

/** After photo [index] of [count]: the album's next photo, else the next save, or the album again on [repeat]. */
internal fun afterPhoto(index: Int, count: Int, repeat: Boolean): PhotoStep = when {
    index + 1 < count -> PhotoStep.Photo(index + 1)
    repeat -> PhotoStep.Photo(0)
    else -> PhotoStep.NextPost
}

/** How much room Live's React picker takes at the bottom, with a little air above it. */
private val REACT_PICKER_HEIGHT = 156.dp

@Composable
private fun Album(photos: List<String>, state: PagerState, hidden: Boolean) {
    Box(Modifier.fillMaxSize()) {
        HorizontalPager(state = state, modifier = Modifier.fillMaxSize()) { index ->
            var failed by remember { mutableStateOf(false) }
            Box(
                Modifier
                    .fillMaxSize()
                    .semantics { contentDescription = "Photo ${index + 1} of ${photos.size}" },
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(
                    model = photos[index],
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    onError = { failed = true },
                    onSuccess = { failed = false },
                    modifier = Modifier.fillMaxSize(),
                )
                if (failed) Text("This photo couldn’t load.", fontSize = 15.sp, color = AdhxColors.Muted)
            }
        }
        if (photos.size > 1 && !hidden) {
            Text(
                "${state.currentPage + 1} / ${photos.size}",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = AdhxColors.White,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .statusBarsPadding()
                    .padding(top = 64.dp, end = 16.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color.Black.copy(alpha = 0.5f))
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
    }
}

@Composable
private fun Dots(count: Int, current: Int) {
    Row(
        Modifier.fillMaxWidth().padding(bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
    ) {
        repeat(count.coerceAtMost(12)) { i ->
            Box(
                Modifier
                    .size(if (i == current) 8.dp else 6.dp)
                    .clip(CircleShape)
                    .background(if (i == current) AdhxColors.White else AdhxColors.White.copy(alpha = 0.4f))
                    .align(Alignment.CenterVertically),
            )
        }
    }
}

/**
 * A text post or an article, full bleed like a video: the words sit centred
 * between the top bar and the caption, in a large serif when they're short.
 * A long post fills the space and fades out just above the caption; it
 * doesn't scroll (Original has the rest).
 */
@Composable
private fun WordsCard(post: PhonePost, onRead: () -> Unit) {
    val article = post.article
    val title = article?.title?.takeIf { it.isNotBlank() }
    val short = (title.orEmpty().length + post.text.length) < SHORT_WORDS
    val type = if (short) 38.sp else 28.sp
    val line = if (short) 44.sp else 34.sp
    val scroll = rememberScrollState()
    Box(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Background)
            .navigationBarsPadding()
            .padding(start = 24.dp, end = 24.dp, top = 110.dp, bottom = 280.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                .drawWithContent {
                    drawContent()
                    if (scroll.maxValue > 0) {
                        drawRect(
                            brush = Brush.verticalGradient(
                                0f to Color.Black,
                                0.86f to Color.Black,
                                1f to Color.Transparent,
                                startY = 0f,
                                endY = size.height,
                            ),
                            blendMode = BlendMode.DstIn,
                        )
                    }
                }
                // Measured at full length, so it shows whether it overflows; not scrollable.
                .verticalScroll(scroll, enabled = false),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            title?.let {
                Text(it, fontFamily = SerifFamily, fontSize = type, lineHeight = line, color = AdhxColors.White)
            }
            article?.url?.takeIf { it.isNotBlank() }?.let {
                Text(Links.display(it), fontSize = 13.sp, color = AdhxColors.Faint, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (post.text.isNotBlank()) {
                Text(
                    rememberLinked(post.text),
                    fontFamily = SerifFamily,
                    fontSize = if (title != null) 22.sp else type,
                    lineHeight = if (title != null) 30.sp else line,
                    color = if (title != null) AdhxColors.Cream else AdhxColors.White,
                )
            }
            article?.description?.takeIf { it.isNotBlank() && it != post.text }?.let {
                Text(it, fontSize = 16.sp, lineHeight = 24.sp, color = AdhxColors.Muted)
            }
        }
        // Too long to show: the whole of it is a button away (taps on the words don't open it).
        if (scroll.maxValue > 0) {
            Text(
                "Read all",
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = AdhxColors.White,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .clip(RoundedCornerShape(20.dp))
                    .background(AdhxColors.Raised)
                    .clickable(onClickLabel = "Read all of it", onClick = onRead)
                    .padding(horizontal = 18.dp, vertical = 10.dp),
            )
        }
    }
}

/** Posts shorter than this (in characters) get the biggest type. */
private const val SHORT_WORDS = 140

/**
 * Who posted it, for the byline after the network's mark: their name, else
 * the network's ("YouTube"), else their handle.
 */
/** Who posted it, beside the network's mark; "" (just the mark) when no one's named, like iOS. */
internal fun bylineName(post: PhonePost): String {
    val who = post.author.name?.trim()?.takeIf { it.isNotEmpty() }
        ?: Copy.handle(post.author.handle)
        ?: return ""
    val network = Networks.name(post.platform)
    return if (who.length <= 1 || (network != null && who.equals(network, ignoreCase = true))) "" else who
}

/**
 * Bottom left, over the post: who of your people saved it (faces and "Ana and
 * Ben saved this · 2h", a lock when it's just for you), where it's from (the
 * network's mark and who posted it: [YouTube] Rick Astley) and the first
 * lines of text (words posts show them in the page).
 */
@Composable
private fun CaptionText(post: PhonePost, server: String, onSaver: ((Saver) -> Unit)?, modifier: Modifier = Modifier) {
    val words = post.kind == PostKind.TEXT || post.kind == PostKind.ARTICLE
    val source = bylineName(post)
    val justYou = Privacy.isPrivate(post)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        val line = Copy.saversLine(post.savers)
        if (line != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Faces(
                    savers = post.savers,
                    server = server,
                    size = 30.dp,
                    description = line,
                    onTap = onSaver,
                )
                Spacer(Modifier.width(10.dp))
                Text(
                    line,
                    style = OverMedia,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = AdhxColors.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Copy.shortAgoIso(post.savers.firstOrNull()?.savedAt)?.let {
                    Text(" · $it", style = OverMedia, fontSize = 14.sp, color = AdhxColors.Muted, maxLines = 1, softWrap = false)
                }
                if (justYou) {
                    Spacer(Modifier.width(8.dp))
                    PrivateLock(size = 15.dp)
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (justYou && line == null) {
                PrivateLock(size = 14.dp)
                Spacer(Modifier.width(6.dp))
            }
            // The network's mark, then who posted it: [YouTube] Saturday Night Live.
            NetworkMark(post.platform, size = 15.dp, tint = if (line != null) AdhxColors.Muted else AdhxColors.White)
            if (source.isNotEmpty()) Spacer(Modifier.width(7.dp))
            if (source.isNotEmpty()) Text(
                source,
                style = OverMedia,
                fontSize = 14.sp,
                fontWeight = if (line != null) FontWeight.Normal else FontWeight.Bold,
                color = if (line != null) AdhxColors.Muted else AdhxColors.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (!words && post.text.isNotBlank()) {
            Text(
                // One run of words: paragraph breaks would leave the second line empty. Links open in the browser.
                rememberLinked(Copy.oneLine(post.text)),
                style = OverMedia,
                fontSize = 16.sp,
                lineHeight = 22.sp,
                color = AdhxColors.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** The note bubble's tail: a triangle pointing down, with a softened tip. */
private val NoteTailShape = GenericShape { size, _ ->
    moveTo(0f, 0f)
    lineTo(size.width, 0f)
    lineTo(size.width / 2f + 2f, size.height - 1.5f)
    quadraticTo(size.width / 2f, size.height + 0.5f, size.width / 2f - 2f, size.height - 1.5f)
    close()
}

/**
 * A friend's note on their save ("you're welcome"), as a cream speech bubble
 * with their face, pointing down at the byline.
 */
@Composable
private fun NoteBubble(saver: Saver, note: String, server: String, modifier: Modifier = Modifier) {
    Column(
        modifier.semantics(mergeDescendants = true) { contentDescription = Copy.noteDescription(saver, note) },
    ) {
        Row(
            Modifier
                .shadow(16.dp, RoundedCornerShape(22.dp), ambientColor = Color.Black, spotColor = Color.Black)
                .heightIn(min = 44.dp)
                .clip(RoundedCornerShape(22.dp))
                .background(AdhxColors.White)
                .padding(start = 6.dp, end = 16.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(saver, server, size = 32.dp)
            Spacer(Modifier.width(8.dp))
            Text(
                "“$note”",
                fontSize = 16.sp,
                lineHeight = 20.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color(0xFF141414),
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
        }
        // The tail: a short triangle pointing down at the byline, tucked
        // 2dp into the bubble so the two read as one shape.
        Box(
            Modifier
                .padding(start = 20.dp)
                .offset(y = (-2).dp)
                .size(width = 16.dp, height = 10.dp)
                .background(AdhxColors.White, NoteTailShape),
        )
    }
}

/**
 * The column of round buttons on the right, as on the boards: Save (keep a
 * friend's post in your own saves; lit when it's yours), Share the video,
 * Save to phone and More. Live adds React on top. Sound, Repeat, the
 * original, the small window and Hide are in More.
 */
@Composable
private fun ActionColumn(
    post: PhonePost,
    saving: Boolean,
    sharing: Boolean,
    shareProgress: Float?,
    onKeep: (() -> Unit)?,
    keeping: Boolean,
    onSave: (() -> Unit)?,
    onShare: () -> Unit,
    onMore: () -> Unit,
    onReact: (() -> Unit)?,
    reacting: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier.width(52.dp),
        // Live's extra React button tightens the column, as on the boards.
        verticalArrangement = Arrangement.spacedBy(if (onReact != null) 8.dp else 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (onReact != null) {
            ActionButton(
                description = if (reacting) Copy.CLOSE_REACT else Copy.REACT,
                onClick = onReact,
                ringed = true,
                lit = reacting,
            ) {
                ActionIcon(rememberVectorPainter(Glyphs.Smile), tint = AdhxColors.Accent)
            }
        }
        val yours = post.yours || keeping
        ActionButton(
            description = if (yours) "In your saves" else "Save",
            onClick = { onKeep?.invoke() },
            enabled = onKeep != null,
            selected = yours,
        ) {
            ActionIcon(rememberVectorPainter(if (yours) Glyphs.BookmarkFilled else Glyphs.Bookmark), tint = if (yours) AdhxColors.Accent else AdhxColors.White)
        }
        // The kept file itself (or the words): an ADHX link only opens for people on it.
        ActionButton(
            description = when (post.kind) {
                PostKind.VIDEO -> "Share the video"
                PostKind.PHOTO -> "Share the photos"
                PostKind.AUDIO -> "Share the sound"
                else -> "Share the words"
            },
            onClick = { if (!sharing) onShare() },
        ) {
            when {
                // What it shares: the video (or sound), the photos, or the words.
                !sharing -> ActionIcon(
                    rememberVectorPainter(
                        when (post.kind) {
                            PostKind.PHOTO -> Glyphs.Photo
                            PostKind.TEXT, PostKind.ARTICLE -> Glyphs.Lines
                            else -> Glyphs.Video
                        },
                    ),
                )
                shareProgress == null -> Spinner(size = 20.dp, stroke = 2.dp)
                else -> {
                    val fraction by animateFloatAsState(shareProgress.coerceIn(0f, 1f), label = "share")
                    CircularProgressIndicator(
                        progress = { fraction },
                        modifier = Modifier.size(22.dp),
                        color = AdhxColors.Accent,
                        trackColor = AdhxColors.White.copy(alpha = 0.18f),
                        strokeWidth = 2.5.dp,
                    )
                }
            }
        }
        if (onSave != null) {
            val words = post.media.isEmpty()
            ActionButton(
                description = if (words) "Copy the words" else "Save to your phone",
                onClick = { if (!saving) onSave() },
            ) {
                if (saving) Spinner(size = 20.dp, stroke = 2.dp) else ActionIcon(rememberVectorPainter(Glyphs.Download))
            }
        }
        ActionButton(description = "More options", onClick = onMore) {
            ActionIcon(rememberVectorPainter(Glyphs.More))
        }
    }
}

@Composable
private fun ActionIcon(painter: Painter, tint: Color = AdhxColors.White, size: Int = 22) {
    Icon(painter, contentDescription = null, tint = tint, modifier = Modifier.size(size.dp))
}

/** A 52dp round glass button in the column on the right. */
@Composable
private fun ActionButton(
    description: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    selected: Boolean? = null,
    ringed: Boolean = false,
    lit: Boolean = false,
    icon: @Composable () -> Unit,
) {
    Box(
        Modifier
            .size(52.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.45f))
            .then(
                when {
                    lit -> Modifier.border(2.dp, AdhxColors.Accent, CircleShape)
                    ringed -> Modifier.border(2.dp, AdhxColors.Accent.copy(alpha = 0.6f), CircleShape)
                    else -> Modifier
                },
            )
            .clickable(enabled = enabled, onClickLabel = description, onClick = onClick)
            .semantics {
                contentDescription = description
                if (selected != null) this.selected = selected
            },
        contentAlignment = Alignment.Center,
    ) {
        icon()
    }
}

/**
 * The playback line along the bottom, 16dp in from each side; you can drag
 * it to seek. A photo's line shows its time on screen ([photo], 0–1) and
 * can't be dragged. Words have none.
 */
@Composable
private fun BottomRow(
    playback: Playback?,
    photo: (() -> Float)?,
    color: Color,
    scrub: Float?,
    onScrub: (Float?) -> Unit,
    onSeek: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (playback == null) {
        if (photo != null) {
            ScrubLine(
                fraction = photo(),
                color = color,
                dragging = false,
                enabled = false,
                onDrag = {},
                onRelease = {},
                label = "Time on this photo",
                modifier = modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
            )
        }
        return
    }
    val duration = playback.durationMs
    ScrubLine(
        fraction = scrub ?: playback.fraction,
        color = color,
        dragging = scrub != null,
        enabled = duration > 0,
        onDrag = onScrub,
        onRelease = { at ->
            onSeek((at * duration).toLong())
            onScrub(null)
        },
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
    )
}

/**
 * A full-width line to seek with: 3dp, cream on a faint track at rest; 6dp
 * yellow with a 20dp thumb while dragged. Tapping it seeks there. The line
 * sits 16dp above the bottom of its 32dp touch area.
 */
@Composable
private fun ScrubLine(
    fraction: Float,
    color: Color,
    dragging: Boolean,
    enabled: Boolean,
    onDrag: (Float) -> Unit,
    onRelease: (Float) -> Unit,
    modifier: Modifier = Modifier,
    label: String = "Seek",
) {
    val drag by rememberUpdatedState(onDrag)
    val release by rememberUpdatedState(onRelease)
    val track = Color.White.copy(alpha = 0.22f)
    Canvas(
        modifier
            .height(32.dp)
            .semantics { contentDescription = label }
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                detectTapGestures { at -> release((at.x / size.width).coerceIn(0f, 1f)) }
            }
            .pointerInput(enabled) {
                if (!enabled) return@pointerInput
                var at = 0f
                detectHorizontalDragGestures(
                    onDragStart = { start ->
                        at = (start.x / size.width).coerceIn(0f, 1f)
                        drag(at)
                    },
                    onHorizontalDrag = { change, _ ->
                        change.consume()
                        // Follow the finger itself, so the thumb stays under it.
                        at = (change.position.x / size.width).coerceIn(0f, 1f)
                        drag(at)
                    },
                    onDragEnd = { release(at) },
                    onDragCancel = { release(at) },
                )
            },
    ) {
        val thickness = (if (dragging) 6.dp else 3.dp).toPx()
        val y = size.height - 16.dp.toPx() - thickness / 2
        val x = fraction * size.width
        drawLine(track, Offset(thickness / 2, y), Offset(size.width - thickness / 2, y), thickness, StrokeCap.Round)
        if (dragging) {
            drawLine(AdhxColors.Accent, Offset(thickness / 2, y), Offset(x.coerceAtLeast(thickness / 2), y), thickness, StrokeCap.Round)
            drawCircle(AdhxColors.Accent, 10.dp.toPx(), Offset(x.coerceIn(10.dp.toPx(), size.width - 10.dp.toPx()), y))
        } else if (x > 0f) {
            drawLine(color, Offset(thickness / 2, y), Offset(x.coerceAtLeast(thickness / 2), y), thickness, StrokeCap.Round)
        }
    }
}

/** A plain white glyph with a soft shadow, no circle, so it reads apart from the column buttons. */
@Composable
private fun Glyph(painter: Painter, label: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clickable(onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painter,
            contentDescription = null,
            tint = Color.Black.copy(alpha = 0.5f),
            modifier = Modifier
                .size(24.dp)
                .offset(y = 1.dp)
                .blur(3.dp, BlurredEdgeTreatment.Unbounded),
        )
        Icon(painter, contentDescription = null, tint = AdhxColors.White, modifier = Modifier.size(24.dp))
    }
}

/** The time while scrubbing, large and centred: "0:14" then "/ 0:41". */
@Composable
private fun ScrubTime(elapsedMs: Long, totalMs: Long, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.Bottom) {
        Text(clock(elapsedMs), style = OverMedia, fontSize = 34.sp, fontWeight = FontWeight.Bold, color = AdhxColors.White)
        Spacer(Modifier.width(8.dp))
        Text(
            "/ ${clock(totalMs)}",
            style = OverMedia,
            fontSize = 17.sp,
            color = AdhxColors.Cream,
            modifier = Modifier.padding(bottom = 5.dp),
        )
    }
}

/** The thin line left at the bottom while the controls are hidden ([fraction] 0–1, read here so only the line redraws). */
@Composable
private fun ProgressLine(fraction: () -> Float, modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(3.dp)
            .background(AdhxColors.White.copy(alpha = 0.2f)),
    ) {
        Box(
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(fraction().coerceIn(0f, 1f))
                .background(AdhxColors.Accent),
        )
    }
}

/** 0:14, 12:03, 1:02:45 */
private fun clock(ms: Long): String {
    val total = (ms / 1000).coerceAtLeast(0)
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

/** A 44dp round button for the top of a screen: dark glass over the player, [background] on a page. */
@Composable
fun BarButton(painter: Painter, label: String, onClick: () -> Unit, background: Color = Color.Black.copy(alpha = 0.45f)) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(background)
            .clickable(onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(painter, contentDescription = null, tint = AdhxColors.White, modifier = Modifier.size(20.dp))
    }
}

@Composable
fun BarButton(icon: ImageVector, label: String, onClick: () -> Unit, background: Color = Color.Black.copy(alpha = 0.45f)) =
    BarButton(rememberVectorPainter(icon), label, onClick, background)
