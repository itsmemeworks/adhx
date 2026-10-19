package com.adhx.share.feed

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
fun FeedFilterSheet(types: Set<String>, mode: String, onApply: (Set<String>, String) -> Unit) {
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
        dragHandle = { BottomSheetDefaults.DragHandle(color = AdhxColors.Hairline) },
    ) {
        Column(
            Modifier
                .navigationBarsPadding()
                .padding(start = 20.dp, end = 20.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                Copy.FILTER_TITLE,
                fontFamily = SerifFamily,
                fontSize = 36.sp,
                lineHeight = 38.sp,
                color = AdhxColors.White,
                modifier = Modifier.semantics { heading() },
            )
            Text(Copy.FILTER_NOTE, fontSize = 14.sp, lineHeight = 20.sp, color = AdhxColors.Faint)
            Column {
                MediaType.all.forEach { type ->
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
                }
            }
            Text(Copy.WHOSE_SAVES, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.Muted)
            Segmented(
                options = Copy.WHOSE,
                selected = whoseIndex(whose),
                onSelect = { whose = WHOSE_MODES[it] },
                background = AdhxColors.Background,
                modifier = Modifier.fillMaxWidth(),
            )
            PrimaryButton(
                Copy.DONE,
                onClick = { scope.launch { state.hide() }.invokeOnCompletion { close() } },
                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
            )
        }
    }
}

@Composable
private fun TypeRow(type: String, on: Boolean, enabled: Boolean, note: String?, onChange: (Boolean) -> Unit) {
    val (title, line) = Copy.TYPE_LABELS[type] ?: (type to "")
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(RoundedCornerShape(14.dp))
            .toggleable(value = on, enabled = enabled, role = Role.Switch, onValueChange = onChange)
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.White)
            Text(note ?: line, fontSize = 13.sp, color = if (note != null) AdhxColors.Accent else AdhxColors.Faint)
        }
        Switch(
            checked = on,
            onCheckedChange = null,
            enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedThumbColor = AdhxColors.Black,
                checkedTrackColor = AdhxColors.Accent,
                checkedBorderColor = AdhxColors.Accent,
                uncheckedThumbColor = AdhxColors.Cream,
                uncheckedTrackColor = Color(0xFF4A453E),
                uncheckedBorderColor = Color(0xFF4A453E),
                disabledCheckedThumbColor = AdhxColors.Black,
                disabledCheckedTrackColor = AdhxColors.Accent.copy(alpha = 0.55f),
                disabledCheckedBorderColor = AdhxColors.Accent.copy(alpha = 0.55f),
            ),
        )
    }
}
