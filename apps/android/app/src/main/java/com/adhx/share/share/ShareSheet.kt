package com.adhx.share.share

import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import com.adhx.share.ui.Glyphs
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.adhx.share.links.Links
import com.adhx.share.links.Networks
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.KeepStatus
import com.adhx.share.net.SaveResponse
import com.adhx.share.net.StatusResponse
import com.adhx.share.ui.AdhxBrand
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.SansFamily
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Faces
import com.adhx.share.ui.JustForMeRow
import com.adhx.share.ui.NetworkMark
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.PrimaryButton
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.serifLineBox
import com.adhx.share.ui.SkeletonBar
import com.adhx.share.ui.Spinner
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

/**
 * A compact frosted card at the bottom, over the app you shared from:
 * saving → saved, or already saved / not a post / offline / not connected.
 * [frosted] is true while the window behind is blurred.
 */
@Composable
fun ShareSheetScreen(
    vm: ShareViewModel,
    frosted: Boolean,
    onFinish: () -> Unit,
    /** Opens the post in this app's player (or just the app); never the website. */
    onOpenInAdhx: (server: String, post: SaveResponse?) -> Unit,
    onOpenApp: () -> Unit,
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val visible = remember { MutableTransitionState(false).apply { targetState = true } }
    var touched by remember { mutableStateOf(false) }
    var note by rememberSaveable { mutableStateOf("") }
    // Closing (Done, back, a tap outside, the auto-close) keeps the note: it goes out behind the save.
    val close: () -> Unit = {
        vm.commitNote(note)
        visible.targetState = false
    }

    // Finish the activity once the sheet has slid away.
    val gone = !visible.targetState && !visible.currentState && visible.isIdle
    LaunchedEffect(gone) { if (gone) onFinish() }

    // Saved closes itself after 3 s, unless the sheet was touched.
    LaunchedEffect(ui.phase, touched) {
        if (ui.phase == Phase.Saved && !touched) {
            delay(3_000)
            close()
        }
    }

    BackHandler { close() }

    Box(
        Modifier
            .fillMaxSize()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = close,
            ),
    ) {
        AnimatedVisibility(
            visibleState = visible,
            modifier = Modifier.align(Alignment.BottomCenter),
            enter = slideInVertically { it } + fadeIn(),
            exit = slideOutVertically { it } + fadeOut(),
        ) {
            val card = ui.phase == Phase.Saving || ui.phase == Phase.Saved || ui.phase == Phase.AlreadySaved
            Sheet(frosted = frosted, onTouched = { touched = true }, onDismiss = close, brand = !card) {
                when (ui.phase) {
                    Phase.Saving -> SavingContent(ui, onJustForMe = vm::setJustForMe, note = note, onNote = { note = it })
                    Phase.Saved, Phase.AlreadySaved -> SavedContent(
                        ui = ui,
                        note = note,
                        onNote = { note = it },
                        onJustForMe = vm::setJustForMe,
                        onOpen = {
                            ui.server?.let { onOpenInAdhx(it, ui.post) }
                            close()
                        },
                        onDone = close,
                    )
                    Phase.NotAPost -> MessageContent(
                        ui = ui,
                        title = Copy.NOT_A_POST_TITLE,
                        body = ui.message ?: Copy.NOT_A_POST_BODY,
                        button = "OK",
                        onButton = close,
                    )
                    Phase.Offline -> OfflineContent(ui, onJustForMe = vm::setJustForMe, onDone = close)
                    Phase.NotConnected -> NotConnectedContent(
                        onOpenApp = {
                            onOpenApp()
                            close()
                        },
                        onClose = close,
                    )
                    Phase.Failed -> MessageContent(
                        ui = ui,
                        title = Copy.FAILED_TITLE,
                        body = ui.message ?: Copy.FAILED_BODY,
                        button = "OK",
                        onButton = close,
                    )
                }
            }
        }
    }
}

@Composable
private fun Sheet(frosted: Boolean, onTouched: () -> Unit, onDismiss: () -> Unit, brand: Boolean = true, content: @Composable () -> Unit) {
    val density = LocalDensity.current
    var dragOffset by remember { mutableFloatStateOf(0f) }
    val dragState = rememberDraggableState { delta -> dragOffset = (dragOffset + delta).coerceAtLeast(0f) }

    // Glass over a blurred app; nearly solid where the app behind isn't blurred.
    val glass by animateFloatAsState(if (frosted) 0.8f else 0.94f, label = "glass")
    Column(
        modifier = Modifier
            .navigationBarsPadding()
            .imePadding()
            .padding(start = 12.dp, end = 12.dp, top = 12.dp, bottom = 16.dp)
            .widthIn(max = 520.dp)
            .fillMaxWidth()
            // Drag down to dismiss. Outside the offset, so the drag isn't
            // measured against a sheet that moves under the finger.
            .draggable(
                state = dragState,
                orientation = Orientation.Vertical,
                onDragStopped = { velocity ->
                    if (dragOffset > with(density) { 96.dp.toPx() } || velocity > 2_000f) {
                        onDismiss()
                    } else {
                        dragOffset = 0f
                    }
                },
            )
            .offset { IntOffset(0, dragOffset.roundToInt()) }
            .shadow(30.dp, RoundedCornerShape(28.dp), ambientColor = Color.Black, spotColor = Color.Black)
            .clip(RoundedCornerShape(28.dp))
            .background(AdhxColors.Surface.copy(alpha = glass))
            .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(28.dp))
            // Any touch on the sheet keeps it open (no auto-close).
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        awaitPointerEvent(PointerEventPass.Initial)
                        onTouched()
                    }
                }
            }
            // Taps on the sheet itself don't fall through to the dimmed area.
            .pointerInput(Unit) { detectTapGestures { } }
            .padding(if (brand) 18.dp else 20.dp),
        verticalArrangement = Arrangement.spacedBy(if (brand) 14.dp else 16.dp),
    ) {
        // The saving and saved card carries the mark beside the poster, as on the boards.
        if (brand) AdhxBrand(markSize = 24.dp)
        content()
    }
}

@Composable
private fun SavingContent(ui: ShareUi, onJustForMe: (Boolean) -> Unit, note: String, onNote: (String) -> Unit) {
    CardTop(ui = ui, title = Copy.SAVING, line = null)
    Text(Copy.SAVING_NOTE, fontSize = 13.sp, lineHeight = 19.sp, color = AdhxColors.Faint)
    NoteField(note, onNote, ui.justForMe)
    JustForMeRow(on = ui.justForMe, onChange = onJustForMe)
}

@Composable
private fun SavedContent(
    ui: ShareUi,
    note: String,
    onNote: (String) -> Unit,
    onJustForMe: (Boolean) -> Unit,
    onOpen: () -> Unit,
    onDone: () -> Unit,
) {
    val already = ui.phase == Phase.AlreadySaved
    CardTop(
        ui = ui,
        title = when {
            already -> Copy.ALREADY
            ui.justForMe -> Copy.SAVED_PRIVATE
            else -> Copy.SAVED_SHARED
        },
        line = if (already) Copy.alreadyLine(ui.post?.savedAt, ui.keep) else Copy.keepLine(ui.keep),
        done = true,
        bar = !already,
    )
    Audience(ui)
    NoteField(note, onNote, ui.justForMe)
    JustForMeRow(on = ui.justForMe, onChange = onJustForMe, busy = ui.switching, enabled = !ui.switching)
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(
            Modifier
                .weight(1f)
                .height(52.dp)
                .clip(RoundedCornerShape(50))
                .background(AdhxColors.Card)
                .clickable(role = Role.Button, onClick = onOpen),
            contentAlignment = Alignment.Center,
        ) {
            Text("Open in ADHX", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.White)
        }
        Box(
            Modifier
                .weight(1f)
                .height(52.dp)
                .clip(RoundedCornerShape(50))
                .background(AdhxColors.Accent)
                .clickable(role = Role.Button, onClick = onDone),
            contentAlignment = Alignment.Center,
        ) {
            Text("Done", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = Color.Black)
        }
    }
}

/**
 * The card's top: the poster (84×148, with a yellow tick once it's saved, a
 * lock when it's just for you), then the mark, the big serif title, the
 * network, and how the copy is coming along.
 */
@Composable
private fun CardTop(ui: ShareUi, title: String, line: String?, done: Boolean = false, bar: Boolean = true) {
    val post = ui.post
    val posterUrl = post?.posterUrl?.let { p -> ui.server?.let { AdhxApi.resolve(it, p)?.toString() } }
    val networkName = post?.network ?: Networks.name(ui.platform) ?: ui.link?.let(Links::host) ?: ""
    Row(Modifier.height(IntrinsicSize.Min)) {
        Box(Modifier.size(width = 84.dp, height = 148.dp)) {
            Box(
                Modifier
                    .matchParentSize()
                    .clip(RoundedCornerShape(16.dp))
                    .background(AdhxColors.Placeholder),
                contentAlignment = Alignment.Center,
            ) {
                if (posterUrl != null) {
                    AsyncImage(posterUrl, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
                } else {
                    NetworkMark(ui.platform, size = 22.dp, tint = AdhxColors.Faint)
                }
            }
            if (done) {
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .offset(x = 6.dp, y = 6.dp)
                        .size(28.dp)
                        .background(AdhxColors.Surface, CircleShape)
                        .padding(3.dp)
                        .clip(CircleShape)
                        .background(if (ui.justForMe) AdhxColors.White else AdhxColors.Accent),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        if (ui.justForMe) Glyphs.Lock else Glyphs.Check,
                        contentDescription = null,
                        tint = Color.Black,
                        modifier = Modifier.size(13.dp),
                    )
                }
            }
        }
        Box(Modifier.width(16.dp))
        Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            AdhxBrand(markSize = 20.dp)
            Text(title, fontFamily = SerifFamily, fontSize = 34.sp, lineHeight = 33.sp, color = AdhxColors.White, modifier = Modifier.serifLineBox(34.sp, 33.sp))
            if (networkName.isNotBlank()) {
                Text(networkName, fontSize = 13.sp, lineHeight = 17.sp, color = AdhxColors.Faint, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            // Still saving: the post's words aren't in yet.
            if (post == null) {
                SkeletonBar(12.dp, Modifier.fillMaxWidth(0.8f))
                SkeletonBar(12.dp, Modifier.fillMaxWidth(0.55f))
            }
            Spacer(Modifier.weight(1f))
            // The line and its bar sit 6dp apart at the bottom, level with the poster's foot (the boards' margin-top: auto).
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (line != null) Text(line, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.Muted, maxLines = 1)
                if (bar) KeepBar(ui.keep)
            }
        }
    }
}

/** "Add a note": one line for your people (or future you), sent with the save. */
@Composable
private fun NoteField(note: String, onNote: (String) -> Unit, justForMe: Boolean) {
    var focused by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(Copy.ADD_A_NOTE, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.Muted)
        Box(
            Modifier
                .fillMaxWidth()
                .height(48.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(AdhxColors.Background)
                .border(
                    1.dp,
                    if (focused || note.isNotEmpty()) AdhxColors.Accent.copy(alpha = 0.6f) else Color.White.copy(alpha = 0.12f),
                    RoundedCornerShape(16.dp),
                )
                .padding(horizontal = 16.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (note.isEmpty()) {
                Text(
                    if (justForMe) Copy.NOTE_PRIVATE_HINT else Copy.NOTE_HINT,
                    fontSize = 16.sp,
                    color = AdhxColors.Faint.copy(alpha = 0.8f),
                    maxLines = 1,
                    modifier = Modifier.clearAndSetSemantics { },
                )
            }
            BasicTextField(
                value = note,
                onValueChange = { onNote(it.take(Copy.NOTE_MAX)) },
                singleLine = true,
                textStyle = TextStyle(fontFamily = SansFamily, fontSize = 16.sp, color = AdhxColors.White),
                cursorBrush = SolidColor(AdhxColors.Accent),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
                modifier = Modifier
                    .fillMaxWidth()
                    .onFocusChanged { focused = it.isFocused }
                    .semantics { contentDescription = Copy.ADD_A_NOTE },
            )
        }
    }
}

@Composable
private fun OfflineContent(ui: ShareUi, onJustForMe: (Boolean) -> Unit, onDone: () -> Unit) {
    LinkRow(ui)
    StatusBox {
        Column {
            Text(if (ui.justForMe) Copy.PRIVATE_LATER else Copy.OFFLINE_TITLE, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.White)
            Text(Copy.OFFLINE_BODY, fontSize = 13.sp, lineHeight = 18.sp, color = AdhxColors.Muted)
        }
    }
    JustForMeRow(on = ui.justForMe, onChange = onJustForMe)
    PrimaryButton("Done", onClick = onDone, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun MessageContent(ui: ShareUi, title: String, body: String, button: String, onButton: () -> Unit) {
    if (ui.link != null) LinkRow(ui)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, fontFamily = SerifFamily, fontSize = 30.sp, lineHeight = 32.sp, color = AdhxColors.White)
        Text(body, fontSize = 14.sp, lineHeight = 20.sp, color = AdhxColors.Muted)
    }
    PrimaryButton(button, onClick = onButton, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun NotConnectedContent(onOpenApp: () -> Unit, onClose: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(Copy.NOT_CONNECTED_TITLE, fontFamily = SerifFamily, fontSize = 30.sp, lineHeight = 32.sp, color = AdhxColors.White)
        Text(Copy.NOT_CONNECTED_BODY, fontSize = 14.sp, lineHeight = 20.sp, color = AdhxColors.Muted)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlineButton("Not now", onClick = onClose, modifier = Modifier.weight(1f))
        PrimaryButton("Open ADHX Share", onClick = onOpenApp, modifier = Modifier.weight(1f))
    }
}

/**
 * Who will see it: your people's faces and "Ana, Ben and Jo will see it", or,
 * with Just for me on, a lock and "Only you will see this save".
 */
@Composable
private fun Audience(ui: ShareUi) {
    val shape = RoundedCornerShape(18.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Color.White.copy(alpha = 0.06f))
            .then(if (ui.justForMe) Modifier.dashedBorder(Color.White.copy(alpha = 0.16f), 18.dp) else Modifier)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (ui.justForMe) {
            Box(
                Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(AdhxColors.Cream),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Glyphs.Lock, contentDescription = null, tint = AdhxColors.Black, modifier = Modifier.size(18.dp))
            }
            Box(Modifier.width(12.dp))
            Text(Copy.PRIVATE_NOTE, fontSize = 15.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.White)
        } else {
            val names = ui.people.map { it.label }
            if (ui.people.isNotEmpty() && ui.server != null) {
                Faces(ui.people, ui.server, size = 30.dp, max = 4, ring = Color(0xFF22201C))
                Box(Modifier.width(12.dp))
            }
            Text(Copy.willSee(names), fontSize = 15.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.White)
        }
    }
}

/** Poster on the left; network, author and words on the right. */
@Composable
private fun PostHeader(ui: ShareUi, loading: Boolean) {
    val post = ui.post
    val posterUrl = post?.posterUrl?.let { p -> ui.server?.let { AdhxApi.resolve(it, p)?.toString() } }
    val networkName = post?.network ?: Networks.name(ui.platform) ?: ui.link?.let(Links::host) ?: ""

    Row(verticalAlignment = Alignment.CenterVertically) {
        Poster(url = posterUrl, platform = ui.platform)
        Box(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                NetworkMark(ui.platform, size = 16.dp)
                Box(Modifier.width(7.dp))
                Text(networkName, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Muted, maxLines = 1)
            }
            if (loading || post == null) {
                SkeletonBar(16.dp, Modifier.fillMaxWidth(0.7f))
                SkeletonBar(12.dp, Modifier.fillMaxWidth(0.9f))
                SkeletonBar(12.dp, Modifier.fillMaxWidth(0.6f))
                ui.link?.let {
                    Text(
                        Links.display(it),
                        fontSize = 12.sp,
                        color = AdhxColors.Faint,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            } else {
                val title = Copy.handle(post.author) ?: post.authorName?.takeIf { it.isNotBlank() }
                if (title != null) {
                    Text(
                        title,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = AdhxColors.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                val words = post.text?.takeIf { it.isNotBlank() }
                if (words != null) {
                    Text(
                        words,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        color = AdhxColors.Muted,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/** Tall for vertical video (56×96), wide once a landscape poster loads (96×54). */
@Composable
private fun Poster(url: String?, platform: String?) {
    var landscape by remember(url) { mutableStateOf(false) }
    val width: Dp = if (landscape) 96.dp else 56.dp
    val height: Dp = if (landscape) 54.dp else 96.dp
    Box(
        Modifier
            .size(width = width, height = height)
            .clip(RoundedCornerShape(12.dp))
            .background(AdhxColors.Placeholder),
        contentAlignment = Alignment.Center,
    ) {
        if (url != null) {
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
                onSuccess = { state ->
                    val size = state.painter.intrinsicSize
                    if (size.width > size.height * 1.2f) landscape = true
                },
            )
        } else {
            NetworkMark(platform, size = 22.dp, tint = AdhxColors.Faint)
        }
    }
}

/** The network mark and the link, for states without a post card. */
@Composable
private fun LinkRow(ui: ShareUi) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        NetworkMark(ui.platform, size = 16.dp)
        Box(Modifier.width(7.dp))
        Text(
            ui.link?.let(Links::display) ?: "",
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = AdhxColors.Muted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun StatusBox(content: @Composable () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            // Darker glass inside the card, not a solid block.
            .background(AdhxColors.Black.copy(alpha = 0.4f))
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        content()
    }
}

/** A 1dp dashed outline with rounded corners (the "just for you" box). */
private fun Modifier.dashedBorder(color: Color, corner: Dp): Modifier = drawBehind {
    val stroke = 1.dp.toPx()
    drawRoundRect(
        color = color,
        topLeft = androidx.compose.ui.geometry.Offset(stroke / 2, stroke / 2),
        size = androidx.compose.ui.geometry.Size(size.width - stroke, size.height - stroke),
        cornerRadius = androidx.compose.ui.geometry.CornerRadius(corner.toPx()),
        style = Stroke(stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))),
    )
}

@Composable
private fun CheckBadge() {
    Box(
        Modifier
            .size(28.dp)
            .clip(CircleShape)
            .background(AdhxColors.Accent),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Filled.Check, contentDescription = null, tint = AdhxColors.Black, modifier = Modifier.size(18.dp))
    }
}

/** The copy's progress: a filling bar when the server reports a percent, else a moving one. */
@Composable
private fun KeepBar(keep: StatusResponse?) {
    val status = keep?.status
    val busy = status == null || status == KeepStatus.WAITING || status == KeepStatus.KEEPING || status == KeepStatus.RETRYING
    if (!busy) return
    val percent = keep?.percent
    val shape = RoundedCornerShape(50)
    if (percent != null) {
        val fraction by animateFloatAsState(targetValue = (percent / 100f).coerceIn(0f, 1f), label = "keep")
        Box(
            Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(shape)
                .background(Color.White.copy(alpha = 0.12f)),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(fraction)
                    .fillMaxHeight()
                    .clip(shape)
                    .background(AdhxColors.Accent),
            )
        }
    } else {
        LinearProgressIndicator(
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .clip(shape),
            color = AdhxColors.Accent,
            trackColor = Color.White.copy(alpha = 0.12f),
        )
    }
}
