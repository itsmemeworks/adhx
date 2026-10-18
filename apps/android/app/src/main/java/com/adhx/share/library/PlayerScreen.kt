package com.adhx.share.library

import android.content.Context
import android.content.Intent
import android.view.LayoutInflater
import androidx.annotation.OptIn
import androidx.compose.foundation.background
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
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

/** How the post on screen is playing. */
private class Playback {
    var ready by mutableStateOf(false)
    var paused by mutableStateOf(false)
    var problem by mutableStateOf<String?>(null)
    var progress by mutableFloatStateOf(0f)

    fun reset() {
        ready = false
        paused = false
        problem = null
        progress = 0f
    }
}

/**
 * The player: one post at a time, full screen, swipe up for the next. One
 * ExoPlayer is shared by every page and plays the page the pager settled on.
 * Videos loop, start muted and pause on tap; photo albums swipe sideways;
 * words show as a card. [posts] must not be empty.
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
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val pager = rememberPagerState(initialPage = startIndex.coerceIn(0, (posts.size - 1).coerceAtLeast(0))) { posts.size }
    var muted by rememberSaveable { mutableStateOf(true) }
    var player by remember { mutableStateOf<ExoPlayer?>(null) }
    val playback = remember { Playback() }

    // Only while the app is in front: the decoder is let go as soon as it isn't.
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> if (player == null) player = buildPlayer(context)
                Lifecycle.Event.ON_PAUSE -> {
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

    LaunchedEffect(settled) { onPage(settled) }

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
            val duration = p.duration
            playback.progress = if (duration > 0) (p.currentPosition.toFloat() / duration).coerceIn(0f, 1f) else 0f
            delay(250)
        }
    }

    var failedUrl by remember { mutableStateOf<String?>(null) }
    val kindNow by rememberUpdatedState(current?.kind)
    DisposableEffect(player) {
        val p = player
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_READY) playback.ready = true
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
                onToggleMute = { muted = !muted },
                onTogglePause = {
                    val p = player
                    if (p != null && playback.problem == null) {
                        playback.paused = !playback.paused
                        p.playWhenReady = !playback.paused
                    }
                },
            )
        }
        topBar()
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
            repeatMode = Player.REPEAT_MODE_ONE
            volume = 0f
        }
}

private val MOVIE = AudioAttributes.Builder()
    .setUsage(C.USAGE_MEDIA)
    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
    .build()

@Composable
private fun PostPage(
    post: PhonePost,
    server: String,
    onScreen: Boolean,
    player: ExoPlayer?,
    playback: Playback,
    muted: Boolean,
    onToggleMute: () -> Unit,
    onTogglePause: () -> Unit,
) {
    val photos = remember(post.key, server) {
        if (post.kind == PostKind.PHOTO) {
            post.media.mapNotNull { m -> (m.url.ifBlank { m.posterUrl })?.let { AdhxApi.resolve(server, it)?.toString() } }
        } else {
            emptyList()
        }
    }
    val album = rememberPagerState { photos.size }

    Box(Modifier.fillMaxSize()) {
        when {
            PostKind.plays(post.kind) -> MediaPage(
                post = post,
                server = server,
                onScreen = onScreen,
                player = player,
                playback = playback,
                onTogglePause = onTogglePause,
            )
            post.kind == PostKind.PHOTO && photos.isNotEmpty() -> Album(photos, album)
            else -> WordsCard(post)
        }
        Column(Modifier.align(Alignment.BottomStart).fillMaxWidth()) {
            if (photos.size > 1) Dots(count = photos.size, current = album.currentPage)
            Caption(
                post = post,
                progress = if (onScreen && PostKind.plays(post.kind)) playback.progress else null,
                muted = if (PostKind.plays(post.kind)) muted else null,
                onToggleMute = onToggleMute,
            )
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
    onTogglePause: () -> Unit,
) {
    val media = post.media.firstOrNull()
    val poster = media?.posterUrl?.let { AdhxApi.resolve(server, it)?.toString() }
    Box(
        Modifier
            .fillMaxSize()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClickLabel = if (playback.paused) "Play" else "Pause",
                onClick = onTogglePause,
            ),
        contentAlignment = Alignment.Center,
    ) {
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
        if (onScreen) {
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
                        .size(72.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.55f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null, tint = AdhxColors.White, modifier = Modifier.size(40.dp))
                }
            }
        }
    }
}

@Composable
private fun Album(photos: List<String>, state: PagerState) {
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
        if (photos.size > 1) {
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
        Modifier.fillMaxWidth().padding(bottom = 4.dp),
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
private fun WordsCard(post: PhonePost) {
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
            .padding(start = 24.dp, end = 24.dp, top = 110.dp, bottom = 160.dp),
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
    }
}

/** Posts shorter than this (in characters) get the biggest type. */
private const val SHORT_WORDS = 140

/**
 * Over the bottom: on the left the @handle and the first lines of text; on the
 * right a column of round buttons (Sound, Share, Original), like the web player.
 */
@Composable
private fun Caption(post: PhonePost, progress: Float?, muted: Boolean?, onToggleMute: () -> Unit) {
    val context = LocalContext.current
    val words = post.kind == PostKind.TEXT || post.kind == PostKind.ARTICLE
    val handle = Copy.handle(post.author.handle)
        ?: post.author.name?.takeIf { it.isNotBlank() }
        ?: Networks.name(post.platform)
        ?: ""
    val source = post.sourceUrl?.takeIf { it.isNotBlank() }
    Column(
        Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.75f))))
            .navigationBarsPadding()
            .padding(start = 18.dp, end = 12.dp, top = 36.dp, bottom = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f).padding(end = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    handle,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = AdhxColors.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!words && post.text.isNotBlank()) {
                    Text(
                        post.text,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        color = AdhxColors.Cream,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                if (muted != null) {
                    ActionButton(
                        label = "Sound",
                        description = if (muted) "Sound on" else "Sound off",
                        onClick = onToggleMute,
                    ) {
                        Icon(
                            painterResource(if (muted) R.drawable.ic_sound_off else R.drawable.ic_sound_on),
                            contentDescription = null,
                            tint = AdhxColors.White,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                }
                if (source != null) {
                    ActionButton(label = "Share", description = "Share", onClick = { shareLink(context, source) }) {
                        Icon(Icons.Filled.Share, contentDescription = null, tint = AdhxColors.White, modifier = Modifier.size(21.dp))
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
        Box(
            Modifier
                .fillMaxWidth()
                .height(3.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(if (progress != null) AdhxColors.White.copy(alpha = 0.2f) else Color.Transparent),
        ) {
            if (progress != null) {
                Box(
                    Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(progress)
                        .background(AdhxColors.Accent),
                )
            }
        }
    }
}

/** A round dark button with a small label underneath, in the column on the right. */
@Composable
private fun ActionButton(label: String, description: String, onClick: () -> Unit, icon: @Composable () -> Unit) {
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
                .background(Color.Black.copy(alpha = 0.5f)),
            contentAlignment = Alignment.Center,
        ) {
            icon()
        }
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = AdhxColors.White)
    }
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
