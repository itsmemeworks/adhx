package com.adhx.share.doing

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.adhx.share.library.BarButton
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.DoingItem
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.Segmented
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.SettingsCopy
import com.adhx.share.ui.SquircleShape

/** The row a download that gave up sits in. */
private val NeedsYouBorder = AdhxColors.Live.copy(alpha = 0.5f)

/** Asks `/api/app/doing` while the screen holding it is in front. */
@Composable
fun PollDoing(doing: DoingViewModel) {
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val resumed = lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    LaunchedEffect(resumed) {
        if (resumed) doing.poll()
    }
}

/**
 * Over the player: "3 on their way" while posts are on their way, polling
 * while it's on screen. Tapping it opens the sheet, which links to the
 * full list ([onSeeAll]).
 */
@Composable
fun DoingPillHost(doing: DoingViewModel, server: String, onSeeAll: () -> Unit, modifier: Modifier = Modifier, hidePill: Boolean = false) {
    PollDoing(doing)
    val ui by doing.ui.collectAsStateWithLifecycle()
    var open by rememberSaveable { mutableStateOf(false) }
    // [hidePill]: a short message from the player is in its place for now.
    AnimatedVisibility(visible = ui.onTheirWay > 0 && !hidePill, enter = fadeIn(), exit = fadeOut(), modifier = modifier) {
        DoingPill(ui.onTheirWay, ui.needsYou, onClick = { open = true })
    }
    if (open) {
        DoingSheet(
            ui = ui,
            server = server,
            onRetry = doing::retry,
            onSeeAll = {
                open = false
                onSeeAll()
            },
            onDismiss = { open = false },
        )
    }
}

/** A small dark pill with a yellow ring and a turning mark. */
@Composable
fun DoingPill(count: Int, needsYou: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val label = SettingsCopy.onTheirWay(count)
    Row(
        modifier
            .height(34.dp)
            .clip(RoundedCornerShape(50))
            .background(Color.Black.copy(alpha = 0.6f))
            .border(1.5.dp, AdhxColors.Accent, RoundedCornerShape(50))
            .clickable(onClickLabel = SettingsCopy.DOING, onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = listOfNotNull(label, needsYou.takeIf { it > 0 }?.let(SettingsCopy::needsYou)).joinToString(", ")
            }
            .padding(start = 10.dp, end = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(14.dp),
            color = AdhxColors.Accent,
            trackColor = AdhxColors.Line,
            strokeWidth = 2.5.dp,
        )
        Spacer(Modifier.width(8.dp))
        Text(label, fontSize = 13.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.Ink, modifier = Modifier.clearAndSetSemantics { })
    }
}

/** "3 on their way": each post with its step and a thin bar; ones that need you have Retry. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoingSheet(
    ui: DoingUi,
    server: String,
    onRetry: (DoingItem) -> Unit,
    onSeeAll: () -> Unit,
    onDismiss: () -> Unit,
) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    // What's moving first, then what needs you (as on the boards).
    val shown = ui.items.filterNot { it.ready }.sortedBy { it.needsYou }.take(SHEET_MAX)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = AdhxColors.Surface,
        shape = SquircleShape.top(28.dp),
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(start = 20.dp, end = 20.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.padding(bottom = 4.dp)) {
                Text(
                    if (ui.onTheirWay > 0) SettingsCopy.onTheirWay(ui.onTheirWay) else SettingsCopy.DOING,
                    fontFamily = SerifFamily,
                    fontSize = 32.sp,
                    lineHeight = 34.sp,
                    color = AdhxColors.Ink,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                if (ui.needsYou > 0) {
                    Text(SettingsCopy.needsYou(ui.needsYou), fontSize = 13.sp, color = AdhxColors.InkFaint, modifier = Modifier.padding(bottom = 4.dp))
                }
            }
            if (shown.isEmpty()) {
                Text(SettingsCopy.DOING_EMPTY, fontSize = 15.sp, color = AdhxColors.InkSoft)
            }
            shown.forEach { item ->
                DoingRow(
                    item = item,
                    server = server,
                    retrying = item.key in ui.retrying,
                    note = ui.notes[item.key],
                    onRetry = { onRetry(item) },
                    showRetry = item.needsYou,
                )
            }
            OutlineButton(SettingsCopy.SEE_EVERYTHING, onClick = onSeeAll, minHeight = 48.dp, modifier = Modifier.fillMaxWidth())
            Text(
                SettingsCopy.ON_YOUR_SERVER,
                fontSize = 12.sp,
                color = AdhxColors.InkFaint,
                modifier = Modifier.fillMaxWidth(),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }
}

/**
 * One post on its way: its picture (a lock when a download gave up), the
 * title, a thin bar (green once it plays) and what's happening. [showRetry]
 * adds Retry for posts you saved.
 */
@Composable
fun DoingRow(
    item: DoingItem,
    server: String,
    retrying: Boolean,
    note: String?,
    onRetry: () -> Unit,
    showRetry: Boolean,
) {
    val shape = SquircleShape(18.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(AdhxColors.Plate)
            .then(if (item.needsYou) Modifier.border(1.dp, NeedsYouBorder, shape) else Modifier)
            .padding(10.dp)
            .semantics(mergeDescendants = true) { },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Thumb(item, server)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(if (item.needsYou) 2.dp else 5.dp)) {
            Text(
                SettingsCopy.doingTitle(item),
                fontSize = 14.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.ExtraBold,
                color = AdhxColors.Ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!item.needsYou) Bar(item)
            Text(
                note ?: SettingsCopy.doingLine(item),
                fontSize = 12.sp,
                lineHeight = 15.sp,
                color = AdhxColors.InkSoft,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (showRetry && item.retry) {
            Box(
                Modifier
                    .heightIn(min = 40.dp)
                    .clip(RoundedCornerShape(50))
                    .background(AdhxColors.Cream)
                    .clickable(enabled = !retrying, role = Role.Button, onClick = onRetry)
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (retrying) {
                    CircularProgressIndicator(Modifier.size(18.dp), color = AdhxColors.OnCream, strokeWidth = 2.dp)
                } else {
                    Text(SettingsCopy.RETRY, fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.OnCream)
                }
            }
        }
    }
}

@Composable
private fun Thumb(item: DoingItem, server: String) {
    // Tucked into the row's corner: 18 − 10 padding = 8.
    val shape = SquircleShape(8.dp)
    val url = item.thumbnail?.takeIf { it.isNotBlank() }?.let { AdhxApi.resolve(server, it)?.toString() }
    Box(
        Modifier
            .size(48.dp)
            .clip(shape)
            .background(if (item.needsYou) AdhxColors.Surface else AdhxColors.Placeholder),
        contentAlignment = Alignment.Center,
    ) {
        if (item.needsYou && item.step <= 3) {
            Icon(Icons.Filled.Lock, contentDescription = null, tint = AdhxColors.Live, modifier = Modifier.size(20.dp))
        } else if (url != null) {
            AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}

@Composable
private fun Bar(item: DoingItem) {
    val fraction = SettingsCopy.doingProgress(item)
    val color = when {
        item.playable || item.ready -> AdhxColors.Good
        item.status == com.adhx.share.net.DoingStatus.WAITING -> AdhxColors.InkFaint
        else -> AdhxColors.Accent
    }
    Box(
        Modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(RoundedCornerShape(2.dp))
            .background(AdhxColors.Line)
            .clearAndSetSemantics { },
    ) {
        Box(
            Modifier
                .fillMaxWidth(fraction.coerceIn(0.03f, 1f))
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(color),
        )
    }
}

/**
 * Everything your ADHX is doing: what's on its way, what needs you, what
 * just finished, with Retry on the stuck ones you saved.
 */
@Composable
fun DoingScreen(doing: DoingViewModel, server: String, onBack: () -> Unit) {
    PollDoing(doing)
    val ui by doing.ui.collectAsStateWithLifecycle()
    var filter by rememberSaveable { mutableIntStateOf(0) }
    val items = remember(ui.items, filter) {
        when (filter) {
            1 -> ui.items.filter { it.needsYou }
            2 -> ui.items.filter { it.ready }
            else -> ui.items.filterNot { it.ready }
        }
    }
    Column(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Bg)
            .statusBarsPadding()
            .padding(horizontal = 16.dp),
    ) {
        Row(Modifier.height(64.dp), verticalAlignment = Alignment.CenterVertically) {
            BarButton(com.adhx.share.ui.Glyphs.Back, "Back", onBack)
            Spacer(Modifier.width(12.dp))
            Text(
                SettingsCopy.DOING,
                fontFamily = SerifFamily,
                fontSize = 26.sp,
                color = AdhxColors.Ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.semantics { heading() },
            )
        }
        SettingsCopy.doingSummary(ui.view?.summary)?.let {
            Text(it, fontSize = 14.sp, color = AdhxColors.InkFaint, modifier = Modifier.padding(bottom = 12.dp))
        }
        Segmented(
            options = SettingsCopy.DOING_FILTERS,
            selected = filter,
            onSelect = { filter = it },
            modifier = Modifier.fillMaxWidth(),
            height = 40.dp,
        )
        Spacer(Modifier.height(14.dp))
        when {
            ui.unavailable -> Text(SettingsCopy.DOING_UNAVAILABLE, fontSize = 15.sp, color = AdhxColors.InkSoft)
            ui.view == null && ui.error != null -> {
                Text(ui.error ?: SettingsCopy.DOING_CANT_LOAD, fontSize = 15.sp, color = AdhxColors.InkSoft)
                Spacer(Modifier.height(12.dp))
                OutlineButton("Try again", onClick = doing::refresh, minHeight = 44.dp)
            }
            ui.view == null -> Box(Modifier.fillMaxWidth().padding(top = 30.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(34.dp), color = AdhxColors.Accent, trackColor = AdhxColors.Line, strokeWidth = 3.dp)
            }
            items.isEmpty() -> Text(SettingsCopy.DOING_EMPTY, fontSize = 15.sp, color = AdhxColors.InkFaint)
            else -> LazyColumn(
                Modifier.fillMaxWidth().weight(1f),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(items, key = { it.key }) { item ->
                    DoingRow(
                        item = item,
                        server = server,
                        retrying = item.key in ui.retrying,
                        note = ui.notes[item.key],
                        onRetry = { doing.retry(item) },
                        showRetry = !item.ready,
                    )
                }
                item {
                    Text(
                        SettingsCopy.ON_YOUR_SERVER,
                        fontSize = 12.sp,
                        color = AdhxColors.InkFaint,
                        modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 16.dp),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            }
        }
    }
}

private const val SHEET_MAX = 5
