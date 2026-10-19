package com.adhx.share.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adhx.share.R
import com.adhx.share.links.Networks

/** Gob, the ADHX mark (res/drawable/ic_gob.xml, from src/components/next/Gob.tsx). */
@Composable
fun AdhxMark(size: Dp = 30.dp) {
    Image(
        painter = painterResource(R.drawable.ic_gob),
        contentDescription = null,
        modifier = Modifier.size(size),
    )
}

/** Mark and "adhx" wordmark, as at the top of each screen. */
@Composable
fun AdhxBrand(markSize: Dp = 30.dp, modifier: Modifier = Modifier) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        AdhxMark(markSize)
        Spacer(Modifier.width(10.dp))
        Text(
            "adhx",
            fontFamily = SerifFamily,
            fontSize = (markSize.value * 0.88f).sp,
            lineHeight = (markSize.value * 0.88f).sp,
            color = AdhxColors.White,
        )
    }
}

/** A network's mark (from simple-icons), white unless told otherwise. */
@Composable
fun NetworkMark(platform: String?, size: Dp = 16.dp, tint: Color = AdhxColors.White) {
    Icon(
        painter = painterResource(Networks.icon(platform)),
        contentDescription = Networks.name(platform),
        tint = tint,
        modifier = Modifier.size(size),
    )
}

/** The yellow pill button. */
@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.defaultMinSize(minHeight = 52.dp),
        shape = RoundedCornerShape(26.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = AdhxColors.Accent,
            contentColor = AdhxColors.Black,
            disabledContainerColor = AdhxColors.Raised,
            disabledContentColor = AdhxColors.Faint,
        ),
        contentPadding = PaddingValues(horizontal = 20.dp),
    ) {
        Text(text, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
    }
}

/** The cream outline pill button. */
@Composable
fun OutlineButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    color: Color = AdhxColors.Cream,
    minHeight: Dp = 52.dp,
    enabled: Boolean = true,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.defaultMinSize(minHeight = minHeight),
        shape = RoundedCornerShape(minHeight / 2),
        border = BorderStroke(1.5.dp, if (enabled) color else AdhxColors.Hairline),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = color,
            disabledContentColor = AdhxColors.Faint,
        ),
        contentPadding = PaddingValues(horizontal = 20.dp),
    ) {
        Text(text, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
    }
}

/** The small yellow-on-hairline spinner. */
@Composable
fun Spinner(size: Dp = 14.dp, stroke: Dp = 2.dp, track: Color = AdhxColors.Hairline) {
    CircularProgressIndicator(
        modifier = Modifier.size(size),
        color = AdhxColors.Accent,
        trackColor = track,
        strokeWidth = stroke,
    )
}

/** A rounded grey bar standing in for text that hasn't arrived yet. */
@Composable
fun SkeletonBar(height: Dp, modifier: Modifier = Modifier) {
    Box(
        modifier
            .height(height)
            .clip(RoundedCornerShape(height / 2))
            .background(AdhxColors.Placeholder),
    )
}

/**
 * A pill-shaped row of choices (New · Channels · Live, Everyone's saves ·
 * Mine). The chosen one is cream with black words. [fill] spreads them over
 * the whole width; otherwise they hug their words. Read out as tabs.
 */
@Composable
fun Segmented(
    options: List<String>,
    selected: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier,
    fill: Boolean = true,
    background: Color = AdhxColors.Surface,
    height: Dp = 44.dp,
    dotAt: Int? = null,
    fontSize: Int = 15,
) {
    Row(
        modifier
            .clip(RoundedCornerShape(50))
            .background(background)
            .padding(4.dp)
            .selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        options.forEachIndexed { i, label ->
            val on = i == selected
            Row(
                (if (fill) Modifier.weight(1f) else Modifier)
                    .height(height)
                    .clip(RoundedCornerShape(50))
                    .background(if (on) AdhxColors.Cream else Color.Transparent)
                    .selectable(selected = on, role = Role.Tab, onClick = { onSelect(i) })
                    .padding(horizontal = if (fill) 4.dp else 18.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (dotAt == i) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(AdhxColors.Live))
                    Spacer(Modifier.width(7.dp))
                }
                Text(
                    label,
                    fontSize = fontSize.sp,
                    fontWeight = if (on) FontWeight.ExtraBold else FontWeight.SemiBold,
                    color = if (on) AdhxColors.Black else AdhxColors.Cream,
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
    }
}

/**
 * "Just for me": a lock in a circle (yellow when on), the title and a line,
 * and a switch. The whole row toggles; [busy] shows while the server is asked.
 */
@Composable
fun JustForMeRow(
    on: Boolean,
    onChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    busy: Boolean = false,
    enabled: Boolean = true,
) {
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(14.dp))
            .toggleable(value = on, enabled = enabled, role = Role.Switch, onValueChange = onChange)
            .semantics(mergeDescendants = true) { stateDescription = if (on) Copy.JUST_FOR_ME_ON else Copy.SHARED_STATE },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(if (on) AdhxColors.Accent else AdhxColors.Raised),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Lock, contentDescription = null, tint = if (on) AdhxColors.Black else AdhxColors.Muted, modifier = Modifier.size(18.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(Copy.JUST_FOR_ME, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.White)
            Text(if (on) Copy.JUST_FOR_ME_ON else Copy.JUST_FOR_ME_OFF, fontSize = 13.sp, color = AdhxColors.Faint)
        }
        if (busy) {
            Spinner(size = 20.dp, stroke = 2.dp)
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
            ),
        )
    }
}

/** The boards' switch: 48×28, yellow with a black knob when on, dark with a cream knob when off. */
@Composable
fun AdhxSwitch(on: Boolean, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val x by androidx.compose.animation.core.animateDpAsState(if (on) 23.dp else 3.dp, label = "knob")
    Box(
        modifier
            .size(width = 48.dp, height = 28.dp)
            .clip(CircleShape)
            .background(if (on) AdhxColors.Accent.copy(alpha = if (enabled) 1f else 0.55f) else AdhxColors.Hairline),
    ) {
        Box(
            Modifier
                .padding(start = x, top = 3.dp)
                .size(22.dp)
                .clip(CircleShape)
                .background(if (on) AdhxColors.Black else AdhxColors.Cream),
        )
    }
}

/** The small lock on a "Just for me" save. */
@Composable
fun PrivateLock(size: Dp = 14.dp, tint: Color = AdhxColors.Cream, modifier: Modifier = Modifier) {
    Icon(
        Icons.Filled.Lock,
        contentDescription = Copy.PRIVATE_LABEL,
        tint = tint,
        modifier = modifier.size(size),
    )
}
