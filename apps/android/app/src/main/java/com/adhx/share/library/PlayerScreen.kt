package com.adhx.share.library

import android.content.Context
import android.content.Intent
import android.view.LayoutInflater
import androidx.annotation.OptIn
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
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
import coil.compose.AsyncImage
import com.adhx.share.R
import com.adhx.share.links.Links
import com.adhx.share.links.Networks
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.PhonePost
import com.adhx.share.net.PostKind
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.NetworkMark
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.Spinner
import com.adhx.share.ui.openUrl
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** How the post on screen is playing. */
private class Playback {
    var ready by mutableStateOf(false)
    var paused by mutableStateOf(false)
    var problem by mutableStateOf<String?>(null)
    var positionMs by mutableLongStateOf(0L)
    var durationMs by mutableLongStateOf(0L)

    fun reset() {
        ready = false
        paused = false
        problem = null
        positionMs = 0L
        durationMs = 0L
    }
}

/** A short line near the top ("Repeating this one", "Saved to your phone"). */
private data class Notice(val text: String, val at: Long = System.nanoTime())

/** A soft dark shadow, only for words laid over a picture or video. */
private val OverMedia = TextStyle(shadow = Shadow(Color.Black.copy(alpha = 0.6f), Offset(0f, 1f), 6f))

/**
 * The player: one post at a time, full screen. Swipe up for the next save,
 * down for the previous; tap to pause or play. One ExoPlayer is shared by
 * every page and plays the page the pager settled on. Videos start muted; with
 * Repeat off a video that ends moves on to the next save, with Repeat on it
 * loops. Hide clears everything but a thin progress line until the next tap.
 * [posts] must not be empty.
 */
@Composable
fun PlayerScreen(
    posts: List<PhonePost>,
    server: String,
    startIndex: Int,
    onPage: (Int) -> Unit,
    topBar: @Composable BoxScope.() -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val pager = rememberPagerState(initialPage = startIndex.coerceIn(0, (posts.size - 1).coerceAtLeast(0))) { posts.size }
    var muted by rememberSaveable { mutableStateOf(true) }
    var repeat by rememberSaveable { mutableStateOf(false) }
    var hidden by rememberSaveable { mutableStateOf(false) }
    var notice by remember { mutableStateOf<Notice?>(null) }
    var saving by remember { mutableStateOf<String?>(null) }
    var player by remember { mutableStateOf<ExoPlayer?>(null) }
    val playback = remember { Playback() }
    var reading by remember { mutableStateOf<PhonePost?>(null) }
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
        onPage(settled)
    }

    // Something new on top (saved while the app was away): show it.
    val firstKey = posts.firstOrNull()?.key
    val initialFirst = remember { firstKey }
    LaunchedEffect(firstKey) {
        if (firstKey != initialFirst && pager.currentPage <= 1) pager.scrollToPage(0)
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

    // With Repeat off, a video that ends moves on to the next save.
    var ended by remember { mutableIntStateOf(0) }
    LaunchedEffect(ended) {
        if (ended > 0 && !repeat) step(1)?.let { pager.animateScrollToPage(it) }
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
            val post = posts.getOrNull(page) ?: return@VerticalPager
            PostPage(
                post = post,
                server = server,
                onScreen = page == settled,
                player = player,
                playback = playback,
                muted = muted,
                repeat = repeat,
                hidden = hidden,
                saving = saving == post.key,
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
                onPip = if (pip?.supported == true && post.kind == PostKind.VIDEO) {
                    { pip.enter() }
                } else {
                    null
                },
                onToggleMute = { muted = !muted },
                onToggleRepeat = {
                    repeat = !repeat
                    notice = Notice(if (repeat) "Repeating this one" else "Plays the next save when this ends")
                },
                onSave = { url, name ->
                    if (saving == null) {
                        saving = post.key
                        scope.launch {
                            val ok = SaveToPhone.save(context, url, name)
                            saving = null
                            notice = Notice(if (ok) "Saved to your phone" else "Couldn’t save this to your phone")
                        }
                    }
                },
                onSeek = { ms -> player?.seekTo(ms) },
                onHide = { hidden = true },
            )
        }
        if (!hidden && !inPip) {
            Box(Modifier.fillMaxSize().graphicsLayer { alpha = chrome }) { topBar() }
        }
        if (!inPip) notice?.let { NoticePill(it.text, Modifier.align(Alignment.TopCenter)) }
        reading?.let { Reader(it, onClose = { reading = null }) }
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
    muted: Boolean,
    repeat: Boolean,
    hidden: Boolean,
    saving: Boolean,
    pip: Boolean,
    scrub: Float?,
    chrome: Float,
    onScrub: (Float?) -> Unit,
    onTap: () -> Unit,
    onRead: () -> Unit,
    onPip: (() -> Unit)?,
    onToggleMute: () -> Unit,
    onToggleRepeat: () -> Unit,
    onSave: (url: String, name: String) -> Unit,
    onSeek: (Long) -> Unit,
    onHide: () -> Unit,
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

    // What Save keeps: the video (or sound), or the photo on screen.
    val save: (() -> Unit)? = when {
        !SaveToPhone.supported -> null
        plays -> post.media.firstOrNull()?.url?.let { AdhxApi.resolve(server, it)?.toString() }?.let { url ->
            { onSave(url, SaveToPhone.fileName(post.platform, post.id)) }
        }
        photos.isNotEmpty() -> {
            {
                val index = album.currentPage.coerceIn(0, photos.lastIndex)
                onSave(photos[index], SaveToPhone.fileName(post.platform, post.id, index.takeIf { photos.size > 1 }))
            }
        }
        else -> null
    }

    Box(
        Modifier
            .fillMaxSize()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClickLabel = when {
                    hidden -> "Show controls"
                    plays -> if (playback.paused) "Play" else "Pause"
                    else -> null
                },
                onClick = onTap,
            ),
    ) {
        when {
            plays -> MediaPage(post, server, onScreen, player, playback, pip)
            post.kind == PostKind.PHOTO && photos.isNotEmpty() -> Album(photos, album, hidden || pip)
            else -> WordsCard(post, onRead)
        }
        if (pip) {
            // The small window shows only the video.
        } else if (hidden) {
            if (onScreen && plays) {
                ProgressLine(
                    playback,
                    Modifier
                        .align(Alignment.BottomStart)
                        .navigationBarsPadding(),
                )
            }
        } else {
            // The caption and the column sit 64dp above the bottom (plus the gesture bar),
            // and fade out while the scrub line is dragged.
            Column(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .graphicsLayer { alpha = chrome }
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.75f))))
                    .padding(top = 36.dp)
                    .navigationBarsPadding()
                    .padding(bottom = 64.dp),
            ) {
                if (photos.size > 1) Dots(count = photos.size, current = album.currentPage)
                Caption(
                    post = post,
                    muted = if (plays) muted else null,
                    repeat = if (plays) repeat else null,
                    saving = saving,
                    onToggleMute = onToggleMute,
                    onToggleRepeat = onToggleRepeat,
                    onSave = save,
                )
            }
            val gestureBar = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() > 0.dp
            BottomRow(
                playback = if (onScreen && plays) playback else null,
                scrub = scrub,
                onScrub = onScrub,
                onSeek = onSeek,
                onHide = onHide,
                onPip = onPip.takeIf { onScreen },
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(bottom = if (gestureBar) 26.dp else 14.dp),
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
) {
    val media = post.media.firstOrNull()
    val poster = media?.posterUrl?.let { AdhxApi.resolve(server, it)?.toString() }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        if (poster != null) {
            AsyncImage(
                model = poster,
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (onScreen && player != null && post.kind == PostKind.VIDEO) {
            AndroidView(
                factory = { ctx -> LayoutInflater.from(ctx).inflate(R.layout.player_view, null) as PlayerView },
                update = { view -> if (view.player !== player) view.player = player },
                onRelease = { view -> view.player = null },
                modifier = Modifier.fillMaxSize(),
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
                    modifier = Modifier
                        .padding(32.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color.Black.copy(alpha = 0.7f))
                        .padding(16.dp),
                )
                !playback.ready -> Spinner(size = 34.dp, stroke = 3.dp)
                playback.paused -> Box(
                    Modifier
                        .size(88.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.55f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = AdhxColors.White, modifier = Modifier.size(52.dp))
                }
            }
        }
    }
}

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
            .padding(start = 24.dp, end = 24.dp, top = 110.dp, bottom = 200.dp),
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
                    post.text,
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
 * Over the bottom: on the left the @handle and the first lines of text; on the
 * right a column of round buttons (Sound, Repeat, Save, Share, Original).
 */
@Composable
private fun Caption(
    post: PhonePost,
    muted: Boolean?,
    repeat: Boolean?,
    saving: Boolean,
    onToggleMute: () -> Unit,
    onToggleRepeat: () -> Unit,
    onSave: (() -> Unit)?,
) {
    val context = LocalContext.current
    val words = post.kind == PostKind.TEXT || post.kind == PostKind.ARTICLE
    val handle = Copy.handle(post.author.handle)
        ?: post.author.name?.takeIf { it.isNotBlank() }
        ?: Networks.name(post.platform)
        ?: ""
    val source = post.sourceUrl?.takeIf { it.isNotBlank() }
    Row(
        Modifier.padding(start = 18.dp, end = 12.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Column(Modifier.weight(1f).padding(end = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                handle,
                style = OverMedia,
                fontSize = 15.sp,
                fontWeight = FontWeight.ExtraBold,
                color = AdhxColors.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!words && post.text.isNotBlank()) {
                Text(
                    post.text,
                    style = OverMedia,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    color = AdhxColors.Cream,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            if (muted != null) {
                ActionButton(label = "Sound", description = if (muted) "Sound on" else "Sound off", onClick = onToggleMute) {
                    ActionIcon(painterResource(if (muted) R.drawable.ic_sound_off else R.drawable.ic_sound_on))
                }
            }
            if (repeat != null) {
                ActionButton(
                    label = "Repeat",
                    description = if (repeat) "Repeat off" else "Repeat this one",
                    on = repeat,
                    onClick = onToggleRepeat,
                ) {
                    ActionIcon(painterResource(R.drawable.ic_repeat_one), tint = if (repeat) AdhxColors.Black else AdhxColors.White)
                }
            }
            if (onSave != null) {
                ActionButton(label = "Save", description = "Save to your phone", onClick = { if (!saving) onSave() }) {
                    if (saving) Spinner(size = 20.dp, stroke = 2.dp) else ActionIcon(painterResource(R.drawable.ic_save_to_phone))
                }
            }
            if (source != null) {
                ActionButton(label = "Share", description = "Share", onClick = { shareLink(context, source) }) {
                    ActionIcon(rememberVectorPainter(Icons.Filled.Share), size = 21)
                }
                ActionButton(
                    label = "Original",
                    description = "Open on ${Networks.name(post.platform) ?: "its site"}",
                    onClick = { openUrl(context, source) },
                ) {
                    NetworkMark(post.platform, size = 20.dp)
                }
            }
        }
    }
}

@Composable
private fun ActionIcon(painter: Painter, tint: Color = AdhxColors.White, size: Int = 22) {
    Icon(painter, contentDescription = null, tint = tint, modifier = Modifier.size(size.dp))
}

/** A round dark button with a small label underneath, in the column on the right. */
@Composable
private fun ActionButton(
    label: String,
    description: String,
    onClick: () -> Unit,
    on: Boolean = false,
    icon: @Composable () -> Unit,
) {
    Column(
        Modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClickLabel = description, onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = description },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Box(
            Modifier
                .size(46.dp)
                .clip(CircleShape)
                .background(if (on) AdhxColors.Accent else Color.Black.copy(alpha = 0.5f)),
            contentAlignment = Alignment.Center,
        ) {
            icon()
        }
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = AdhxColors.White)
    }
}

/**
 * The scrub line, then the small window and Hide as plain glyphs. Photos and
 * words get just the glyphs. No time at rest: it shows large while dragging.
 */
@Composable
private fun BottomRow(
    playback: Playback?,
    scrub: Float?,
    onScrub: (Float?) -> Unit,
    onSeek: (Long) -> Unit,
    onHide: () -> Unit,
    onPip: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .fillMaxWidth()
            .padding(start = 14.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (playback != null) {
            val duration = playback.durationMs
            val fraction = if (duration > 0) (playback.positionMs.toFloat() / duration).coerceIn(0f, 1f) else 0f
            ScrubLine(
                fraction = scrub ?: fraction,
                dragging = scrub != null,
                enabled = duration > 0,
                onDrag = onScrub,
                onRelease = { at ->
                    onSeek((at * duration).toLong())
                    onScrub(null)
                },
                modifier = Modifier.weight(1f),
            )
        } else {
            Spacer(Modifier.weight(1f))
        }
        Spacer(Modifier.width(4.dp))
        if (onPip != null) Glyph(painterResource(R.drawable.ic_pip), "Keep playing in a small window", onPip)
        Glyph(painterResource(R.drawable.ic_hide_overlay), "Hide controls", onHide)
    }
}

/**
 * A full-width line to seek with: 3dp with a 12dp dot at rest, 6dp with a
 * 20dp thumb while dragged. Tapping it seeks there.
 */
@Composable
private fun ScrubLine(
    fraction: Float,
    dragging: Boolean,
    enabled: Boolean,
    onDrag: (Float) -> Unit,
    onRelease: (Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    val drag by rememberUpdatedState(onDrag)
    val release by rememberUpdatedState(onRelease)
    val track = AdhxColors.White.copy(alpha = 0.3f)
    Canvas(
        modifier
            .height(44.dp)
            .semantics { contentDescription = "Seek" }
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
        val radius = (if (dragging) 10.dp else 6.dp).toPx()
        val y = size.height / 2
        val x = (fraction * size.width).coerceIn(radius, size.width - radius)
        drawLine(track, Offset(0f, y), Offset(size.width, y), thickness, StrokeCap.Round)
        drawLine(AdhxColors.Accent, Offset(0f, y), Offset(x, y), thickness, StrokeCap.Round)
        drawCircle(AdhxColors.Accent, radius, Offset(x, y))
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

/** The thin line left at the bottom while the controls are hidden. */
@Composable
private fun ProgressLine(playback: Playback, modifier: Modifier = Modifier) {
    val duration = playback.durationMs
    val fraction = if (duration > 0) (playback.positionMs.toFloat() / duration).coerceIn(0f, 1f) else 0f
    Box(
        modifier
            .fillMaxWidth()
            .height(3.dp)
            .background(AdhxColors.White.copy(alpha = 0.2f)),
    ) {
        Box(
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(fraction)
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

/** The system share sheet, with the post's own link. */
private fun shareLink(context: Context, url: String) {
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
    context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

/** A round button over the player (the top bar). */
@Composable
fun BarButton(painter: Painter, label: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.45f))
            .clickable(onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(painter, contentDescription = null, tint = AdhxColors.White, modifier = Modifier.size(22.dp))
    }
}

@Composable
fun BarButton(icon: ImageVector, label: String, onClick: () -> Unit) =
    BarButton(rememberVectorPainter(icon), label, onClick)
