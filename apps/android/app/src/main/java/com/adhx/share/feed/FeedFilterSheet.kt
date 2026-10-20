package com.adhx.share.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import com.adhx.share.ui.AdhxSwitch
import com.adhx.share.ui.Glyphs
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adhx.share.net.MediaType
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.PrimaryButton
import com.adhx.share.ui.Segmented
import com.adhx.share.ui.SerifFamily
import kotlinx.coroutines.launch

/**
 * What's in your feed: switches for Videos, Photos, Text posts and Articles
 * (at least one stays on), and whose saves. Applied when it closes, so the
 * feed starts over once.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedFilterSheet(
    types: Set<String>,
    mode: String,
    onApply: (Set<String>, String) -> Unit,
    newCount: String? = null,
    hidden: Map<String, Int> = emptyMap(),
) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var picked by remember { mutableStateOf(types) }
    var whose by remember { mutableStateOf(mode) }
    val close: () -> Unit = { onApply(picked, whose) }
    ModalBottomSheet(
        onDismissRequest = close,
        sheetState = state,
        containerColor = AdhxColors.Surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { SheetHandle(AdhxColors.Hairline) },
    ) {
        Column(
            Modifier
                .navigationBarsPadding()
                .padding(start = 20.dp, end = 20.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    Copy.FILTER_TITLE,
                    fontFamily = SerifFamily,
                    fontSize = 32.sp,
                    lineHeight = 32.sp,
                    color = AdhxColors.White,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                if (newCount != null) {
                    Text("$newCount new", fontSize = 13.sp, color = AdhxColors.Faint, maxLines = 1, modifier = Modifier.padding(bottom = 4.dp))
                }
            }
            Column(
                Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(AdhxColors.Card),
            ) {
                MediaType.all.forEachIndexed { i, type ->
                    val on = type in picked
                    // The last one on can't be switched off.
                    val last = on && picked.size == 1
                    TypeRow(
                        type = type,
                        on = on,
                        enabled = !last,
                        note = if (last) Copy.KEEP_ONE else null,
                        onChange = { want -> picked = if (want) picked + type else picked - type },
                    )
                    if (i < MediaType.all.lastIndex) {
                        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.06f)))
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    Copy.WHOSE_SAVES.uppercase(),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 0.8.sp,
                    color = AdhxColors.Faint,
                )
                Segmented(
                    options = Copy.WHOSE,
                    selected = whoseIndex(whose),
                    onSelect = { whose = WHOSE_MODES[it] },
                    background = AdhxColors.Card,
                    height = 40.dp,
                    fontSize = 14,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            // What the switches leave out, by the current feed's count.
            val waiting = Copy.waitingNote(hidden.filterKeys { it !in picked })
            if (waiting != null) Text(waiting, fontSize = 13.sp, lineHeight = 18.sp, color = AdhxColors.Faint)
            PrimaryButton(
                Copy.showKinds(picked),
                onClick = { scope.launch { state.hide() }.invokeOnCompletion { close() } },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** A sheet's grab handle: 40×5 at the top. */
@Composable
fun SheetHandle(color: Color = Color.White.copy(alpha = 0.22f)) {
    Box(
        Modifier
            .padding(top = 10.dp, bottom = 14.dp)
            .size(width = 40.dp, height = 5.dp)
            .clip(RoundedCornerShape(50))
            .background(color),
    )
}

private fun typeIcon(type: String) = when (type) {
    "video" -> Glyphs.VideoFeed
    "photo" -> Glyphs.PhotoFeed
    "text" -> Glyphs.Lines
    else -> Glyphs.Article
}

@Composable
private fun TypeRow(type: String, on: Boolean, enabled: Boolean, note: String?, onChange: (Boolean) -> Unit) {
    val (title, line) = Copy.TYPE_LABELS[type] ?: (type to "")
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .toggleable(value = on, enabled = enabled, role = Role.Switch, onValueChange = onChange)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(typeIcon(type), contentDescription = null, tint = if (on) AdhxColors.Accent else AdhxColors.Faint, modifier = Modifier.size(22.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.White)
            Text(note ?: line, fontSize = 13.sp, color = if (note != null) AdhxColors.Accent else AdhxColors.Faint)
        }
        AdhxSwitch(on, enabled = enabled)
    }
}
