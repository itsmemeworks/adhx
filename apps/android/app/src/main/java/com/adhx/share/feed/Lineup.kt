package com.adhx.share.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.adhx.share.links.Networks
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.Lineup
import com.adhx.share.net.PhonePost
import com.adhx.share.net.WhyKind
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.KeepUpright
import com.adhx.share.ui.NetworkMark
import com.adhx.share.ui.SansFamily
import com.adhx.share.ui.SerifFamily
import kotlinx.coroutines.launch

/*
 * New's lineup on the phone (boards 13.3 and 13.5): a strip under the tabs
 * says which part is playing, a pill above the byline says where you are in
 * it and opens Up next, the whole lineup in its three parts.
 */

/** Where a post is in the lineup: "Just saved · 1 of 2". */
data class LineupSpot(val part: String, val position: Int, val count: Int)

internal fun lineupSpot(ui: FeedUi, key: String?): LineupSpot? {
    val sections = ui.sections ?: return null
    val index = ui.items.indexOfFirst { it.key == key }
    if (index < 0) return null
    val part = ui.items[index].section ?: return null
    val position = ui.items.subList(0, index).count { it.section == part } + 1
    val loaded = ui.items.count { it.section == part }
    return LineupSpot(part, position, maxOf(sections[part] ?: 0, loaded))
}

/** The parts with posts in them, in the lineup's order. */
internal fun lineupParts(ui: FeedUi): List<String> {
    val sections = ui.sections ?: return emptyList()
    return Lineup.parts.filter { (sections[it] ?: 0) > 0 }
}

/** Posts in Just saved and Not seen yet you haven't watched (the New badge). */
internal fun unseenLeft(ui: FeedUi): Int {
    val sections = ui.sections ?: return 0
    val total = (sections[Lineup.JUST] ?: 0) + (sections[Lineup.UNSEEN] ?: 0)
    val done = ui.items.count { Lineup.isUnseen(it.section) && it.key in ui.watched }
    return (total - done).coerceAtLeast(0)
}

private val OverMedia = TextStyle(
    fontFamily = SansFamily,
    shadow = Shadow(Color.Black.copy(alpha = 0.85f), Offset(0f, 1f), 4f),
)

/** "Just saved 2 · Not seen yet 6 · For you": the one playing lit, its bar filling as you go. */
@Composable
fun LineupStrip(ui: FeedUi, playingKey: String?, modifier: Modifier = Modifier) {
    val parts = lineupParts(ui)
    if (parts.isEmpty()) return
    val spot = lineupSpot(ui, playingKey)
    val label = { part: String -> if (part == Lineup.FOR_YOU) Lineup.title(part) else "${Lineup.title(part)} ${ui.sections?.get(part) ?: 0}" }
    val description = buildString {
        append("Today’s lineup: ")
        append(parts.joinToString(", then ") { label(it) })
        if (spot != null) append(". Playing ${Lineup.title(spot.part)}, ${spot.position} of ${spot.count}.")
    }
    Row(
        modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = description },
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        val at = spot?.let { parts.indexOf(it.part) } ?: -1
        parts.forEachIndexed { i, part ->
            val current = i == at
            val fill = when {
                at < 0 || i > at -> 0f
                i < at -> 1f
                else -> spot!!.position.toFloat() / spot.count.coerceAtLeast(1)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .clip(RoundedCornerShape(50))
                        .background(Color.White.copy(alpha = 0.22f)),
                ) {
                    Box(Modifier.fillMaxHeight().fillMaxWidth(fill).background(AdhxColors.Accent))
                }
                Text(
                    label(part),
                    style = OverMedia,
                    fontSize = 12.sp,
                    fontWeight = if (current) FontWeight.ExtraBold else FontWeight.SemiBold,
                    color = if (current) AdhxColors.White else Color(0xFFE8E0CF),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** "Just saved · 1 of 2" above the byline: opens Up next. */
@Composable
fun LineupPill(spot: LineupSpot, onOpen: () -> Unit) {
    val title = Lineup.title(spot.part)
    Row(
        Modifier
            .height(40.dp)
            .clip(RoundedCornerShape(50))
            .background(Color.Black.copy(alpha = 0.55f))
            .border(1.dp, AdhxColors.White.copy(alpha = 0.14f), RoundedCornerShape(50))
            .clickable(onClickLabel = "Open Up next", onClick = onOpen)
            .clearAndSetSemantics { contentDescription = "$title, ${spot.position} of ${spot.count}. Open Up next" }
            .padding(start = 10.dp, end = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Glyphs.Lines, contentDescription = null, tint = AdhxColors.Accent, modifier = Modifier.size(16.dp))
        Text(title, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.White, maxLines = 1)
        Text("· ${spot.position} of ${spot.count}", fontSize = 14.sp, color = AdhxColors.Muted, maxLines = 1)
        Icon(Glyphs.Chevron, contentDescription = null, tint = AdhxColors.Muted, modifier = Modifier.size(12.dp).rotate(-90f))
    }
}

/** Up next: the lineup in its three parts. Always in this order; tap any post to start there. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpNextSheet(
    ui: FeedUi,
    playingKey: String?,
    server: String,
    onPick: (String) -> Unit,
    onNearEnd: () -> Unit,
    onDismiss: () -> Unit,
) {
    KeepUpright()
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val parts = lineupParts(ui)
    val list = rememberLazyListState()
    val left = unseenLeft(ui)
    // The rows by part, with the heading's place in the list for each.
    val rows = parts.flatMap { part -> listOf<Any>(part) + ui.items.filter { it.section == part } }
    LaunchedEffect(Unit) {
        val at = rows.indexOfFirst { it is PhonePost && it.key == playingKey }
        if (at > 2) list.scrollToItem(at - 2)
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = AdhxColors.Surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { SheetHandle() },
    ) {
        Column(Modifier.navigationBarsPadding().padding(horizontal = 16.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    "Up next",
                    fontFamily = SerifFamily,
                    fontSize = 34.sp,
                    lineHeight = 36.sp,
                    color = AdhxColors.White,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                Text(
                    when (left) { 0 -> "Nothing new to see"; 1 -> "1 not seen yet"; else -> "$left not seen yet" },
                    fontSize = 13.sp,
                    color = AdhxColors.Faint,
                    modifier = Modifier.padding(bottom = 6.dp),
                )
            }
            Text(
                "Always in this order. Tap any post to start there.",
                fontSize = 14.sp,
                color = AdhxColors.Muted,
                modifier = Modifier.padding(top = 6.dp, bottom = 6.dp),
            )
            LazyColumn(state = list, modifier = Modifier.heightIn(max = 560.dp)) {
                items(rows, key = { if (it is PhonePost) it.key else "part:$it" }) { row ->
                    if (row is PhonePost) {
                        val index = ui.items.indexOf(row)
                        LaunchedEffect(row.key) { if (index >= ui.items.size - 4) onNearEnd() }
                        val playing = row.key == playingKey
                        val watched = row.key in ui.watched
                        UpNextRow(
                            post = row,
                            server = server,
                            playing = playing,
                            watched = watched,
                            dot = Lineup.isUnseen(row.section) && !watched && !playing,
                            chip = row.headline.takeIf { row.section == Lineup.FOR_YOU },
                            onTap = {
                                scope.launch { state.hide() }.invokeOnCompletion {
                                    onPick(row.key)
                                    onDismiss()
                                }
                            },
                        )
                    } else {
                        val part = row as String
                        Row(
                            Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 12.dp, bottom = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                Lineup.title(part).uppercase(),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = 1.sp,
                                color = AdhxColors.Accent,
                                modifier = Modifier.weight(1f).semantics { heading() },
                            )
                            Text(
                                if (part == Lineup.FOR_YOU) "from what you keep" else "${ui.sections?.get(part) ?: 0}",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = AdhxColors.Faint,
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Up next for any other queue (boards 14.3, 14.4): a channel newest first, a
 * search best match first. One list; tap any post to start there.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QueueSheet(
    posts: List<PhonePost>,
    current: Int,
    server: String,
    /** "Ana’s saves", "“synth”". */
    name: String,
    /** How the list is ordered, in a line. */
    note: String,
    /** Posts watched while this player has been up (dimmed). */
    watched: Set<String>,
    /** A chip under a post: how a search matched it. */
    chip: (PhonePost) -> String?,
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    KeepUpright()
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val list = rememberLazyListState()
    LaunchedEffect(Unit) { if (current > 2) list.scrollToItem(current - 2) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = AdhxColors.Surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { SheetHandle() },
    ) {
        Column(Modifier.navigationBarsPadding().padding(horizontal = 16.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    "Up next",
                    fontFamily = SerifFamily,
                    fontSize = 34.sp,
                    lineHeight = 36.sp,
                    color = AdhxColors.White,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                Text("$name · ${posts.size}", fontSize = 13.sp, color = AdhxColors.Faint, maxLines = 1, modifier = Modifier.padding(bottom = 6.dp))
            }
            Text(note, fontSize = 14.sp, color = AdhxColors.Muted, modifier = Modifier.padding(top = 6.dp, bottom = 6.dp))
            LazyColumn(state = list, modifier = Modifier.heightIn(max = 560.dp)) {
                itemsIndexed(posts, key = { _, post -> post.key }) { index, post ->
                    val playing = index == current
                    val seen = post.key in watched
                    UpNextRow(
                        post = post,
                        server = server,
                        playing = playing,
                        watched = seen,
                        dot = post.isNew && !seen && !playing,
                        chip = chip(post),
                        onTap = {
                            scope.launch { state.hide() }.invokeOnCompletion {
                                onPick(post.key)
                                onDismiss()
                            }
                        },
                    )
                }
            }
        }
    }
}

/** "Ana’s saves · 3 of 24" above the byline in a channel or a search: opens Up next. */
@Composable
fun QueuePill(name: String, position: Int, count: Int, onOpen: () -> Unit) {
    Row(
        Modifier
            .height(40.dp)
            .clip(RoundedCornerShape(50))
            .background(Color.Black.copy(alpha = 0.55f))
            .border(1.dp, AdhxColors.White.copy(alpha = 0.14f), RoundedCornerShape(50))
            .clickable(onClickLabel = "Open Up next", onClick = onOpen)
            .clearAndSetSemantics { contentDescription = "$name, $position of $count. Open Up next" }
            .padding(start = 10.dp, end = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Glyphs.Lines, contentDescription = null, tint = AdhxColors.Accent, modifier = Modifier.size(16.dp))
        Text(name, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.White, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
        Text("· $position of $count", fontSize = 14.sp, color = AdhxColors.Muted, maxLines = 1)
        Icon(Glyphs.Chevron, contentDescription = null, tint = AdhxColors.Muted, modifier = Modifier.size(12.dp).rotate(-90f))
    }
}

/**
 * One post in Up next: a [dot] while you haven't seen it, its picture, its
 * words and who saved it; a [chip] for why (For you) or how it matched (search).
 */
@Composable
internal fun UpNextRow(post: PhonePost, server: String, playing: Boolean, watched: Boolean, dot: Boolean, chip: String?, onTap: () -> Unit) {
    val unseen = dot
    val passed = watched && !playing
    val title = upNextTitle(post)
    val meta = upNextMeta(post)
    val why = chip
    val description = listOfNotNull(
        if (playing) "Now playing" else null,
        title,
        meta,
        if (unseen) "not seen yet" else null,
        why,
    ).joinToString(", ")
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(if (playing) AdhxColors.Accent.copy(alpha = 0.10f) else Color.Transparent)
            .border(1.dp, if (playing) AdhxColors.Accent.copy(alpha = 0.35f) else Color.Transparent, RoundedCornerShape(16.dp))
            .clickable(onClick = onTap)
            .clearAndSetSemantics {
                contentDescription = description
                selected = playing
            }
            .padding(start = 8.dp, end = 10.dp, top = 8.dp, bottom = 8.dp)
            .alpha(if (passed) 0.62f else 1f),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(if (unseen) AdhxColors.Accent else Color.Transparent))
        Box(
            Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)).background(AdhxColors.Placeholder),
            contentAlignment = Alignment.Center,
        ) {
            NetworkMark(post.platform, size = 18.dp)
            val poster = post.media.firstOrNull()?.posterUrl?.let { AdhxApi.resolve(server, it)?.toString() }
            if (poster != null) AsyncImage(poster, null, contentScale = ContentScale.Crop, modifier = Modifier.size(52.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            if (playing) {
                Text("NOW PLAYING", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.6.sp, color = AdhxColors.Accent)
            }
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = AdhxColors.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                val saver = post.savers.firstOrNull { it.isYou } ?: post.savers.firstOrNull()
                if (saver != null) Avatar(saver, server, 18.dp)
                Text(meta, fontSize = 13.sp, color = AdhxColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (why != null) {
                Text(
                    why,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = AdhxColors.Cream,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(AdhxColors.Raised)
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
        }
    }
}

/** The post's own words, else whose it is. */
internal fun upNextTitle(post: PhonePost): String {
    val line = (post.article?.title ?: post.text).lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() }
    if (line != null) return line
    val noun = when (post.kind) {
        "photo" -> "photo"
        "video", "audio" -> "video"
        else -> "post"
    }
    return "@${post.author.handle}’s $noun"
}

/**
 * "Ana saved · 12m · YouTube", or "Ana sent you this · YouTube" (a send counts
 * from when it was sent, which is why it's this high).
 */
internal fun upNextMeta(post: PhonePost): String {
    val network = Networks.name(post.platform) ?: post.platform
    val sent = post.whyReasons.firstOrNull()?.takeIf { it.kind == WhyKind.SENT }
    if (sent != null) return "${sent.text} · $network"
    val saver = post.savers.firstOrNull { it.isYou } ?: post.savers.firstOrNull()
    val parts = mutableListOf<String>()
    if (saver != null) {
        parts.add("${if (saver.isYou) "You" else saver.label} saved")
        Copy.shortAgoIso(saver.savedAt)?.let { parts.add(it) }
    }
    parts.add(network)
    return parts.joinToString(" · ")
}
