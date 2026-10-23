package com.adhx.share.feed

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import com.adhx.share.net.AdhxApi
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.GobShape
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.SquircleShape
import com.adhx.share.ui.faceColor
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.library.BarButton
import com.adhx.share.library.PlayerScreen
import com.adhx.share.net.PhonePost
import com.adhx.share.net.Reaction
import com.adhx.share.net.Saver
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Faces
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.Spinner
import kotlinx.coroutines.delay

/**
 * Tuned in to a moment: its posts in the player, LIVE and who's watching
 * with you at the top (instead of home's row), and React in the button column (six emoji, or a few
 * words for everyone watching). Reactions float up the screen with the face
 * of who sent them. Asks `/api/app/live/{slug}` again every ~5 s while it's
 * on screen.
 */
@Composable
fun TunedInScreen(
    feed: FeedViewModel,
    slug: String,
    server: String,
    onBack: () -> Unit,
    onSaver: (Saver) -> Unit,
) {
    LaunchedEffect(slug) { feed.tuneIn(slug) }
    val ui by feed.tuned.collectAsStateWithLifecycle()
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val resumed = lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    LaunchedEffect(slug, resumed) {
        if (resumed) {
            val session = java.util.UUID.randomUUID().toString()
            try {
                while (true) {
                    feed.pollTuned(session)
                    delay(POLL_MS)
                }
            } finally {
                withContext(NonCancellable) { feed.leaveTuned(slug, session) }
            }
        }
    }
    // "A new one, up next" shows for a few seconds.
    LaunchedEffect(ui.arrived) {
        if (ui.arrived > 0) {
            delay(4_000)
            feed.seenArrivals()
        }
    }

    val top: @Composable () -> Unit = {
        Box(Modifier.fillMaxWidth()) {
            Box(
                Modifier
                    .matchParentSize()
                    .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.65f), Color.Transparent))),
            )
            Column(
                Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(bottom = 20.dp),
            ) {
                // Only LIVE, who's watching and Leave: home's row steps aside while you're tuned in (as on iPhone).
                Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(start = 16.dp, end = 16.dp, top = 8.dp),
                ) {
                    Row(Modifier.padding(end = 52.dp), verticalAlignment = Alignment.CenterVertically) {
                        LiveBadge(height = 40.dp, border = true)
                        Spacer(Modifier.width(8.dp))
                        WatchersChip(ui.watchers, ui.moment?.watching ?: 0, server, Modifier.weight(1f, fill = false))
                    }
                    Box(Modifier.align(Alignment.CenterEnd)) { BarButton(Glyphs.Close, Copy.LEAVE_LIVE, onBack) }
                }
                if (ui.arrived > 0) {
                    ArrivalCard(ui.arrival, server, Modifier.align(Alignment.End).padding(top = 12.dp, end = 16.dp))
                }
            }
        }
    }

    val scope = rememberCoroutineScope()
    if (ui.items.isEmpty()) {
        Box(Modifier.fillMaxSize().background(AdhxColors.Bg)) {
            Column(
                Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .padding(start = 20.dp, end = 20.dp, top = 120.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                when {
                    !ui.loadedOnce -> Spinner(size = 30.dp, stroke = 3.dp)
                    else -> {
                        Text(ui.error ?: Copy.LIVE_ENDED, fontSize = 15.sp, lineHeight = 22.sp, color = AdhxColors.InkSoft)
                        if (ui.error != null && ui.error != Copy.LIVE_ENDED) {
                            OutlineButton("Try again", onClick = { scope.launch { feed.pollTuned() } }, minHeight = 44.dp)
                        }
                        OutlineButton("Back", onClick = onBack, minHeight = 44.dp)
                    }
                }
            }
            top()
        }
        return
    }

    var pickingKey by rememberSaveable(slug) { mutableStateOf<String?>(null) }
    val picking = ui.items.firstOrNull { it.key == pickingKey }
    var words by rememberSaveable(slug) { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var sendError by remember { mutableStateOf<String?>(null) }
    val send: (PhonePost, String?, String?) -> Unit = { post, emoji, text ->
        if (!sending) {
            sending = true
            sendError = null
            scope.launch {
                val sent = feed.react(post, emoji = emoji, text = text)
                sending = false
                if (sent) {
                    if (text != null && words.trim() == text) words = ""
                    pickingKey = null
                } else {
                    sendError = if (text != null) "Not sent. Your words are still here. Tap Retry." else "Not sent. Tap the reaction to retry."
                    pickingKey = post.key
                }
            }
        }
    }
    Box(Modifier.fillMaxSize()) {
        PlayerScreen(
            posts = ui.items,
            server = server,
            startIndex = 0,
            onPage = { index -> feed.playingTuned(ui.items.getOrNull(index)) },
            topBar = { top() },
            onSaver = onSaver,
            onReact = { post -> if (!sending) pickingKey = if (picking == null) post.key else null },
            reacting = picking != null,
            preservePlaybackOnRefresh = true,
            aboveCaption = {
                ui.moment?.label?.let { name ->
                    Row(
                        Modifier
                            .height(26.dp)
                            .clip(RoundedCornerShape(50))
                            .background(Color.Black.copy(alpha = 0.45f))
                            .padding(horizontal = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("In", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.InkSoft)
                        Spacer(Modifier.width(6.dp))
                        Text(name, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            },
        )
        // Over the post, left of the button column, between the top bar and the caption.
        FloatingReactions(
            items = feed.floating,
            server = server,
            onLanded = feed::landed,
            modifier = Modifier
                .statusBarsPadding()
                .padding(start = 16.dp, end = 84.dp, top = 170.dp, bottom = 300.dp),
        )
        picking?.let { post ->
            ReactPicker(
                words = words,
                onWordsChange = { words = it },
                sending = sending,
                error = sendError,
                onEmoji = { send(post, it, null) },
                onText = { send(post, null, it) },
                onDismiss = { pickingKey = null },
            )
        }
    }
}

private const val POLL_MS = 5_000L

/** "Jo just saved one · up next": the new post's picture with their face on its corner. */
@Composable
private fun ArrivalCard(post: PhonePost?, server: String, modifier: Modifier = Modifier) {
    val saver = post?.savers?.firstOrNull()
    val media = post?.media?.firstOrNull()
    val poster = (media?.posterUrl ?: media?.url?.takeIf { media.kind == "photo" })?.let { AdhxApi.resolve(server, it)?.toString() }
    Row(
        modifier
            .width(228.dp)
            .shadow(20.dp, SquircleShape(20.dp), ambientColor = Color.Black, spotColor = Color.Black)
            .clip(SquircleShape(20.dp))
            .background(AdhxColors.Surface.copy(alpha = 0.85f))
            .border(1.dp, (saver?.let { faceColor(it.username) } ?: AdhxColors.Ink).copy(alpha = 0.5f), SquircleShape(20.dp))
            .padding(start = 8.dp, end = 14.dp, top = 8.dp, bottom = 8.dp)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(47.dp)) {
            Box(
                Modifier
                    .size(42.dp)
                    .clip(SquircleShape(12.dp))
                    .background(AdhxColors.Placeholder),
            ) {
                if (poster != null) AsyncImage(poster, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
            }
            if (saver != null) {
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .background(AdhxColors.Surface, GobShape)
                        .padding(2.dp),
                ) { Avatar(saver, server, size = 20.dp) }
            }
        }
        Spacer(Modifier.width(11.dp))
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                saver?.let { Copy.justSavedOne(it) } ?: Copy.NEW_UP_NEXT,
                fontSize = 14.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (saver != null) Text(Copy.UP_NEXT, fontSize = 14.sp, color = AdhxColors.InkSoft)
        }
    }
}

/**
 * Their faces and "watching with you"; a screen reader hears "Ana and Ben are
 * watching with you", again when it changes.
 */
@Composable
private fun WatchersChip(watchers: List<Saver>, count: Int, server: String, modifier: Modifier = Modifier) {
    val line = Copy.watchersLine(watchers, maxOf(count, watchers.size))
    val others = watchers.filterNot { it.isYou }
    Row(
        modifier
            .heightIn(min = 40.dp)
            .clip(RoundedCornerShape(50))
            .background(Color.Black.copy(alpha = 0.55f))
            .border(1.dp, Color.White.copy(alpha = 0.14f), RoundedCornerShape(50))
            .padding(start = if (others.isEmpty()) 12.dp else 6.dp, end = 14.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = line
                liveRegion = LiveRegionMode.Polite
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (others.isNotEmpty()) {
            Faces(others, server, size = 26.dp, ring = AdhxColors.Watching)
            Spacer(Modifier.width(9.dp))
        }
        Text(
            Copy.watchersShort(watchers, maxOf(count, watchers.size)),
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = AdhxColors.Ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
