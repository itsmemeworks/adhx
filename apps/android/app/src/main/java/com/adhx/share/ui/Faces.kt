package com.adhx.share.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.Saver

/** The colours behind people's initials: exactly the boards' five. */
private val FaceColors = listOf(
    Color(0xFFFF8FA3),
    Color(0xFF7FD1AE),
    Color(0xFFFFB35C),
    Color(0xFFC4A7FF),
    Color(0xFF6B8CFF),
)

/**
 * The same colour for the same person, on every screen and on the iPhone
 * too: the same 16-bit hash of the username as the iOS app, into the five.
 */
fun faceColor(username: String): Color {
    val hash = username.lowercase().fold(0) { acc, c -> (acc * 31 + c.code) and 0xFFFF }
    return FaceColors[hash % FaceColors.size]
}

/** The first letter of what someone's called, for the drawn face. */
fun initial(label: String): String =
    label.trim().firstOrNull { it.isLetterOrDigit() }?.uppercaseChar()?.toString() ?: "?"

/**
 * One person's face, in Gob's shape ([GobShape]): their photo (resolved
 * against [server]) over a coloured initial, which shows while it loads or
 * when there is none.
 * Decorative: say who it is on whatever holds it.
 */
@Composable
fun Avatar(
    username: String,
    label: String,
    avatarUrl: String?,
    server: String,
    size: Dp,
    modifier: Modifier = Modifier,
    ring: Color? = null,
) {
    val url = avatarUrl?.takeIf { it.isNotBlank() }?.let { AdhxApi.resolve(server, it)?.toString() }
    Box(
        modifier
            .size(size)
            .then(if (ring != null) Modifier.border(2.dp, ring, GobShape) else Modifier)
            .clip(GobShape)
            .background(faceColor(username)),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.material3.Text(
            initial(label),
            color = Color.Black,
            fontWeight = FontWeight.ExtraBold,
            fontSize = (size.value * 0.44f).sp,
            modifier = Modifier.clearAndSetSemantics { },
        )
        if (url != null) {
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
        }
    }
}

@Composable
fun Avatar(saver: Saver, server: String, size: Dp, modifier: Modifier = Modifier, ring: Color? = null) =
    Avatar(saver.username, saver.label, saver.avatarUrl, server, size, modifier, ring)

/**
 * Up to [max] overlapping faces. [onTap] makes each face a button that opens
 * that person; [description] is what a screen reader hears for the group.
 */
@Composable
fun Faces(
    savers: List<Saver>,
    server: String,
    size: Dp = 30.dp,
    max: Int = 3,
    ring: Color = Color.Black,
    description: String? = null,
    onTap: ((Saver) -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val shown = savers.take(max)
    if (shown.isEmpty()) return
    val step = size - size * OVERLAP
    Box(
        modifier
            .size(width = facesWidth(shown.size, size, max), height = size)
            .then(
                if (description != null && onTap == null) {
                    Modifier.clearAndSetSemantics { contentDescription = description }
                } else {
                    Modifier
                },
            ),
    ) {
        shown.forEachIndexed { i, saver ->
            val face = Modifier
                .offset(x = step * i)
                .then(
                    if (onTap != null) {
                        Modifier
                            .clip(GobShape)
                            .semantics { contentDescription = if (saver.isYou) "You" else saver.label }
                            .clickable(onClickLabel = Copy.openChannelOf(saver)) { onTap(saver) }
                    } else {
                        Modifier
                    },
                )
            Avatar(saver, server, size, face, ring = ring)
        }
    }
}

private const val OVERLAP = 0.32f

/** The width a [Faces] row takes, for laying text beside it. */
fun facesWidth(count: Int, size: Dp, max: Int = 3): Dp {
    val n = count.coerceAtMost(max)
    if (n <= 0) return 0.dp
    return size + (size - size * OVERLAP) * (n - 1)
}
