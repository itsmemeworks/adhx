package com.adhx.share.share

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
import coil.compose.AsyncImage
import com.adhx.share.links.Links
import com.adhx.share.links.Networks
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.KeepStatus
import com.adhx.share.net.StatusResponse
import com.adhx.share.ui.AdhxBrand
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.NetworkMark
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.PrimaryButton
import com.adhx.share.ui.SerifFamily
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
    onOpenInAdhx: (server: String, path: String?) -> Unit,
    onOpenApp: () -> Unit,
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val visible = remember { MutableTransitionState(false).apply { targetState = true } }
    var touched by remember { mutableStateOf(false) }
    val close: () -> Unit = { visible.targetState = false }

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
            Sheet(frosted = frosted, onTouched = { touched = true }, onDismiss = close) {
                when (ui.phase) {
                    Phase.Saving -> SavingContent(ui)
                    Phase.Saved, Phase.AlreadySaved -> SavedContent(
                        ui = ui,
                        onOpen = {
                            ui.server?.let { onOpenInAdhx(it, ui.post?.openPath) }
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
                    Phase.Offline -> OfflineContent(ui, onDone = close)
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
private fun Sheet(frosted: Boolean, onTouched: () -> Unit, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    val density = LocalDensity.current
    var dragOffset by remember { mutableFloatStateOf(0f) }
    val dragState = rememberDraggableState { delta -> dragOffset = (dragOffset + delta).coerceAtLeast(0f) }

    // Glass over a blurred app; nearly solid where the app behind isn't blurred.
    val glass by animateFloatAsState(if (frosted) 0.72f else 0.94f, label = "glass")
    Column(
        modifier = Modifier
            .navigationBarsPadding()
            .padding(horizontal = 10.dp, vertical = 10.dp)
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
            .clip(RoundedCornerShape(28.dp))
            .background(AdhxColors.Surface.copy(alpha = glass))
            .border(1.dp, AdhxColors.White.copy(alpha = 0.08f), RoundedCornerShape(28.dp))
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
            .padding(start = 18.dp, end = 18.dp, top = 10.dp, bottom = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            Modifier
                .align(Alignment.CenterHorizontally)
                .size(width = 32.dp, height = 4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(AdhxColors.Hairline),
        )
        AdhxBrand(markSize = 24.dp)
        content()
    }
}

@Composable
private fun SavingContent(ui: ShareUi) {
    PostHeader(ui = ui, loading = true)
    StatusBox {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Spinner(size = 22.dp, stroke = 3.dp, track = AdhxColors.Raised)
            Box(Modifier.width(12.dp))
            Text(Copy.SAVING, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.White)
        }
    }
    Text(Copy.SAVING_NOTE, fontSize = 13.sp, lineHeight = 19.sp, color = AdhxColors.Faint)
}

@Composable
private fun SavedContent(ui: ShareUi, onOpen: () -> Unit, onDone: () -> Unit) {
    val already = ui.phase == Phase.AlreadySaved
    PostHeader(ui = ui, loading = false)
    StatusBox {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (!already) {
                    CheckBadge()
                    Box(Modifier.width(10.dp))
                }
                Column {
                    Text(
                        if (already) Copy.ALREADY else Copy.SAVED,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = AdhxColors.White,
                    )
                    val line = if (already) Copy.alreadyLine(ui.post?.savedAt, ui.keep) else Copy.keepLine(ui.keep)
                    if (line != null) {
                        Text(line, fontSize = 13.sp, color = AdhxColors.Muted)
                    }
                }
            }
            if (!already) KeepBar(ui.keep)
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlineButton("Open in ADHX", onClick = onOpen, modifier = Modifier.weight(1f))
        PrimaryButton("Done", onClick = onDone, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun OfflineContent(ui: ShareUi, onDone: () -> Unit) {
    LinkRow(ui)
    StatusBox {
        Column {
            Text(Copy.OFFLINE_TITLE, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.White)
            Text(Copy.OFFLINE_BODY, fontSize = 13.sp, lineHeight = 18.sp, color = AdhxColors.Muted)
        }
    }
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
    val shape = RoundedCornerShape(3.dp)
    if (percent != null) {
        val fraction by animateFloatAsState(targetValue = (percent / 100f).coerceIn(0f, 1f), label = "keep")
        Box(
            Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(shape)
                .background(AdhxColors.Raised),
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
                .height(6.dp)
                .clip(shape),
            color = AdhxColors.Accent,
            trackColor = AdhxColors.Raised,
        )
    }
}
