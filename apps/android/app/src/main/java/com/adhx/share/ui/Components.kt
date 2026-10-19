package com.adhx.share.ui

import androidx.compose.foundation.BorderStroke
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
