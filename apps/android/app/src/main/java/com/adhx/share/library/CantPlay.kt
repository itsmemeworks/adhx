package com.adhx.share.library

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.clickable
import androidx.compose.material3.Icon
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.SquircleShape
import com.adhx.share.ui.openUrl
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adhx.share.links.Networks
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.Spinner
import kotlinx.coroutines.delay

/** What kind of can't-play it is (boards 14.8 and 14.9). */
enum class Trouble {
    /** Gone from its network before your ADHX kept a copy (404 / 410). */
    GONE,

    /** The connection or the server didn't answer: Try again or Skip. */
    CANT_LOAD,
}

/** The words on a can't-play card: a title and a line. */
object CantPlay {
    /** Seconds before a gone post moves on by itself. */
    const val COUNTDOWN = 3

    /** No first frame this long, while nothing is being kept, is "can't load". */
    const val PATIENCE_MS = 15_000L

    /** What the player says when a video fails, before it knows why. */
    const val GENERIC = "This video couldn’t load."

    fun title(trouble: Trouble): String = when (trouble) {
        Trouble.GONE -> "Can’t play this one here"
        Trouble.CANT_LOAD -> "Couldn’t load this one"
    }

    /** The server's words when it said why (and they aren't the generic ones), else ours. */
    fun message(trouble: Trouble, platform: String?, words: String?): String = when (trouble) {
        Trouble.GONE -> words?.takeIf {
            it.isNotBlank() && !it.startsWith("This video couldn") && !it.startsWith("This sound couldn") &&
                !it.startsWith("This one couldn’t be downloaded yet")
        } ?: "It was taken down or made private on ${Networks.name(platform) ?: "its network"} before your ADHX could keep a copy."
        Trouble.CANT_LOAD -> "Your ADHX didn’t answer in time. It’s still saved; this is just the connection."
    }
}

/**
 * A post that can't play says why, and never just sits there (boards 14.8,
 * 14.9). Gone: why, "Open on TikTok", then the next one after
 * [CantPlay.COUNTDOWN] seconds ([onNext] is null when there's no next: no
 * countdown, no Next now). Can't load: it's the connection, Try again or Skip.
 * The buttons stay on one row.
 */
@Composable
fun CantPlayCard(
    trouble: Trouble,
    platform: String?,
    words: String?,
    /** The post on its own network, for "Open on TikTok". */
    sourceUrl: String?,
    onNext: (() -> Unit)?,
    onRetry: () -> Unit,
    /** Remove from my saves, when it's yours. */
    onRemove: (() -> Unit)?,
    removing: Boolean,
    /** Your save of it has gone: a tick instead of the button. */
    removed: Boolean,
    removeError: String?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var left by remember(trouble) { mutableIntStateOf(CantPlay.COUNTDOWN) }
    if (trouble == Trouble.GONE && onNext != null) {
        LaunchedEffect(trouble, removing) {
            while (left > 0 && !removing) {
                delay(1000)
                if (!removing) left--
            }
            if (left == 0 && !removing) onNext()
        }
    }
    val network = Networks.name(platform) ?: "the original"
    Column(
        modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
            .clip(SquircleShape(24.dp))
            .background(AdhxColors.Surface.copy(alpha = 0.92f))
            .border(1.dp, Color.White.copy(alpha = 0.1f), SquircleShape(24.dp))
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            CantPlay.title(trouble),
            fontFamily = SerifFamily,
            fontSize = 30.sp,
            lineHeight = 32.sp,
            color = AdhxColors.Ink,
            modifier = Modifier.semantics { heading() },
        )
        Text(CantPlay.message(trouble, platform, words), fontSize = 15.sp, lineHeight = 21.sp, color = AdhxColors.Ink)
        if (trouble == Trouble.GONE && !sourceUrl.isNullOrBlank()) {
            Text(
                "Open on $network",
                fontSize = 15.sp,
                fontWeight = FontWeight.ExtraBold,
                color = AdhxColors.Accent,
                modifier = Modifier
                    .clickable(onClickLabel = "Open on $network") { openUrl(context, sourceUrl) }
                    .padding(vertical = 4.dp),
            )
        }
        if (trouble == Trouble.GONE && onNext != null && left > 0 && !removing) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Spinner(size = 24.dp, stroke = 3.dp)
                Text(
                    "Playing the next one in $left",
                    fontSize = 14.sp,
                    color = AdhxColors.InkSoft,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }
        if (removeError != null) Text(removeError, fontSize = 13.sp, color = AdhxColors.Warn)
        if (removed) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Glyphs.Check, contentDescription = null, tint = AdhxColors.Good, modifier = Modifier.size(16.dp))
                Text("Removed from your saves", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Good)
            }
        }
        // One row, always (board 14.8).
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            when (trouble) {
                Trouble.GONE -> {
                    if (onNext != null) SmallPill("Next now", primary = true, onClick = onNext)
                    if (onRemove != null && !removed) {
                        SmallPill(if (removing) "Removing…" else "Remove from my saves", primary = false, enabled = !removing, onClick = onRemove)
                    }
                }
                Trouble.CANT_LOAD -> {
                    SmallPill("Try again", primary = true, onClick = onRetry)
                    if (onNext != null) SmallPill("Skip it", primary = false, onClick = onNext)
                }
            }
        }
    }
}

/** The card's one row follows its curve: 24 − 20 padding = 4, so the 8dp floor. */
private val PillShape = SquircleShape(SquircleShape.nested(24.dp, 20.dp))

/** A 44dp button for the card's one row: yellow, or outlined. */
@Composable
private fun SmallPill(text: String, primary: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        Modifier
            .height(44.dp)
            .clip(PillShape)
            .then(
                if (primary) {
                    Modifier.background(AdhxColors.Accent)
                } else {
                    Modifier.border(1.dp, AdhxColors.Ink.copy(alpha = 0.3f), PillShape)
                },
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            fontSize = 14.sp,
            fontWeight = FontWeight.ExtraBold,
            color = if (primary) Color.Black else AdhxColors.Ink,
            maxLines = 1,
        )
    }
}
