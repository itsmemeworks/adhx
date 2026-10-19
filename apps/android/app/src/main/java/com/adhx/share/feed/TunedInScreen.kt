package com.adhx.share.feed

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
 * with you at the top, and React in the button column (six emoji, or a few
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
        Column(
            Modifier
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.6f), Color.Transparent)))
                .statusBarsPadding()
                .padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BarButton(Icons.AutoMirrored.Filled.ArrowBack, "Back", onBack)
                Spacer(Modifier.width(10.dp))
                LiveBadge()
                Spacer(Modifier.width(8.dp))
                WatchersChip(ui.watchers, ui.moment?.watching ?: 0, server, Modifier.weight(1f, fill = false))
            }
            if (ui.arrived > 0) {
                Text(
                    Copy.NEW_UP_NEXT,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = AdhxColors.Black,
                    modifier = Modifier
                        .align(Alignment.End)
                        .clip(RoundedCornerShape(50))
                        .background(AdhxColors.Cream)
                        .padding(horizontal = 14.dp, vertical = 8.dp)
                        .semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }
    }

    val scope = rememberCoroutineScope()
    if (ui.items.isEmpty()) {
        Box(Modifier.fillMaxSize().background(AdhxColors.Background)) {
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
                        Text(ui.error ?: Copy.LIVE_ENDED, fontSize = 15.sp, lineHeight = 22.sp, color = AdhxColors.Muted)
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("In ", fontSize = 13.sp, color = AdhxColors.Muted)
                        Text(name, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
            .padding(start = if (others.isEmpty()) 12.dp else 6.dp, end = 12.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = line
                liveRegion = LiveRegionMode.Polite
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (others.isNotEmpty()) {
            Faces(others, server, size = 26.dp)
            Spacer(Modifier.width(8.dp))
        }
        Text(
            Copy.watchersShort(watchers, maxOf(count, watchers.size)),
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = AdhxColors.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
