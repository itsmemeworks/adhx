package com.adhx.share.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.LastReaction
import com.adhx.share.net.PhonePost
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.SquircleShape
import com.adhx.share.ui.faceColor

/** The words of the Reactions row on Channels. */
object ReactionsCopy {
    const val TITLE = "Reactions"
    const val PLAY_ALL = "Play all"

    /** "12 posts with reactions", "30+ posts with reactions" while there are more pages. */
    fun count(count: Int, more: Boolean): String {
        val n = if (more) "$count+" else count.toString()
        return if (count == 1 && !more) "1 post with reactions" else "$n posts with reactions"
    }

    /** What the tile's face says: the emoji, else the words (their bubble says they're said). */
    fun said(last: LastReaction?): String? =
        last?.emoji?.takeIf { it.isNotBlank() } ?: last?.text?.takeIf { it.isNotBlank() }

    /** For a screen reader: who reacted how, and to what. */
    fun describe(post: PhonePost): String {
        val last = post.reactions?.last
        val who = last?.saver?.let { if (it.isYou) "You" else it.label }
        // Read aloud, words are quoted so they're heard as said.
        val what = last?.emoji?.takeIf { it.isNotBlank() } ?: last?.text?.takeIf { it.isNotBlank() }?.let { "“$it”" }
        val title = (post.article?.title?.takeIf { it.isNotBlank() } ?: post.text).trim().lineSequence().firstOrNull()?.trim().orEmpty()
        val reaction = when {
            who != null && what != null -> "$who reacted $what"
            what != null -> "Reacted $what"
            else -> null
        }
        return listOfNotNull(reaction, title.takeIf { it.isNotEmpty() }).joinToString(": ").ifEmpty { "A post with reactions" }
    }
}

/**
 * Channels → Reactions: the newest posts people reacted to, each its poster
 * with the last reaction's face and emoji, and Play all. A tap plays them in
 * the player, where their reactions float again and React works.
 */
@Composable
fun ReactionsRow(ui: ReactedUi, server: String, onPlay: (Int) -> Unit) {
    Column(Modifier.padding(bottom = 4.dp)) {
        Row(
            Modifier.padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 12.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    ReactionsCopy.TITLE,
                    fontFamily = SerifFamily,
                    fontSize = 32.sp,
                    lineHeight = 30.sp,
                    color = AdhxColors.Ink,
                    modifier = Modifier.semantics { heading() },
                )
                Text(ReactionsCopy.count(ui.count, ui.more), fontSize = 14.sp, lineHeight = 18.sp, color = AdhxColors.InkFaint)
            }
            Row(
                Modifier
                    .clip(RoundedCornerShape(50))
                    .clickable(role = Role.Button, onClick = { onPlay(0) })
                    .padding(horizontal = 6.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Glyphs.Play, contentDescription = null, tint = AdhxColors.Accent, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
                Text(ReactionsCopy.PLAY_ALL, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.Accent)
            }
        }
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            itemsIndexed(ui.items.take(MAX_TILES), key = { _, post -> post.key }) { index, post ->
                ReactedTile(post, server) { onPlay(index) }
            }
        }
    }
}

private const val MAX_TILES = 20

@Composable
private fun ReactedTile(post: PhonePost, server: String, onClick: () -> Unit) {
    val media = post.media.firstOrNull()
    val image = (media?.posterUrl ?: media?.url?.takeIf { media.kind == "photo" })?.let { AdhxApi.resolve(server, it)?.toString() }
    val last = post.reactions?.last
    val said = ReactionsCopy.said(last)
    val words = last?.emoji.isNullOrBlank() && said != null
    Box(
        Modifier
            .width(116.dp)
            .height(156.dp)
            .clip(SquircleShape(18.dp))
            .background(if (image != null) AdhxColors.Placeholder else AdhxColors.Surface)
            .clickable(onClickLabel = "Play", onClick = onClick)
            .clearAndSetSemantics { contentDescription = ReactionsCopy.describe(post) },
    ) {
        if (image != null) {
            AsyncImage(image, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            val title = (post.article?.title?.takeIf { it.isNotBlank() } ?: post.text).trim()
            Text(
                title,
                fontFamily = SerifFamily,
                fontSize = 17.sp,
                lineHeight = 19.sp,
                color = AdhxColors.Ink,
                maxLines = 5,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(10.dp),
            )
        }
        Box(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .height(70.dp)
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f)))),
        )
        Row(
            Modifier
                .align(Alignment.BottomStart)
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val who = last?.saver
            if (who != null) {
                Box {
                    Avatar(
                        who,
                        server,
                        size = 30.dp,
                        ring = faceColor(who.username),
                    )
                    if (!words && said != null) {
                        Text(said, fontSize = 17.sp, lineHeight = 17.sp, modifier = Modifier.align(Alignment.BottomEnd).offset(x = 10.dp, y = 6.dp))
                    }
                }
            } else if (said != null && !words) {
                Text(said, fontSize = 22.sp, lineHeight = 22.sp)
            }
            if (words) {
                Spacer(Modifier.width(6.dp))
                Text(
                    said.orEmpty(),
                    fontSize = 11.sp,
                    lineHeight = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}
