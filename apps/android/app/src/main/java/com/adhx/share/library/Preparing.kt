package com.adhx.share.library

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adhx.share.net.KeepStatus
import com.adhx.share.net.PhonePost
import com.adhx.share.net.StatusResponse
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.SquircleShape
import com.adhx.share.ui.rememberReducedMotion

/** The words under a save that isn't ready to play yet. */
const val GETTING_READY = "Getting it ready… it’ll be here in a moment."

/** "1 on its way" / "2 on their way". */
fun onTheirWay(count: Int): String = if (count == 1) "1 on its way" else "$count on their way"

/** True while the server is still keeping a post's copy. */
fun stillKeeping(status: String?): Boolean =
    status == KeepStatus.WAITING || status == KeepStatus.KEEPING || status == KeepStatus.RETRYING

/** A light band sweeping across, over a placeholder (none when animations are off). */
fun Modifier.shimmer(): Modifier = composed {
    if (rememberReducedMotion()) return@composed Modifier
    val sweep by rememberInfiniteTransition(label = "shimmer").animateFloat(
        initialValue = -1f,
        targetValue = 2f,
        animationSpec = infiniteRepeatable(tween(1_400, easing = LinearEasing)),
        label = "sweep",
    )
    drawWithContent {
        drawContent()
        val band = size.width * 0.6f
        val x = sweep * size.width
        drawRect(
            Brush.linearGradient(
                listOf(Color.Transparent, Color.White.copy(alpha = 0.10f), Color.Transparent),
                start = Offset(x - band, 0f),
                end = Offset(x, size.height),
            ),
        )
    }
}

/** A slow breath in and out: scale and brightness (held full when animations are off). */
fun Modifier.pulse(): Modifier = composed {
    if (rememberReducedMotion()) return@composed Modifier
    val t by rememberInfiniteTransition(label = "pulse").animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1_100, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "breath",
    )
    graphicsLayer {
        val s = 0.97f + 0.03f * t
        scaleX = s
        scaleY = s
        alpha = 0.75f + 0.25f * t
    }
}

/** A poster-shaped (9:16) placeholder that shimmers and breathes. */
@Composable
fun PosterSkeleton(width: Dp, modifier: Modifier = Modifier, corner: Dp = 18.dp) {
    Box(
        modifier
            .pulse()
            .width(width)
            .aspectRatio(9f / 16f)
            .clip(SquircleShape(corner))
            .background(AdhxColors.Placeholder)
            .shimmer(),
    )
}

/**
 * A save that's on its way: the shimmering poster, [GETTING_READY], and
 * either how many are coming ([count]) or the post itself ([post]) with a
 * progress ring from its keep [status].
 */
@Composable
fun PreparingCard(
    modifier: Modifier = Modifier,
    count: Int? = null,
    post: PhonePost? = null,
    status: StatusResponse? = null,
    ring: Boolean = false,
) {
    Column(
        modifier.padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            PosterSkeleton(width = 168.dp)
            if (ring) ProgressRing(status)
        }
        Text(
            GETTING_READY,
            fontFamily = SerifFamily,
            fontSize = 24.sp,
            lineHeight = 29.sp,
            color = AdhxColors.Ink,
            textAlign = TextAlign.Center,
        )
        if (count != null && count > 0) {
            Text(onTheirWay(count), fontSize = 14.sp, fontWeight = FontWeight.Bold, color = AdhxColors.InkFaint)
        }
        if (post != null) {
            Copy.handle(post.author.handle)?.let {
                Text(it, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Ink)
            }
            post.text.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    color = AdhxColors.InkSoft,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** How far the copy is: filling when the server says, turning when it doesn't. */
@Composable
private fun ProgressRing(status: StatusResponse?) {
    val percent = status?.percent?.takeIf { status.status == KeepStatus.KEEPING }
    Box(
        Modifier
            .size(64.dp)
            .clip(RoundedCornerShape(32.dp))
            .background(Color.Black.copy(alpha = 0.45f)),
        contentAlignment = Alignment.Center,
    ) {
        if (percent != null) {
            val fraction by animateFloatAsState((percent / 100f).coerceIn(0f, 1f), label = "ring")
            CircularProgressIndicator(
                progress = { fraction },
                modifier = Modifier.size(44.dp),
                color = AdhxColors.Accent,
                trackColor = AdhxColors.Ink.copy(alpha = 0.18f),
                strokeWidth = 4.dp,
            )
            Text("$percent%", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Ink)
        } else {
            CircularProgressIndicator(
                modifier = Modifier.size(44.dp),
                color = AdhxColors.Accent,
                trackColor = AdhxColors.Ink.copy(alpha = 0.18f),
                strokeWidth = 4.dp,
            )
        }
    }
}

/** In the top bar over the player: a tiny breathing poster and "2 on their way". */
@Composable
fun OnTheirWayPill(count: Int, modifier: Modifier = Modifier) {
    Row(
        modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Color.Black.copy(alpha = 0.45f))
            .padding(start = 8.dp, end = 12.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PosterSkeleton(width = 12.dp, corner = 3.dp)
        Spacer(Modifier.width(8.dp))
        Text(onTheirWay(count), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Ink)
    }
}
