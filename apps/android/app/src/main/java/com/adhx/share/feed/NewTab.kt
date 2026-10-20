package com.adhx.share.feed

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.adhx.share.R
import com.adhx.share.data.Connection
import com.adhx.share.library.LibraryViewModel
import com.adhx.share.library.PlayerScreen
import com.adhx.share.library.SavesHome
import com.adhx.share.links.Networks
import com.adhx.share.main.Reach
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.FeedMode
import com.adhx.share.net.PhonePost
import com.adhx.share.net.WhyReason
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.Faces
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.PrimaryButton
import com.adhx.share.ui.Segmented
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.Spinner
import com.adhx.share.ui.rememberReducedMotion
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * New: the friends feed in the player (`/api/app/feed?mode=new`), what you
 * haven't seen first. Each post counts as seen after 2 s on stage or once
 * you swipe past it; the feed ends on "You're all caught up". On a server
 * without the feed it plays My saves, as home did before.
 */
@Composable
fun NewTab(
    feed: FeedViewModel,
    library: LibraryViewModel,
    connection: Connection,
    reach: Reach,
    actions: HomeActions,
    /** Over the player; [atEnd] is the end page (caught up), which gets the pages' header. */
    header: @Composable (newBadge: String?, atEnd: Boolean) -> Unit,
) {
    val ui by feed.feed.collectAsStateWithLifecycle()
    val server = connection.server
    var page by remember { mutableIntStateOf(feed.feedPage) }
    var why by remember { mutableStateOf<PhonePost?>(null) }

    // Leaving New, or the app: send what's been seen.
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) feed.onPause() }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            feed.onPause()
        }
    }
    // Two seconds on stage counts as seen.
    LaunchedEffect(page, ui.items.size > 0) {
        delay(SeenBatcher.DWELL_MS)
        feed.tickSeen()
    }

    if (ui.unavailable) {
        SavesHome(
            vm = library,
            connection = connection,
            reach = reach,
            bar = { header(null, false) },
            contentTop = 90.dp,
            onSaver = actions.openPerson,
        )
        return
    }

    val badge = newBadge(ui, page)
    val end: @Composable () -> Unit = {
        CaughtUp(
            mode = ui.mode,
            watched = ui.items,
            server = server,
            onChannels = { feed.tab = HomeTab.Channels },
            onLive = { feed.tab = HomeTab.Live },
            onAgain = { feed.setMode(FeedMode.EVERYONE) },
            hidden = ui.hidden,
            onShowHidden = feed::showHidden,
            nothingYet = ui.nothingYet,
        )
    }

    when {
        ui.items.isEmpty() && (!ui.loadedOnce || ui.loading) -> Box(Modifier.fillMaxSize().background(AdhxColors.Background)) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Spinner(size = 34.dp, stroke = 3.dp) }
            header(null, false)
        }
        ui.items.isEmpty() && ui.error != null -> Box(Modifier.fillMaxSize().background(AdhxColors.Background)) {
            Column(
                Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .padding(start = 20.dp, end = 20.dp, top = 100.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text(ui.error ?: Copy.FEED_CANT_LOAD, fontSize = 15.sp, lineHeight = 22.sp, color = AdhxColors.Muted)
                OutlineButton("Try again", onClick = feed::reloadFeed, minHeight = 44.dp)
            }
            header(null, false)
        }
        ui.items.isEmpty() -> Box(Modifier.fillMaxSize()) {
            end()
            header(null, true)
        }
        else -> PlayerScreen(
            posts = ui.items,
            server = server,
            startIndex = feed.feedPage,
            onPage = {
                feed.onFeedPage(it)
                page = it
            },
            topBar = { header(badge, page >= ui.items.size) },
            onSaver = actions.openPerson,
            aboveCaption = { post -> WhyChip(post) { why = post } },
            end = if (ui.ended) end else null,
        )
    }

    why?.let { post ->
        WhySheet(
            post = post,
            server = server,
            mode = ui.mode,
            onMode = { mode ->
                why = null
                if (mode != ui.mode) feed.setMode(mode)
            },
            onFilter = {
                why = null
                feed.filterOpen = true
            },
            onDismiss = { why = null },
            weights = feed.weights,
            weightBusy = feed.weightBusy,
            onWeight = feed::setWeight,
        )
        LaunchedEffect(Unit) { feed.loadWeights() }
    }

    if (feed.filterOpen) {
        FeedFilterSheet(
            types = ui.types,
            mode = ui.mode,
            onApply = { types, mode ->
                feed.filterOpen = false
                feed.applyFilter(types, mode)
            },
            newCount = badge,
            hidden = ui.hidden,
        )
    }
}

/** The first reason the feed gives, as a chip over the caption ("Saved together ›"); tapping it explains. */
@Composable
private fun WhyChip(post: PhonePost, onClick: () -> Unit) {
    val reason = whyChipLabel(post) ?: return
    Row(
        Modifier
            .height(40.dp)
            .clip(RoundedCornerShape(50))
            .background(Color.Black.copy(alpha = 0.55f))
            .border(1.dp, AdhxColors.White.copy(alpha = 0.14f), RoundedCornerShape(50))
            .clickable(onClickLabel = Copy.WHY_TITLE, onClick = onClick)
            .padding(start = 10.dp, end = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(whyIcon(post.whyKind, chip = true), contentDescription = null, tint = AdhxColors.Accent, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(
            reason,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = AdhxColors.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        Spacer(Modifier.width(8.dp))
        Icon(Glyphs.Chevron, contentDescription = null, tint = AdhxColors.Muted, modifier = Modifier.size(14.dp))
    }
}

/** The chip's short words: "Saved together", "Close to you", else the headline itself. */
internal fun whyChipLabel(post: PhonePost): String? {
    val headline = post.headline ?: return null
    return when (post.whyKind) {
        "together" -> Copy.WHY_TOGETHER
        "close" -> Copy.WHY_CLOSE
        else -> headline
    }
}

/** The icon for a kind of reason; on the chip, "close" is a heart. */
private fun whyIcon(kind: String?, chip: Boolean = false) = when (kind) {
    "together" -> Glyphs.People
    "close" -> if (chip) Glyphs.Heart else Glyphs.PlayCircle
    "more" -> Glyphs.Plus
    "like", "yours" -> Glyphs.Bookmark
    else -> Glyphs.Again
}

/** The Why sheet's Everyone · Friends only · Mine, as feed modes. */
internal val WHOSE_MODES = listOf(FeedMode.NEW, FeedMode.FRIENDS, FeedMode.MINE)

/** Which of Everyone · Friends only · Mine a mode is (New and Everyone are both everyone's). */
internal fun whoseIndex(mode: String): Int = when (mode) {
    FeedMode.FRIENDS -> 1
    FeedMode.MINE -> 2
    else -> 0
}

/**
 * Why this one: the post, every reason the feed gave for it, and whose
 * saves to play (Everyone goes back to New; Friends only and Mine switch the
 * feed's mode).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WhySheet(
    post: PhonePost,
    server: String,
    mode: String,
    onMode: (String) -> Unit,
    onFilter: () -> Unit,
    onDismiss: () -> Unit,
    /** username → -1 or 1; null on a server without weights (the Filter row shows instead). */
    weights: Map<String, Int>? = null,
    weightBusy: String? = null,
    onWeight: (String, Int) -> Unit = { _, _ -> },
) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val others = post.savers.filterNot { it.isYou }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = AdhxColors.Surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { SheetHandle() },
    ) {
        Column(
            Modifier
                .navigationBarsPadding()
                .padding(start = 20.dp, end = 20.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    Copy.WHY_TITLE,
                    fontFamily = SerifFamily,
                    fontSize = 40.sp,
                    lineHeight = 40.sp,
                    color = AdhxColors.White,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                Box(
                    Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(AdhxColors.Card)
                        .clickable(onClickLabel = "Close") { scope.launch { state.hide() }.invokeOnCompletion { onDismiss() } }
                        .semantics { contentDescription = "Close" },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Glyphs.Close, contentDescription = null, tint = AdhxColors.Muted, modifier = Modifier.size(18.dp))
                }
            }
            PostSummary(post, server)
            val reasons = post.whyReasons.ifEmpty { post.reasons.map { WhyReason(it) } }.ifEmpty { listOf(WhyReason(Copy.WHY_NONE)) }
            Column(Modifier.padding(top = 2.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                reasons.forEachIndexed { i, reason ->
                    // The people behind a reason: everyone for "together", else the one it names.
                    val faces = when {
                        reason.kind == "together" || (reason.kind == null && i == 0) -> others
                        reason.username != null -> post.savers.filter { it.username == reason.username }
                        else -> emptyList()
                    }
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 56.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Box(
                            Modifier
                                .size(40.dp)
                                .clip(CircleShape)
                                .background(if (i == 0) AdhxColors.Accent else AdhxColors.Card),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(whyIcon(reason.kind), contentDescription = null, tint = if (i == 0) Color.Black else AdhxColors.White, modifier = Modifier.size(20.dp))
                        }
                        Text(
                            reason.text,
                            fontSize = 16.sp,
                            lineHeight = 21.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = AdhxColors.White,
                            modifier = Modifier.weight(1f),
                        )
                        if (faces.isNotEmpty()) Faces(faces, server, size = 26.dp, ring = AdhxColors.Surface)
                    }
                }
            }
            Column(Modifier.padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(Copy.WHOSE_SAVES, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.Muted)
                Segmented(
                    options = Copy.WHOSE,
                    selected = whoseIndex(mode),
                    onSelect = { i ->
                        scope.launch { state.hide() }.invokeOnCompletion { onMode(WHOSE_MODES[i]) }
                    },
                    background = AdhxColors.Background,
                    fontSize = 14,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            val pair = weightPair(others)
            if (weights != null && pair != null) {
                // "Show less from Ben" · "Show more from Ana": the last friend to save it and the first.
                val (less, more) = pair
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    WeightButton(
                        label = Copy.showLess(less.label, weights[less.username] == -1),
                        icon = Glyphs.Minus,
                        on = weights[less.username] == -1,
                        enabled = weightBusy == null,
                        modifier = Modifier.weight(1f),
                    ) { onWeight(less.username, if (weights[less.username] == -1) 0 else -1) }
                    WeightButton(
                        label = Copy.showMore(more.label, weights[more.username] == 1),
                        icon = Glyphs.Plus,
                        on = weights[more.username] == 1,
                        enabled = weightBusy == null,
                        modifier = Modifier.weight(1f),
                    ) { onWeight(more.username, if (weights[more.username] == 1) 0 else 1) }
                }
            } else Row(
                Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .clip(RoundedCornerShape(50))
                    .background(AdhxColors.Card)
                    .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(50))
                    .clickable { scope.launch { state.hide() }.invokeOnCompletion { onFilter() } },
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Glyphs.Sliders, contentDescription = null, tint = AdhxColors.White, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(Copy.FILTER_TITLE, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.White)
            }
            Text(
                Copy.WHY_NOTE,
                fontSize = 13.sp,
                color = AdhxColors.Faint,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
            )
        }
    }
}

/**
 * Who "Show less" and "Show more" are about: the last friend to save it and
 * the first (the same one when there's one); null with no friends on it.
 */
internal fun weightPair(others: List<com.adhx.share.net.Saver>): Pair<com.adhx.share.net.Saver, com.adhx.share.net.Saver>? {
    val friends = others.filterNot { it.isYou }.distinctBy { it.username }
    if (friends.isEmpty()) return null
    return friends.last() to friends.first()
}

/** A "Show less / more from …" pill; cream while chosen (tap again for normal). */
@Composable
private fun WeightButton(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, on: Boolean, enabled: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(
        modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(50))
            .background(if (on) AdhxColors.Cream else AdhxColors.Button)
            .border(1.dp, Color.White.copy(alpha = if (on) 0f else 0.12f), RoundedCornerShape(50))
            .clickable(enabled = enabled, onClick = onClick)
            .semantics { selected = on }
            .padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = if (on) Color.Black else AdhxColors.Cream, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(
            label,
            fontSize = 14.sp,
            lineHeight = 18.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (on) Color.Black else AdhxColors.Cream,
            textAlign = TextAlign.Center,
        )
    }
}

/** The post in one line: its poster, its words, "Reddit · 2h". */
@Composable
private fun PostSummary(post: PhonePost, server: String) {
    val media = post.media.firstOrNull()
    val poster = (media?.posterUrl ?: media?.url?.takeIf { media.kind == "photo" })?.let { AdhxApi.resolve(server, it)?.toString() }
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(AdhxColors.Background)
            .padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(width = 40.dp, height = 56.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(AdhxColors.Placeholder),
        ) {
            if (poster != null) AsyncImage(poster, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        }
        Spacer(Modifier.width(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                (post.article?.title?.takeIf { it.isNotBlank() } ?: post.text).ifBlank { Copy.handle(post.author.handle) ?: "" },
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = AdhxColors.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                listOfNotNull(Networks.name(post.platform), Copy.shortAgoIso(post.savers.firstOrNull()?.savedAt ?: post.savedAt)).joinToString(" · "),
                fontSize = 12.sp,
                color = AdhxColors.Faint,
            )
        }
    }
}

/**
 * The end of the feed: Gob, "You're all caught up. Go touch grass.", what
 * you just watched, and where to go next.
 */
@Composable
fun CaughtUp(
    mode: String,
    watched: List<PhonePost>,
    server: String,
    onChannels: () -> Unit,
    onLive: () -> Unit,
    onAgain: () -> Unit,
    hidden: Map<String, Int> = emptyMap(),
    onShowHidden: () -> Unit = {},
    nothingYet: Boolean = false,
) {
    val still = rememberReducedMotion()
    val isNew = mode == FeedMode.NEW
    Box(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Background)
            .drawBehind {
                // A soft yellow glow behind Gob: 520×420 around a point 360dp down.
                val center = androidx.compose.ui.geometry.Offset(size.width / 2, 360.dp.toPx())
                drawOval(
                    Brush.radialGradient(
                        0f to AdhxColors.Accent.copy(alpha = 0.12f),
                        0.65f to Color.Transparent,
                        center = center,
                        radius = 260.dp.toPx(),
                    ),
                    topLeft = androidx.compose.ui.geometry.Offset(center.x - 260.dp.toPx(), center.y - 210.dp.toPx()),
                    size = androidx.compose.ui.geometry.Size(520.dp.toPx(), 420.dp.toPx()),
                )
            },
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(start = 20.dp, end = 20.dp, top = 118.dp, bottom = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Gob bobs gently, unless animations are off.
            val bob = if (still) {
                0f
            } else {
                val t = rememberInfiniteTransition(label = "gob")
                t.animateFloat(0f, -6f, infiniteRepeatable(tween(1400), RepeatMode.Reverse), label = "bob").value
            }
            // The drawable's body is 76 of 96 units: 121dp draws the boards' 96dp Gob, with its soft
            // yellow glow 18dp below (the boards' box-shadow).
            Image(
                painterResource(R.drawable.ic_gob),
                contentDescription = null,
                modifier = Modifier
                    .size(121.dp)
                    .offset(y = bob.dp)
                    .drawBehind {
                        val c = androidx.compose.ui.geometry.Offset(size.width / 2, size.height / 2 + 18.dp.toPx())
                        drawCircle(
                            Brush.radialGradient(
                                0f to AdhxColors.Accent.copy(alpha = 0.18f),
                                1f to Color.Transparent,
                                center = c,
                                radius = 78.dp.toPx(),
                            ),
                            radius = 78.dp.toPx(),
                            center = c,
                        )
                    },
            )
            Box(
                Modifier
                    .offset(y = (-3).dp)
                    .size(width = 70.dp, height = 8.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.6f)),
            )
            Column(
                Modifier
                    // The boards' 18px gap, less the serif's own leading above the first line.
                    .padding(top = 4.dp)
                    .semantics(mergeDescendants = true) { heading() },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                // One paragraph, so the two lines sit at the boards' 0.95 line height.
                val title = when {
                    nothingYet -> Copy.NOTHING_YET_TITLE
                    isNew -> Copy.CAUGHT_UP
                    else -> Copy.END_TITLE
                }
                Text(
                    buildAnnotatedString {
                        append(title)
                        if (!nothingYet) {
                            append("\n")
                            withStyle(SpanStyle(color = AdhxColors.Accent)) { append(Copy.TOUCH_GRASS) }
                        }
                    },
                    fontFamily = SerifFamily,
                    fontSize = 50.sp,
                    lineHeight = 48.sp,
                    color = AdhxColors.White,
                    textAlign = TextAlign.Center,
                )
            }
            Text(
                when {
                    nothingYet -> Copy.NOTHING_YET_NOTE
                    !isNew -> Copy.END_NOTE
                    watched.isEmpty() -> Copy.NOTHING_NEW_NOTE
                    else -> Copy.CAUGHT_UP_NOTE
                },
                fontSize = 16.sp,
                lineHeight = 23.sp,
                color = AdhxColors.Muted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 14.dp).width(300.dp),
            )
            if (isNew && !nothingYet && watched.isNotEmpty()) WatchedCard(watched, server, Modifier.padding(top = 22.dp))
            Copy.hiddenLine(hidden)?.let { line -> HiddenRow(line, onShowHidden, Modifier.padding(top = 14.dp)) }
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 18.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                PrimaryButton(Copy.BROWSE_CHANNELS, onClick = onChannels, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    LiveButton(onLive, Modifier.weight(1f))
                    // Nothing saved yet: there's nothing to watch again.
                    if (!nothingYet) {
                        AgainButton(onAgain, Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

/** "Watch it all again", a faint outline with a turning arrow. */
@Composable
private fun AgainButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier
            .height(48.dp)
            .clip(RoundedCornerShape(50))
            .border(1.dp, Color.White.copy(alpha = 0.16f), RoundedCornerShape(50))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Glyphs.Again, contentDescription = null, tint = AdhxColors.White, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(Copy.WATCH_AGAIN, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.White, maxLines = 1)
    }
}

/** "See what's live", with Live's red dot. */
@Composable
private fun LiveButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier
            .height(48.dp)
            .clip(RoundedCornerShape(50))
            .background(AdhxColors.Button)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(AdhxColors.Live))
        Spacer(Modifier.width(8.dp))
        Text(Copy.SEE_LIVE, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.Cream, maxLines = 1)
    }
}

/** What you just watched: a fan of posters, the faces, "12 from Ana, Ben and Mum today". */
@Composable
private fun WatchedCard(watched: List<PhonePost>, server: String, modifier: Modifier = Modifier) {
    val posters = watched.mapNotNull { p ->
        val m = p.media.firstOrNull()
        (m?.posterUrl ?: m?.url?.takeIf { m.kind == "photo" })?.let { AdhxApi.resolve(server, it)?.toString() }
    }.take(4)
    val people = watched.flatMap { it.savers }.filterNot { it.isYou }.distinctBy { it.username }
    val line = Copy.watchedSummary(watched.size, people.map { it.label })
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(AdhxColors.Surface)
            .border(1.dp, AdhxColors.White.copy(alpha = 0.08f), RoundedCornerShape(22.dp))
            .padding(14.dp)
            .semantics(mergeDescendants = true) { },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (posters.isNotEmpty()) {
            Box(Modifier.width((40 + 30 * (posters.size - 1)).dp)) {
                posters.forEachIndexed { i, url ->
                    AsyncImage(
                        url,
                        null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .offset(x = (30 * i).dp)
                            .rotate(listOf(-5f, -1f, 3f, 6f)[i])
                            .size(width = 40.dp, height = 58.dp)
                            .background(AdhxColors.Surface, RoundedCornerShape(11.dp))
                            .padding(2.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(AdhxColors.Placeholder),
                    )
                }
            }
            Spacer(Modifier.width(14.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (people.isNotEmpty()) Faces(people, server, size = 22.dp, ring = AdhxColors.Surface)
            Text(line, fontSize = 14.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.White)
        }
        Icon(Glyphs.Chevron, contentDescription = null, tint = AdhxColors.Faint, modifier = Modifier.size(16.dp))
    }
}

/** "4 text posts waiting · Show them", when the filter left some out. */
@Composable
private fun HiddenRow(line: String, onShow: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(50))
            .border(1.dp, AdhxColors.White.copy(alpha = 0.14f), RoundedCornerShape(50))
            .clickable(onClickLabel = Copy.SHOW_THEM, onClick = onShow)
            .padding(horizontal = 18.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(line, fontSize = 14.sp, color = AdhxColors.Muted)
        Text(" · ", fontSize = 14.sp, color = AdhxColors.Faint)
        Text(Copy.SHOW_THEM, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.Accent)
    }
}
