package com.adhx.share.library

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.res.Configuration
import android.os.SystemClock
import android.view.LayoutInflater
import android.widget.Toast
import androidx.annotation.OptIn
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
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
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
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
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil3.compose.AsyncImage
import com.adhx.share.R
import com.adhx.share.data.ConnectionStore
import com.adhx.share.data.SettingsPrefs
import com.adhx.share.feed.FloatingReactions
import com.adhx.share.feed.Privacy
import com.adhx.share.feed.QueueSheet
import com.adhx.share.feed.ReactPicker
import com.adhx.share.links.Links
import com.adhx.share.links.Networks
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.LiveReaction
import com.adhx.share.net.PhonePost
import com.adhx.share.net.PostKind
import com.adhx.share.net.Saver
import com.adhx.share.net.WhoResponse
import com.adhx.share.net.WhyKind
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.KeepUpright
import com.adhx.share.ui.MayTurn
import com.adhx.share.ui.NetworkMark
import com.adhx.share.ui.PrivateLock
import com.adhx.share.ui.SansFamily
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.Spinner
import com.adhx.share.ui.openUrl
import com.adhx.share.ui.rememberLinked
import com.adhx.share.ui.rememberReducedMotion
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
    /** What kind of can't-play [problem] is, once known (boards 14.8, 14.9). */
    var trouble by mutableStateOf<Trouble?>(null)
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
        trouble = null
        positionMs = 0L
        durationMs = 0L
    }
}

/**
 * A channel's or a search's name and order, for its Up next (boards 14.3,
 * 14.4) behind the count pill; [chip] says how a search matched.
 */
data class QueueInfo(val name: String, val note: String, val chip: (PhonePost) -> String? = { null })

/** Where the count pill says you are ("5 of 51"), and what a screen reader hears for it. */
data class UpNextSpot(val position: Int, val count: Int, val description: String)

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
 * Along the bottom (layout C, boards 15.7–15.10) is one row: the first
 * saver's face (tap: who's on it, saved, watched and reacted, in the same
 * row), the scrub line and the count pill that opens Up next ([upNextSpot]
 * and [onUpNext], else [queue]'s own sheet). [onSaver] makes those faces open
 * that person. The only reasons shown are "Ana sent you this" (with Reply)
 * and For you's "Like … you kept", in a chip above the row ([onReason] opens
 * why); [aboveCaption] adds one of the caller's own there. [end] is one last
 * page after the posts (You're all caught up). React sits at the top of the
 * button column on every post: [onReact] hands it to Live's room ([reacting]
 * lights it while Live's picker is open); without it the player has its own
 * picker, keeps reactions on the post and replays the kept ones when a post
 * settles ([PostReactionsMemory], once per post per run of the app). A
 * friend's note on their save floats up first, the same way.
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
    end: (@Composable () -> Unit)? = null,
    onReact: ((PhonePost) -> Unit)? = null,
    reacting: Boolean = false,
    /** Reactions feed: refresh even if this post replayed in another player. */
    replayReactions: Boolean = false,
    /** Live privacy/metadata refreshes keep the keyed page rather than jumping to New's top. */
    preservePlaybackOnRefresh: Boolean = false,
    /** [topBar] steps aside while the send sheet is up (home's row, as on iPhone). */
    hideTopBarWhileSending: Boolean = false,
    /**
     * [topBar] shows the short messages ("Link copied") itself, in place of
     * its "N on their way" pill, through [LocalPlayerToast] (New, My saves).
     */
    toastInTopBar: Boolean = false,
    /** Repeat on from the start: a post opened from the share card loops. */
    startRepeating: Boolean = false,
    /** Go to this post (`platform:id`), then say so with [onJumped] (Up next). */
    jumpTo: String? = null,
    onJumped: () -> Unit = {},
    /** A channel or a search: the count pill opens its Up next. */
    queue: QueueInfo? = null,
    /** Home's lineup: where the count pill says you are, and its own Up next. */
    upNextSpot: ((PhonePost) -> UpNextSpot?)? = null,
    onUpNext: (() -> Unit)? = null,
    /** Tapping the reason chip (Home's why). */
    onReason: ((PhonePost) -> Unit)? = null,
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
    var repeat by rememberSaveable { mutableStateOf(startRepeating) }
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
    // Picking up where you left off (board 14.2): the post the player has, and a spot it offers.
    val resume = remember { ResumeStore.get(context) }
    var playingKey by remember { mutableStateOf<String?>(null) }
    var resumeOffer by remember { mutableStateOf<ResumeSpot?>(null) }
    // Try again: load the same file afresh, from where it was.
    var retryTick by remember { mutableIntStateOf(0) }
    var retryFrom by remember { mutableStateOf<Long?>(null) }
    var removing by remember { mutableStateOf(false) }
    var removeError by remember { mutableStateOf<String?>(null) }
    // Posts whose save you removed from a can't-play card (a tick shows instead).
    val removedKeys = remember { androidx.compose.runtime.mutableStateListOf<String>() }
    // Up next for a channel or a search, the posts left behind meanwhile, and where to go.
    var queueOpen by remember { mutableStateOf(false) }
    val watched = remember { androidx.compose.runtime.mutableStateListOf<String>() }
    var queueJump by remember { mutableStateOf<String?>(null) }
    // A post you were sent can be answered; answers from others show as "Pete replied · 2m".
    var replyTo by remember { mutableStateOf<PhonePost?>(null) }
    val answers = remember { androidx.compose.runtime.mutableStateMapOf<String, LiveReaction>() }
    // The post whose "who's on it" row is open, and what /api/app/who said for each post.
    var whoOpen by remember { mutableStateOf<String?>(null) }
    val whoSaid = remember { androidx.compose.runtime.mutableStateMapOf<String, WhoResponse>() }
    var reading by remember { mutableStateOf<PhonePost?>(null) }
    var more by remember { mutableStateOf<PhonePost?>(null) }
    // The original post's sheet (the rail's network button).
    var original by remember { mutableStateOf<PhonePost?>(null) }
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
    // Turned sideways on playing media: the media alone, whole, with no bars (see [MayTurn] below).
    val landscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE && !inPip
    val view = LocalView.current
    DisposableEffect(landscape) {
        val window = view.context.findActivity()?.window
        val bars = window?.let { WindowCompat.getInsetsController(it, view) }
        fun place() {
            if (landscape) {
                bars?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                bars?.hide(WindowInsetsCompat.Type.systemBars())
            } else {
                bars?.show(WindowInsetsCompat.Type.systemBars())
            }
        }
        place()
        // A sheet that was closing when the phone turned still had the focus: hide them again once it's gone.
        val focus = android.view.ViewTreeObserver.OnWindowFocusChangeListener { focused -> if (focused) place() }
        view.viewTreeObserver.addOnWindowFocusChangeListener(focus)
        onDispose {
            view.viewTreeObserver.removeOnWindowFocusChangeListener(focus)
            bars?.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    // Leaving the app or the player: remember where you are in a long post.
    fun rememberSpot() {
        val key = playingKey ?: return
        val p = player ?: return
        if (resumeOffer != null || playback.trouble != null) return
        p.duration.takeIf { it != C.TIME_UNSET && it > 0 }?.let { resume.leave(key, p.currentPosition, it) }
    }

    // While the app can be seen (full screen or as a small window): the
    // decoder is let go once it can't.
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> if (player == null) player = buildPlayer(context)
                Lifecycle.Event.ON_STOP -> {
                    rememberSpot()
                    player?.release()
                    player = null
                }
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            rememberSpot()
            player?.release()
            player = null
        }
    }

    val settled = pager.settledPage
    val current = posts.getOrNull(settled)
    // Only playing media turns sideways: a video, a sound or photos, with nothing over them
    // (sheets, the picker and the reader keep the phone upright). Words and the end page stay upright.
    MayTurn(current != null && (PostKind.plays(current.kind) || current.kind == PostKind.PHOTO))
    val mediaUrl = current?.takeIf { PostKind.plays(it.kind) }?.media?.firstOrNull()?.url
        ?.let { AdhxApi.resolve(server, it)?.toString() }

    var lastSettled by remember { mutableIntStateOf(settled) }
    LaunchedEffect(settled) {
        posts.getOrNull(lastSettled)?.key?.takeIf { lastSettled != settled && it !in watched }?.let { watched.add(it) }
        lastSettled = settled
        removeError = null
        scrub = null
        // Moving to another post puts the face back.
        whoOpen = null
        // The end page has buttons of its own: never leave it hidden.
        if (end != null && settled == posts.size) hidden = false
        onPage(settled)
        if (settled == 0) onTop()
    }

    // A post that settles replays the reactions kept on it (once per post per run
    // of the app): the newest few, oldest first, each with the face of who sent
    // it. A friend's note on their save floats up first. Moving on cancels the
    // rest. Live has its own room for reactions, so only the note floats there.
    LaunchedEffect(current?.key, inPip, server, replayReactions) {
        floats.clear()
        val post = current ?: return@LaunchedEffect
        if (inPip) return@LaunchedEffect
        val note = Copy.noteOf(post.savers)
        val settledAt = SystemClock.uptimeMillis()
        suspend fun noteAlone() {
            val (saver, words) = note ?: return
            delay(replayWait(SystemClock.uptimeMillis() - settledAt))
            floats.add(null, words, saver)
        }
        if (!ownReact) return@LaunchedEffect noteAlone()
        val connection = ConnectionStore.get(context).current() ?: return@LaunchedEffect noteAlone()
        val key = PostReactionsMemory.key(connection.server, connection.key, post.key)
        PostReactionsMemory.cachedFor(key, false)?.let { list -> Replies.answer(list)?.let { answers[post.key] = it } }
        if (!PostReactionsMemory.shouldReplay(key, replayReactions)) return@LaunchedEffect
        val kept = PostReactionsMemory.cachedFor(key, replayReactions)
            ?: when (val got = AdhxApi(connection).postReactions(post.platform, post.id)) {
                is ApiResult.Ok -> {
                    if (!connection.sameCredential(ConnectionStore.get(context).current())) return@LaunchedEffect
                    got.value.reactions.also { PostReactionsMemory.remember(key, it) }
                }
                // Not visible to you (404) has nothing to replay; anything else can try again next time.
                is ApiResult.Failed -> if (got.status == 404) emptyList<com.adhx.share.net.LiveReaction>().also { PostReactionsMemory.remember(key, it) } else return@LaunchedEffect noteAlone()
                else -> return@LaunchedEffect noteAlone()
            }
        if (!connection.sameCredential(ConnectionStore.get(context).current())) return@LaunchedEffect
        Replies.answer(kept)?.let { answers[post.key] = it }
        val plan = replayPlan(kept)
        if (plan.isEmpty() && note == null) {
            PostReactionsMemory.markReplayed(key)
            return@LaunchedEffect
        }
        delay(replayWait(SystemClock.uptimeMillis() - settledAt))
        if (!connection.sameCredential(ConnectionStore.get(context).current())) return@LaunchedEffect
        val first = PostReactionsMemory.markReplayed(key)
        if (!replayReactions && !first) return@LaunchedEffect
        val lead = if (note != null) REPLAY_GAP_MS else 0L
        note?.let { (saver, words) -> floats.add(null, words, saver) }
        plan.forEach { step -> floats.add(step.reaction.emoji, step.reaction.text, step.reaction.who, step.afterMs + lead) }
    }

    // Who's on it: asked for when the row opens, the savers on the post meanwhile.
    LaunchedEffect(whoOpen) {
        val key = whoOpen ?: return@LaunchedEffect
        val post = posts.firstOrNull { it.key == key } ?: return@LaunchedEffect
        val connection = ConnectionStore.get(context).current() ?: return@LaunchedEffect
        val got = AdhxApi(connection).who(post.platform, post.id)
        if (got is ApiResult.Ok && connection.sameCredential(ConnectionStore.get(context).current())) whoSaid[key] = got.value
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

    LaunchedEffect(jumpTo) {
        val key = jumpTo ?: return@LaunchedEffect
        val at = posts.indexOfFirst { it.key == key }
        if (at >= 0) goTo(at)
        onJumped()
    }
    LaunchedEffect(queueJump) {
        val key = queueJump ?: return@LaunchedEffect
        val at = posts.indexOfFirst { it.key == key }
        if (at >= 0) goTo(at)
        queueJump = null
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
        val p = player ?: return@LaunchedEffect
        p.repeatMode = if (repeat) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        // Switched on after the video ran out (the last post): play it again.
        if (repeat && p.playbackState == Player.STATE_ENDED) {
            p.seekTo(0)
            p.play()
        }
    }

    LaunchedEffect(notice) {
        if (notice != null) {
            delay(TOAST_MS)
            notice = null
        }
    }

    LaunchedEffect(player, mediaUrl, retryTick) {
        val from = retryFrom
        retryFrom = null
        val key = current?.key?.takeIf { mediaUrl != null }
        val samePost = key != null && key == playingKey
        // Leaving a long post part-way: remember where (not when it's the same one coming back).
        val before = playingKey
        if (before != null && !samePost && resumeOffer == null && playback.durationMs > 0) {
            resume.leave(before, playback.positionMs, playback.durationMs)
        }
        val wasAt = playback.positionMs
        playback.reset()
        val p = player ?: return@LaunchedEffect
        playingKey = key
        if (mediaUrl == null) {
            resumeOffer = null
            p.stop()
            p.clearMediaItems()
            return@LaunchedEffect
        }
        // The same post again (Try again, or back in the app): carry on. A new one
        // you left part-way waits for Resume or Start over.
        // A pending offer stays put if the same post is set up again.
        val pending = if (samePost) resumeOffer else null
        resumeOffer = when {
            from != null -> null
            pending != null -> pending
            !samePost -> key?.let { resume.spot(it) }
            else -> null
        }
        p.setMediaItem(MediaItem.fromUri(mediaUrl))
        p.prepare()
        val carryOn = from ?: wasAt.takeIf { samePost && resumeOffer == null }
        if (carryOn != null && carryOn > 1000) p.seekTo(carryOn)
        if (resumeOffer != null) {
            playback.paused = true
            p.playWhenReady = false
        } else {
            p.playWhenReady = true
        }
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
        if (playback.problem != null || resumeOffer != null) return
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
        // Not while you're answering it or looking through Up next.
        if (ended > 0 && !repeat && replyTo == null && !queueOpen) following()?.let { goTo(it) }
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
                if (playbackState == Player.STATE_ENDED) {
                    // Watched to the end: nothing to pick up next time.
                    playingKey?.let { resume.forget(it) }
                    ended++
                }
            }

            override fun onRenderedFirstFrame() {
                playback.drawn = true
            }

            override fun onPlayerError(error: PlaybackException) {
                val url = p?.currentMediaItem?.localConfiguration?.uri?.toString()
                playback.problem = if (kindNow == PostKind.AUDIO) "This sound couldn’t load." else "This video couldn’t load."
                playback.trouble = Trouble.CANT_LOAD
                failedUrl = url
            }
        }
        p?.addListener(listener)
        onDispose { p?.removeListener(listener) }
    }
    // A video that can't play says why (404/410 with `{ reason }`), like the web player.
    LaunchedEffect(failedUrl) {
        val url = failedUrl ?: return@LaunchedEffect
        // 404 or 410 is gone, with the server's words when it gave any; anything else is the connection.
        val trouble = AdhxApi.fileTrouble(url)
        if (trouble.gone && url == mediaUrl) {
            playback.trouble = Trouble.GONE
            playback.problem = trouble.reason
        }
        failedUrl = null
    }
    // Never a spinner that just sits there: no first frame after a while, and
    // nothing being kept, is "can't load" (board 14.9).
    LaunchedEffect(mediaUrl, retryTick, player != null) {
        val post = current ?: return@LaunchedEffect
        if (mediaUrl == null || player == null) return@LaunchedEffect
        delay(CantPlay.PATIENCE_MS)
        if (playback.ready || playback.trouble != null) return@LaunchedEffect
        val connection = ConnectionStore.get(context).current() ?: return@LaunchedEffect
        val status = AdhxApi(connection).status(post.platform, post.id)
        if (status is ApiResult.Ok && stillKeeping(status.value.status)) return@LaunchedEffect
        if (!playback.ready && playback.trouble == null && current?.key == post.key) {
            playback.problem = CantPlay.GENERIC
            playback.trouble = Trouble.CANT_LOAD
        }
    }

    // Above the bottom row: an answer someone left ("Pete replied · 2m"), the
    // caller's own (Live's "In …"), then why it's here, only when someone sent
    // it to you (with Reply) or For you found it like one you kept. With no
    // reason, your private save shows its lock there instead.
    val reasonChip: @Composable (PhonePost) -> Unit = { post ->
        val answer = answers[post.key]
        val lead = post.whyReasons.firstOrNull()?.takeIf { it.kind == WhyKind.SENT || it.kind == WhyKind.LIKE }
        val sender = Replies.sender(post)
        val justYou = lead == null && Privacy.isPrivate(post)
        if (answer != null || lead != null || aboveCaption != null || justYou) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                answer?.let { RepliedChip(it, server) }
                aboveCaption?.invoke(post)
                if (justYou) PrivateLock(size = 15.dp)
                if (lead != null) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ReasonChip(
                            text = lead.text.ifBlank { sender?.let { "${it.label} sent you this" } ?: "" },
                            face = sender,
                            server = server,
                            onClick = onReason?.let { open -> { open(post) } },
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (sender != null && ownReact) ReplyButton { replyTo = post }
                    }
                }
            }
        }
    }
    // The count pill: Home's place in its lineup, else where you are in the channel or search.
    val countFor: (PhonePost) -> UpNextSpot? = upNextSpot ?: { post ->
        val at = posts.indexOfFirst { it.key == post.key }
        queue?.takeIf { posts.size > 1 && at >= 0 }?.let { UpNextSpot(at + 1, posts.size, "${it.name}, ${at + 1} of ${posts.size}. Open Up next") }
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
                // Sideways, the whole video, whatever Fit video says.
                fit = fit || landscape,
                landscape = landscape,
                repeat = repeat,
                // A photo's timer waits while a sheet or picker is up, in the small window and while the app is away.
                held = more != null || original != null || sendingPost != null || reading != null || replyTo != null || queueOpen || reactingNow || inPip || player == null,
                onPhotosDone = { following()?.let { scope.launch { goTo(it) } } },
                onHide = { hidden = true },
                // Sideways hides everything, without touching what upright had.
                hidden = hidden || landscape,
                sharing = sharing == post.key,
                shareProgress = shareProgress,
                pip = inPip,
                scrub = if (page == settled) scrub else null,
                chrome = chrome,
                onScrub = { scrub = it },
                onTap = {
                    when {
                        // Sideways, a tap only pauses or plays.
                        landscape -> if (PostKind.plays(post.kind)) togglePlay()
                        hidden -> hidden = false
                        PostKind.plays(post.kind) -> togglePlay()
                    }
                },
                onRead = { reading = post },
                onMore = { more = post },
                onOriginal = { original = post },
                onSaver = onSaver,
                reason = reasonChip,
                whoOpen = whoOpen == post.key,
                who = whoSaid[post.key],
                onWho = { whoOpen = if (whoOpen == post.key) null else post.key },
                count = countFor(post),
                onCount = { if (onUpNext != null) onUpNext() else queueOpen = true },
                // Live's React (its room), or the player's own on every other post.
                onReact = onReact?.let { react -> { react(post) } } ?: {
                    reactError = null
                    picking = if (picking == null) post else null
                },
                reacting = reactingNow,
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
                onShare = {
                    // Every post goes through the send sheet: files or words, and straight to your people.
                    sendingPost = post
                },
                onSeek = { ms -> player?.seekTo(ms) },
            )
        }
        val topBarShown = !hidden && !landscape && !inPip && !(hideTopBarWhileSending && sendingPost != null)
        if (topBarShown) {
            Box(Modifier.fillMaxSize().graphicsLayer { alpha = chrome }) {
                CompositionLocalProvider(LocalPlayerToast provides notice?.text) { topBar() }
            }
        }
        if (newOnTop > 0 && !hidden && !landscape && !inPip && scrub == null) {
            NewSavesPill(
                count = newOnTop,
                onClick = { scope.launch { goTo(0) } },
                modifier = Modifier.align(Alignment.TopCenter),
            )
        }
        if (!inPip) {
            // Over the post, left of the button column, between the top bar and the bottom row (as in Live).
            FloatingReactions(
                items = floats.items,
                server = server,
                onLanded = floats::remove,
                modifier = Modifier
                    .statusBarsPadding()
                    .padding(start = 16.dp, end = 84.dp, top = 170.dp, bottom = 180.dp),
            )
        }
        // A long post you left part-way waits under "Pick up where you left off?" (board 14.2).
        val offer = resumeOffer
        if (offer != null && !inPip && current != null && PostKind.plays(current.kind)) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
                ResumeCard(
                    spot = offer,
                    onResume = {
                        resumeOffer = null
                        player?.seekTo(offer.positionMs)
                        player?.playWhenReady = true
                        playback.paused = false
                    },
                    onStartOver = {
                        resumeOffer = null
                        playingKey?.let { resume.forget(it) }
                        player?.seekTo(0)
                        player?.playWhenReady = true
                        playback.paused = false
                    },
                )
            }
        }
        // A post that can't play says why and moves on (boards 14.8, 14.9).
        val trouble = playback.trouble
        if (trouble != null && !inPip && current != null && PostKind.plays(current.kind)) {
            val next = following()?.takeIf { it < posts.size }
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CantPlayCard(
                    trouble = trouble,
                    platform = current.platform,
                    words = playback.problem,
                    sourceUrl = current.sourceUrl,
                    onNext = next?.let { { scope.launch { goTo(it) }; Unit } },
                    onRetry = {
                        retryFrom = playback.positionMs
                        retryTick++
                    },
                    onRemove = if (current.yours && current.key !in removedKeys) {
                        {
                            val post = current
                            val connection = ConnectionStore.get(context).current()
                            if (connection != null && !removing) {
                                removing = true
                                removeError = null
                                scope.launch {
                                    val result = AdhxApi(connection).removeSave(post.platform, post.id)
                                    removing = false
                                    if (result is ApiResult.Ok || (result is ApiResult.Failed && result.status == 404)) {
                                        removedKeys.add(post.key)
                                        following()?.takeIf { it < posts.size }?.let { goTo(it) }
                                    } else {
                                        removeError = "Couldn’t remove it just now. Try again."
                                    }
                                }
                            }
                        }
                    } else {
                        null
                    },
                    removing = removing,
                    removed = current.key in removedKeys,
                    removeError = removeError,
                )
            }
        }
        if (!inPip && !landscape && !(toastInTopBar && topBarShown)) notice?.let { NoticePill(it.text, Modifier.align(Alignment.TopCenter)) }
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
        if (!inPip && queueOpen && queue != null) {
            QueueSheet(
                posts = posts,
                current = settled,
                server = server,
                name = queue.name,
                note = queue.note,
                watched = watched.toSet(),
                chip = queue.chip,
                onPick = { queueJump = it },
                onDismiss = { queueOpen = false },
            )
        }
        if (!inPip) {
            replyTo?.let { post ->
                Replies.sender(post)?.let { sender ->
                    ReplySheet(
                        sender = sender,
                        server = server,
                        note = post.savers.firstOrNull { it.username == sender.username }?.note,
                        send = { emoji, text ->
                            val connection = ConnectionStore.get(context).current()
                            val sent = connection != null &&
                                AdhxApi(connection).reactToPost(post.platform, post.id, emoji = emoji, text = text) is ApiResult.Ok
                            if (sent && connection != null) {
                                val me = Saver(username = connection.username ?: "you", name = Copy.YOU, avatarUrl = connection.avatarUrl, isYou = true)
                                floats.add(emoji, text, me)
                                notice = Notice("Sent to ${sender.label}")
                            }
                            sent
                        },
                        onDismiss = { replyTo = null },
                    )
                }
            }
        }
        if (!inPip) {
            sendingPost?.let { post -> SendSheet(post, server, onNotice = { text -> notice = Notice(text) }, onDismiss = { sendingPost = null }) }
        }
        if (!inPip) {
            original?.let { post -> OriginalSheet(post, server, onNotice = { text -> notice = Notice(text) }, onDismiss = { original = null }) }
        }
        if (!inPip) {
            more?.let { post ->
                val plays = PostKind.plays(post.kind)
                // Save to phone keeps the video, sound or every photo (the words are in Copy the words).
                val canSave = post.media.isNotEmpty() && (ShareKept.files(post, server).isEmpty() || SaveToPhone.supported)
                MoreSheet(
                    post,
                    server,
                    onNotice = { text -> notice = Notice(text) },
                    onDismiss = { more = null },
                    onSaveToPhone = if (canSave) {
                        {
                            if (saving == null) {
                                saving = post.key
                                notice = Notice("Saving to your phone…")
                                scope.launch {
                                    val said = ShareKept.save(context, server, post)
                                    saving = null
                                    if (said == ShareKept.COPIED) Toast.makeText(context, said, Toast.LENGTH_SHORT).show() else notice = Notice(said)
                                }
                            }
                        }
                    } else {
                        null
                    },
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
private fun NoticePill(text: String, modifier: Modifier = Modifier) =
    ToastPill(text, modifier.statusBarsPadding().padding(top = 64.dp, start = 24.dp, end = 24.dp))

/** How long a short message ("Link copied") stays up. */
private const val TOAST_MS = 3_000L

/**
 * The player's short message while one is up ("Words copied", "Link copied"),
 * for a [PlayerScreen] top bar that shows it in place of its pill
 * (`toastInTopBar`); null otherwise.
 */
val LocalPlayerToast = compositionLocalOf<String?> { null }

/** A short message: dark words on a cream pill. */
@Composable
fun ToastPill(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        fontSize = 14.sp,
        fontWeight = FontWeight.Bold,
        color = AdhxColors.Black,
        textAlign = TextAlign.Center,
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .background(AdhxColors.Cream)
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .semantics { liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite },
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
    landscape: Boolean,
    repeat: Boolean,
    held: Boolean,
    onPhotosDone: () -> Unit,
    onHide: () -> Unit,
    hidden: Boolean,
    sharing: Boolean,
    shareProgress: Float?,
    pip: Boolean,
    scrub: Float?,
    chrome: Float,
    onScrub: (Float?) -> Unit,
    onTap: () -> Unit,
    onRead: () -> Unit,
    onMore: () -> Unit,
    onOriginal: () -> Unit,
    onSaver: ((Saver) -> Unit)?,
    reason: @Composable (PhonePost) -> Unit,
    whoOpen: Boolean,
    who: WhoResponse?,
    onWho: () -> Unit,
    count: UpNextSpot?,
    onCount: () -> Unit,
    onReact: (() -> Unit)?,
    reacting: Boolean,
    onKeep: (() -> Unit)?,
    keeping: Boolean,
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
                onClick = { if ((!hidden || landscape) && timed && onScreen) timer = timer.toggled() else onTap() },
            ),
    ) {
        when {
            plays -> MediaPage(post, server, onScreen, player, playback, pip, fit, whole = landscape)
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
            // One row along the bottom (board 15.7), 30dp up and clear of the
            // gesture bar so scrubbing never swipes between apps; the reason chip
            // sits just above it and the button column 18dp higher.
            val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
            // With Live's React picker open, everything sits just above it, as on the boards.
            val rowBottom = maxOf(ROW_BOTTOM, navBottom + 8.dp) + if (reacting) REACT_PICKER_HEIGHT else 0.dp
            Box(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .height(navBottom + 300.dp)
                    .graphicsLayer { alpha = chrome }
                    .background(
                        Brush.verticalGradient(
                            0f to Color.Transparent,
                            0.45f to Color.Black.copy(alpha = 0.4f),
                            1f to Color.Black.copy(alpha = 0.85f),
                        ),
                    ),
            )
            Column(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .graphicsLayer { alpha = chrome }
                    .padding(start = 16.dp, end = 84.dp, bottom = rowBottom + ROW_HEIGHT + 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (photos.size > 1) Dots(count = photos.size, current = album.currentPage)
                reason(post)
            }
            ActionColumn(
                post = post,
                sharing = sharing,
                shareProgress = shareProgress,
                onKeep = onKeep,
                keeping = keeping,
                onShare = onShare,
                onMore = onMore,
                onOriginal = onOriginal,
                onReact = onReact,
                reacting = reacting,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .graphicsLayer { alpha = chrome }
                    .padding(end = 12.dp, bottom = rowBottom + ROW_HEIGHT + 18.dp),
            )
            BottomRow(
                post = post,
                server = server,
                whoOpen = whoOpen,
                who = who,
                onWho = onWho,
                onSaver = onSaver,
                playback = if (onScreen && plays) playback else null,
                photo = if (timed && onScreen) { { timerState.value.fraction } } else null,
                scrub = scrub,
                onScrub = onScrub,
                onSeek = onSeek,
                count = count,
                onCount = onCount,
                // The line stays while it's dragged; the rest fades with the chrome.
                chrome = chrome,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(bottom = rowBottom),
            )
            if (scrub != null && onScreen && plays) {
                ScrubTime(
                    elapsedMs = (scrub * playback.durationMs).toLong(),
                    totalMs = playback.durationMs,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = rowBottom + ROW_HEIGHT + 24.dp),
                )
            }
        }
    }
}

/** The bottom row: 44dp tall, 30dp above the bottom of the screen. */
private val ROW_HEIGHT = 44.dp
private val ROW_BOTTOM = 30.dp

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
    /** Sideways: everything shows whole, a sound's cover too. */
    whole: Boolean = false,
) {
    val media = post.media.firstOrNull()
    val poster = media?.posterUrl?.let { AdhxApi.resolve(server, it)?.toString() }
    // Full bleed, as on the boards (the picture covers the screen), or the whole
    // video at its own shape with Fit video on. A sound's cover always fills.
    val fills = !whole && (post.kind == PostKind.AUDIO || !fit)
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
                problem != null && playback.trouble == null -> Text(
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
                playback.trouble != null -> Unit
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
    // A kept X article has its whole body: shown instead of the post's own words (usually just its link) and the summary.
    val body = remember(article?.body) { ArticleBody.parse(article?.body) }
    val short = body.isEmpty() && (title.orEmpty().length + post.text.length) < SHORT_WORDS
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
            if (body.isNotEmpty()) {
                ArticleBodyText(body, size = 20.sp, lineHeight = 29.sp)
            } else {
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
 * Bottom left, over the post: who of your people saved it (faces and "Ana and
 * Ben saved this · 2h", a lock when it's just for you), or just the lock. Who
 * posted it and their words are behind the network's button on the rail
 * ([OriginalSheet]).
 */
/**
 * The column of round buttons on the right (board 15.7): React, Save (keep a
 * friend's post in your own saves; lit when it's yours), Share (send it),
 * the network's own mark (the original post) and More. Save to phone, Sound,
 * Repeat, the small window and Hide are in More.
 */
@Composable
private fun ActionColumn(
    post: PhonePost,
    sharing: Boolean,
    shareProgress: Float?,
    onKeep: (() -> Unit)?,
    keeping: Boolean,
    onShare: () -> Unit,
    onMore: () -> Unit,
    onOriginal: () -> Unit,
    onReact: (() -> Unit)?,
    reacting: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier.width(52.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
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
        // Send it: the kept file itself (or the words), and straight to your people.
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
                !sharing -> ActionIcon(rememberVectorPainter(Glyphs.Send))
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
        // The network's own mark: who posted it, all their words, and the way to the original.
        ActionButton(description = "The original post on ${Networks.name(post.platform) ?: "the web"}", onClick = onOriginal) {
            NetworkMark(post.platform, size = 22.dp, tint = AdhxColors.Cream)
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
 * The one row along the bottom (board 15.7): the first saver's face (with
 * "+N" when others saved it too), the scrub line between and the count pill
 * that opens Up next. Tapping the face swaps the row for who's on it
 * (board 15.9); its ✕ (or the next post) puts it back. While the line is
 * dragged only the line stays ([chrome] fades the rest).
 */
@Composable
private fun BottomRow(
    post: PhonePost,
    server: String,
    whoOpen: Boolean,
    who: WhoResponse?,
    onWho: () -> Unit,
    onSaver: ((Saver) -> Unit)?,
    playback: Playback?,
    photo: (() -> Float)?,
    scrub: Float?,
    onScrub: (Float?) -> Unit,
    onSeek: (Long) -> Unit,
    count: UpNextSpot?,
    onCount: () -> Unit,
    chrome: Float,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .fillMaxWidth()
            .height(ROW_HEIGHT)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (whoOpen) {
            Box(Modifier.graphicsLayer { alpha = chrome }) { WhoClose(onWho) }
            Box(
                Modifier
                    .graphicsLayer { alpha = chrome }
                    .width(1.dp)
                    .height(28.dp)
                    .background(AdhxColors.White.copy(alpha = 0.2f)),
            )
            WhoRow(
                faces = who?.let(Who::faces) ?: Who.faces(post.savers),
                server = server,
                onSaver = onSaver,
                modifier = Modifier.weight(1f).graphicsLayer { alpha = chrome },
            )
            return@Row
        }
        Who.firstSaver(post.savers)?.let { first ->
            Box(Modifier.graphicsLayer { alpha = chrome }) {
                FirstFace(first, Who.badge(post.savers), Who.buttonLabel(post.savers), server, onWho)
            }
        }
        Box(Modifier.weight(1f)) {
            when {
                playback != null -> {
                    val duration = playback.durationMs
                    ScrubLine(
                        fraction = scrub ?: playback.fraction,
                        dragging = scrub != null,
                        enabled = duration > 0,
                        onDrag = onScrub,
                        onRelease = { at ->
                            onSeek((at * duration).toLong())
                            onScrub(null)
                        },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                // A photo's line shows its time on screen and can't be dragged.
                photo != null -> ScrubLine(
                    fraction = photo(),
                    dragging = false,
                    enabled = false,
                    onDrag = {},
                    onRelease = {},
                    label = "Time on this photo",
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        count?.let { spot -> Box(Modifier.graphicsLayer { alpha = chrome }) { CountPill(spot, onCount) } }
    }
}

/** The first saver's face, 34dp in a 44dp button, with a cream "+2" when others saved it too. No circle round the face. */
@Composable
private fun FirstFace(saver: Saver, badge: String?, label: String, server: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clickable(onClickLabel = label, role = Role.Button, onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = label
                role = Role.Button
            },
        contentAlignment = Alignment.Center,
    ) {
        Avatar(saver, server, size = 34.dp)
        if (badge != null) {
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .offset(x = 2.dp, y = 0.dp)
                    .border(2.dp, AdhxColors.Black, RoundedCornerShape(50))
                    .padding(2.dp)
                    .heightIn(min = 16.dp)
                    .widthIn(min = 16.dp)
                    .clip(RoundedCornerShape(50))
                    .background(AdhxColors.Cream)
                    .padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(badge, fontSize = 10.sp, lineHeight = 12.sp, fontWeight = FontWeight.ExtraBold, color = Color.Black)
            }
        }
    }
}

/** "5 of 51" with the list mark, frosted: opens Up next. */
@Composable
private fun CountPill(spot: UpNextSpot, onClick: () -> Unit) {
    Box(
        Modifier
            .height(44.dp)
            .clickable(onClickLabel = "Open Up next", role = Role.Button, onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = spot.description
                role = Role.Button
            },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier
                .height(36.dp)
                .clip(RoundedCornerShape(50))
                .background(Color.Black.copy(alpha = 0.5f))
                .border(1.dp, AdhxColors.White.copy(alpha = 0.14f), RoundedCornerShape(50))
                .padding(horizontal = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(Glyphs.Lines, contentDescription = null, tint = AdhxColors.Accent, modifier = Modifier.size(14.dp))
            Text("${spot.position} of ${spot.count}", fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.Cream, maxLines = 1, softWrap = false)
        }
    }
}

/** The round frosted ✕ in the face's place while who's on it is showing. */
@Composable
private fun WhoClose(onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.5f))
            .border(1.dp, AdhxColors.White.copy(alpha = 0.14f), CircleShape)
            .clickable(onClickLabel = WHO_CLOSE, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = WHO_CLOSE },
        contentAlignment = Alignment.Center,
    ) {
        Icon(Glyphs.Close, contentDescription = null, tint = AdhxColors.Cream, modifier = Modifier.size(18.dp))
    }
}

private const val WHO_CLOSE = "Close who’s on this one"

/**
 * Who's on it (board 15.9): one face per person, savers first, then
 * watchers. Stickers keep their corners: saved bottom-right, a reaction
 * top-right, watched bottom-left. Scrolls sideways; the right edge fades.
 */
@Composable
private fun WhoRow(faces: List<WhoFace>, server: String, onSaver: ((Saver) -> Unit)?, modifier: Modifier = Modifier) {
    val savers = faces.count { it.saved }
    val scroll = rememberScrollState()
    Box(modifier.height(56.dp)) {
        Row(
            Modifier
                .fillMaxSize()
                .horizontalScroll(scroll)
                .semantics { contentDescription = "On this one" }
                .padding(start = 10.dp, end = 28.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            faces.forEachIndexed { i, face ->
                val label = Who.label(face, firstOfSeveral = i == 0 && face.saved && savers > 1)
                Box(
                    Modifier
                        .then(
                            if (onSaver != null) {
                                Modifier.clickable(onClickLabel = "Open ${face.saver.label}", role = Role.Button) { onSaver(face.saver) }
                            } else {
                                Modifier
                            },
                        )
                        .clearAndSetSemantics {
                            contentDescription = label
                            if (onSaver != null) role = Role.Button
                        },
                ) {
                    Avatar(face.saver, server, size = 36.dp)
                    if (face.saved) {
                        Sticker(AdhxColors.Accent, Modifier.align(Alignment.BottomEnd).offset(x = 7.dp, y = 6.dp)) {
                            Icon(Glyphs.BookmarkFilled, contentDescription = null, tint = Color.Black, modifier = Modifier.size(11.dp))
                        }
                    }
                    face.emoji?.let { emoji ->
                        Sticker(AdhxColors.Cream, Modifier.align(Alignment.TopEnd).offset(x = 7.dp, y = (-6).dp)) {
                            Text(emoji, fontSize = 11.sp, lineHeight = 12.sp)
                        }
                    }
                    if (face.watched) {
                        Sticker(WatchedGrey, Modifier.align(Alignment.BottomStart).offset(x = (-7).dp, y = 6.dp)) {
                            Icon(Glyphs.Eye, contentDescription = null, tint = AdhxColors.Cream, modifier = Modifier.size(12.dp))
                        }
                    }
                }
            }
        }
        // More to the right: the edge fades.
        if (scroll.canScrollForward) {
            Box(
                Modifier
                    .align(Alignment.CenterEnd)
                    .fillMaxHeight()
                    .width(36.dp)
                    .background(Brush.horizontalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.7f)))),
            )
        }
    }
}

private val WatchedGrey = Color(0xFF4A453E)

/** A 20dp round sticker on a face, with a black gap round it. */
@Composable
private fun Sticker(background: Color, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(
        modifier
            .size(24.dp)
            .clip(CircleShape)
            .background(Color.Black)
            .padding(2.dp)
            .clip(CircleShape)
            .background(background),
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

/**
 * Why it's here, small and frosted above the bottom row: "Ana sent you
 * this" with Ana's face, or For you's "Like … you kept".
 */
@Composable
private fun ReasonChip(text: String, face: Saver?, server: String, onClick: (() -> Unit)?, modifier: Modifier = Modifier) {
    Row(
        modifier
            .height(34.dp)
            .clip(RoundedCornerShape(50))
            .background(Color.Black.copy(alpha = 0.5f))
            .border(1.dp, AdhxColors.White.copy(alpha = 0.14f), RoundedCornerShape(50))
            .then(if (onClick != null) Modifier.clickable(onClickLabel = Copy.WHY_TITLE, onClick = onClick) else Modifier)
            .padding(start = if (face != null) 5.dp else 10.dp, end = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        if (face != null) {
            Avatar(face, server, size = 24.dp)
        } else {
            Icon(Glyphs.Heart, contentDescription = null, tint = AdhxColors.Accent, modifier = Modifier.size(15.dp))
        }
        Text(text, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = AdhxColors.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/**
 * The line to seek with, in a 44dp touch area: a 4dp track, white fill and a
 * 14dp handle (18dp while dragged). Tapping it seeks there. A line that can't
 * be dragged (a photo's time) has no handle.
 */
@Composable
private fun ScrubLine(
    fraction: Float,
    dragging: Boolean,
    enabled: Boolean,
    onDrag: (Float) -> Unit,
    onRelease: (Float) -> Unit,
    modifier: Modifier = Modifier,
    label: String = "Playback position",
) {
    val drag by rememberUpdatedState(onDrag)
    val release by rememberUpdatedState(onRelease)
    val track = Color.White.copy(alpha = 0.25f)
    Canvas(
        modifier
            .height(ROW_HEIGHT)
            .semantics {
                contentDescription = label
                progressBarRangeInfo = ProgressBarRangeInfo(fraction.coerceIn(0f, 1f), 0f..1f)
            }
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
                        // Follow the finger itself, so the handle stays under it.
                        at = (change.position.x / size.width).coerceIn(0f, 1f)
                        drag(at)
                    },
                    onDragEnd = { release(at) },
                    onDragCancel = { release(at) },
                )
            },
    ) {
        val thickness = 4.dp.toPx()
        val y = size.height / 2
        val x = fraction.coerceIn(0f, 1f) * size.width
        drawLine(track, Offset(thickness / 2, y), Offset(size.width - thickness / 2, y), thickness, StrokeCap.Round)
        if (x > 0f) drawLine(AdhxColors.Cream, Offset(thickness / 2, y), Offset(x.coerceAtLeast(thickness / 2), y), thickness, StrokeCap.Round)
        if (enabled) {
            val r = (if (dragging) 9.dp else 7.dp).toPx()
            val at = Offset(x.coerceIn(r, size.width - r), y)
            drawCircle(Color.Black.copy(alpha = 0.35f), r + 1.dp.toPx(), at + Offset(0f, 1.dp.toPx()))
            drawCircle(AdhxColors.Cream, r, at)
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

/** The activity behind a [Context], unwrapping themes and the like. */
private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
