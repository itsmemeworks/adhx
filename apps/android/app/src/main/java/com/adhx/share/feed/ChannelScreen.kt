package com.adhx.share.feed

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.library.BackTitleRow
import com.adhx.share.library.PosterCard
import com.adhx.share.library.Route
import com.adhx.share.library.ToastPill
import com.adhx.share.net.ChannelKind
import com.adhx.share.net.FriendNote
import com.adhx.share.net.PhonePost
import com.adhx.share.net.Saver
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.GobShape
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.Spinner
import com.adhx.share.ui.faceColor

/**
 * One channel (`/api/app/channels/{kind}/{slug}`): a friend's saves with
 * their face and how many you haven't seen, or a channel's name; Play; then
 * a grid of posters. A poster plays the channel from there.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChannelScreen(
    feed: FeedViewModel,
    route: Route.Channel,
    server: String,
    onBack: () -> Unit,
    onPlay: (Int) -> Unit,
    /** "Play the 4 new": just the ones marked New. */
    onPlayNew: () -> Unit = {},
    /** The note's post when it isn't in the grid. */
    onOpenPost: (platform: String, id: String) -> Unit = { _, _ -> },
    /** The pages' header (Channels lit); null keeps a back button. */
    header: (@Composable () -> Unit)? = null,
    /** "Kept · Open": your channel made from this group channel (its tag), with its name. */
    onOpenKept: (tag: String, title: String) -> Unit = { _, _ -> },
) {
    val context = LocalContext.current
    LaunchedEffect(route) {
        val person = if (route.kind == ChannelKind.FRIEND) Saver(username = route.slug, name = route.title, avatarUrl = route.avatarUrl) else null
        feed.openChannel(route.kind, route.slug, route.title, person)
    }
    val ui by feed.channel.collectAsStateWithLifecycle()
    val title = if (route.kind == ChannelKind.FRIEND) Copy.friendsSaves(route.title) else route.title
    val owner = route.slug.takeIf { route.kind == ChannelKind.FRIEND }

    Column(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Background)
            .then(if (header == null) Modifier.systemBarsPadding() else Modifier.navigationBarsPadding()),
    ) {
        if (header != null) header() else Box(Modifier.padding(start = 16.dp, end = 16.dp, top = 6.dp)) { BackTitleRow("", onBack) }
        LazyVerticalStaggeredGrid(
            columns = StaggeredGridCells.Fixed(2),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalItemSpacing = 10.dp,
            modifier = Modifier.fillMaxSize(),
        ) {
            item(span = StaggeredGridItemSpan.FullLine, key = "head") {
                // The face's ring sits outside its 64dp on the boards; here it's part of the row, so the gaps are 5dp less.
                // Under home's one-row header the face starts right below the row's own 10dp.
                Column(Modifier.padding(top = if (header != null) 0.dp else 13.dp, bottom = 6.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val person = ui.person
                        if (route.kind == ChannelKind.FRIEND && person != null) {
                            // Their face with a 3dp gap and a soft ring in their colour.
                            Box(
                                Modifier
                                    .size(74.dp)
                                    .border(2.dp, faceColor(person.username).copy(alpha = 0.35f), GobShape)
                                    .padding(5.dp),
                            ) { Avatar(person, server, size = 64.dp) }
                            Spacer(Modifier.width(12.dp))
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                title,
                                fontFamily = SerifFamily,
                                fontSize = 40.sp,
                                lineHeight = 38.sp,
                                color = AdhxColors.White,
                                modifier = Modifier.semantics { heading() },
                            )
                            val size = ui.size.takeIf { it > 0 } ?: ui.items.size
                            if (size > 0) {
                                Text(
                                    buildAnnotatedString {
                                        append(Copy.saves(size))
                                        if (route.kind == ChannelKind.FRIEND && ui.unseen > 0) {
                                            append(" · ")
                                            withStyle(SpanStyle(color = AdhxColors.Accent)) { append("${ui.unseen} you haven’t seen") }
                                        }
                                    },
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = AdhxColors.Muted,
                                )
                            }
                        }
                    }
                    val group = route.kind == ChannelKind.GROUP
                    if (ui.items.isNotEmpty() || (group && ui.kept != null)) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (ui.items.isNotEmpty()) PlayButton { onPlay(0) }
                            val fresh = ui.fresh.size
                            if (fresh > 0) PlayNewButton(fresh, onPlayNew)
                            // A group channel can become one of yours.
                            if (group) {
                                val kept = ui.kept
                                KeepButton(kept = kept != null, busy = ui.keeping) {
                                    if (kept != null) {
                                        onOpenKept(kept.tag, route.title)
                                    } else {
                                        feed.keepChannel { said -> Toast.makeText(context, said, Toast.LENGTH_SHORT).show() }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            when {
                ui.items.isEmpty() && ui.loading -> item(span = StaggeredGridItemSpan.FullLine, key = "loading") {
                    Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { Spinner(size = 30.dp, stroke = 3.dp) }
                }
                ui.items.isEmpty() && ui.error != null -> item(span = StaggeredGridItemSpan.FullLine, key = "error") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(ui.error ?: Copy.CHANNEL_EMPTY, fontSize = 15.sp, color = AdhxColors.Muted)
                        if (ui.error != Copy.CHANNEL_EMPTY) OutlineButton("Try again", onClick = feed::loadChannel, minHeight = 44.dp)
                    }
                }
                ui.items.isEmpty() -> item(span = StaggeredGridItemSpan.FullLine, key = "empty") {
                    Text(Copy.CHANNEL_EMPTY, fontSize = 15.sp, color = AdhxColors.Muted)
                }
            }
            // The friend's note sits among their posts, a few tiles in.
            val note = ui.note?.takeIf { route.kind == ChannelKind.FRIEND }
            val noteAt = if (note != null) minOf(NOTE_AFTER, ui.items.size) else -1
            val split = if (noteAt >= 0) noteAt else ui.items.size
            itemsIndexed(ui.items.take(split), key = { _, post -> post.key }) { index, post ->
                PosterCard(post, server, height = tileHeight(post), owner = owner, newMark = post.isNew) { onPlay(index) }
            }
            if (note != null && ui.items.isNotEmpty()) {
                item(key = "note") {
                    val at = ui.items.indexOfFirst { it.key == note.key }
                    NoteTile(
                        note = note,
                        person = ui.person,
                        title = ui.items.getOrNull(at)?.let(::postTitle),
                        server = server,
                    ) { if (at >= 0) onPlay(at) else onOpenPost(note.platform, note.id) }
                }
            }
            itemsIndexed(ui.items.drop(split), key = { _, post -> post.key }) { i, post ->
                PosterCard(post, server, height = tileHeight(post), owner = owner, newMark = post.isNew) { onPlay(split + i) }
            }
        }
    }
}

/** A tile's height in the channel's two staggered columns, from the post's shape: 180–290dp. */
internal fun tileHeight(post: PhonePost): Dp {
    val media = post.media.firstOrNull()
    val w = media?.width ?: return if (post.media.isEmpty()) 180.dp else 230.dp
    val h = media.height ?: return 230.dp
    if (w <= 0 || h <= 0) return 230.dp
    return (174 * (h / w)).toFloat().coerceIn(180f, 290f).dp
}

/** The note tile's paper and ink (the boards' #e4dac8, #141414, #3a352d). */
private val NotePaper = Color(0xFFE4DAC8)
private val NoteInk = Color(0xFF141414)
private val NoteInkSoft = Color(0xFF3A352D)

/** How many tiles come before the note. */
private const val NOTE_AFTER = 3

/** A post's title for a line: an article's, else its first line of words. */
private fun postTitle(post: PhonePost): String? =
    (post.article?.title?.takeIf { it.isNotBlank() } ?: post.text).trim().lineSequence().firstOrNull()?.trim()?.takeIf { it.isNotEmpty() }?.let {
        if (it.length > 40) it.take(39).trimEnd() + "…" else it
    }

/**
 * The friend's note as a paper tile: their face and "Ana's note", the note
 * in large serif quotes, and which post it's on. Opens that post.
 */
@Composable
private fun NoteTile(note: FriendNote, person: Saver?, title: String?, server: String, onClick: () -> Unit) {
    val who = person?.label ?: ""
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(NotePaper)
            .clickable(onClickLabel = Copy.PLAY, onClick = onClick)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (person != null) Avatar(person, server, size = 22.dp)
            Spacer(Modifier.width(8.dp))
            Text(Copy.notesOf(who), fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = NoteInk)
        }
        Text(
            "“${note.text}”",
            fontFamily = SerifFamily,
            fontSize = 24.sp,
            lineHeight = 23.sp,
            color = NoteInk,
        )
        val on = Copy.noteOn(title, Copy.agoIso(note.savedAt))
        if (on.isNotBlank()) Text(on, fontSize = 12.sp, lineHeight = 16.sp, color = NoteInkSoft)
    }
}

/** "Play the 4 new": dark, with a yellow dot. */
@Composable
private fun PlayNewButton(count: Int, onClick: () -> Unit) {
    Row(
        Modifier
            .height(48.dp)
            .clip(RoundedCornerShape(50))
            .background(AdhxColors.Button)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(AdhxColors.Accent))
        Spacer(Modifier.width(8.dp))
        Text(Copy.playNew(count), fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.Cream)
    }
}

/** "Keep this channel" (a plus), then "Kept · Open" (a tick) once it's one of yours. */
@Composable
private fun KeepButton(kept: Boolean, busy: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .height(48.dp)
            .clip(RoundedCornerShape(50))
            .background(AdhxColors.Button)
            .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(50))
            .clickable(enabled = !busy, role = Role.Button, onClick = onClick)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (busy) {
            Spinner(size = 16.dp, stroke = 2.dp)
        } else {
            Icon(if (kept) Glyphs.Check else Glyphs.Plus, contentDescription = null, tint = if (kept) AdhxColors.Accent else AdhxColors.Cream, modifier = Modifier.size(16.dp))
        }
        Spacer(Modifier.width(8.dp))
        Text(if (kept) Copy.KEPT_OPEN else Copy.KEEP_CHANNEL, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.Cream)
    }
}

/** "Play all": yellow, with a play mark. */
@Composable
private fun PlayButton(onClick: () -> Unit) {
    Row(
        Modifier
            .height(48.dp)
            .clip(RoundedCornerShape(50))
            .background(AdhxColors.Accent)
            .clickable(onClick = onClick)
            .padding(horizontal = 22.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Glyphs.Play, contentDescription = null, tint = Color.Black, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(Copy.PLAY_ALL, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = Color.Black)
    }
}

/**
 * A group channel's bar over its player (boards 15.8, 15.10): Close (down),
 * then the channel's name, which is the toggle: "+ Coding with AI" keeps it as
 * one of yours, "✓ Coding with AI" leaves it. [toast] shows under it.
 */
@Composable
fun BoxScope.GroupChannelBar(title: String, kept: Boolean, busy: Boolean, toast: String?, onClose: () -> Unit, onToggle: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.6f), Color.Transparent)))
            .statusBarsPadding()
            .padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.45f))
                    .clickable(onClickLabel = "Close", role = Role.Button, onClick = onClose)
                    .semantics { contentDescription = "Close" },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Glyphs.Chevron, contentDescription = null, tint = AdhxColors.Cream, modifier = Modifier.size(18.dp).rotate(90f))
            }
            val label = if (kept) Copy.LEAVE_THIS_CHANNEL else Copy.KEEP_CHANNEL
            Row(
                Modifier
                    .weight(1f, fill = false)
                    .height(40.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Color.Black.copy(alpha = 0.5f))
                    .border(1.dp, Color.White.copy(alpha = 0.14f), RoundedCornerShape(50))
                    .clickable(enabled = !busy, onClickLabel = label, role = Role.Button, onClick = onToggle)
                    .clearAndSetSemantics {
                        contentDescription = "$title. $label"
                        role = Role.Button
                        selected = kept
                    }
                    .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (busy) {
                    Spinner(size = 14.dp, stroke = 2.dp)
                } else {
                    Icon(if (kept) Glyphs.Check else Glyphs.Plus, contentDescription = null, tint = AdhxColors.Accent, modifier = Modifier.size(16.dp))
                }
                Text(title, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.Cream, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (toast != null) {
            ToastPill(toast, Modifier.align(Alignment.CenterHorizontally))
        }
    }
}
