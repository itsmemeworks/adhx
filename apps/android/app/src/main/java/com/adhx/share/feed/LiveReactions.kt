package com.adhx.share.feed

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adhx.share.net.Reaction
import com.adhx.share.net.Saver
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.Copy
import com.adhx.share.ui.GobShape
import com.adhx.share.ui.faceColor
import com.adhx.share.ui.rememberReducedMotion

/**
 * The React picker: six quick emoji, or a few words for everyone watching
 * (at most [Reaction.MAX_TEXT] characters) with Send. Tapping outside, or
 * back, closes it.
 */
@Composable
fun ReactPicker(onEmoji: (String) -> Unit, onText: (String) -> Unit, onDismiss: () -> Unit) {
    var words by rememberSaveable { mutableStateOf("") }
    BackHandler(onBack = onDismiss)
    Box(
        Modifier
            .fillMaxSize()
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClickLabel = Copy.CLOSE_REACT, onClick = onDismiss),
    ) {
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .imePadding()
                .padding(12.dp)
                .widthIn(max = 520.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(26.dp))
                .background(AdhxColors.Surface.copy(alpha = 0.94f))
                .border(1.dp, AdhxColors.White.copy(alpha = 0.1f), RoundedCornerShape(26.dp))
                // Taps on the card stay on the card.
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = {})
                .padding(12.dp)
                .semantics { contentDescription = Copy.REACT },
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = Copy.QUICK_REACTIONS },
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Reaction.emoji.forEach { emoji ->
                    Box(
                        Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(AdhxColors.Button)
                            .clickable(onClickLabel = Reaction.names[emoji]) { onEmoji(emoji) }
                            .clearAndSetSemantics {
                                contentDescription = Reaction.names[emoji]?.replaceFirstChar { it.uppercase() } ?: emoji
                                role = Role.Button
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(emoji, fontSize = 26.sp)
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                val send = {
                    val said = words.trim()
                    if (said.isNotEmpty()) {
                        onText(said)
                        words = ""
                    }
                }
                Box(
                    Modifier
                        .weight(1f)
                        .height(44.dp)
                        .clip(RoundedCornerShape(50))
                        .background(AdhxColors.Background)
                        .border(1.dp, AdhxColors.Hairline, RoundedCornerShape(50))
                        .padding(horizontal = 16.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (words.isEmpty()) {
                        Text(Copy.SAY_SOMETHING, fontSize = 15.sp, color = AdhxColors.Faint, maxLines = 1, modifier = Modifier.clearAndSetSemantics { })
                    }
                    BasicTextField(
                        value = words,
                        onValueChange = { words = it.take(Reaction.MAX_TEXT) },
                        singleLine = true,
                        textStyle = TextStyle(fontSize = 15.sp, color = AdhxColors.Cream),
                        cursorBrush = SolidColor(AdhxColors.Accent),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                        keyboardActions = KeyboardActions(onSend = { send() }),
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics { contentDescription = Copy.SAY_SOMETHING },
                    )
                }
                Box(
                    Modifier
                        .height(44.dp)
                        .clip(RoundedCornerShape(50))
                        .background(if (words.isBlank()) AdhxColors.Raised else AdhxColors.Accent)
                        .clickable(enabled = words.isNotBlank(), role = Role.Button, onClick = send)
                        .padding(horizontal = 18.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(Copy.SEND, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = if (words.isBlank()) AdhxColors.Faint else Color.Black)
                }
            }
            if (words.isNotEmpty()) {
                Text(
                    Copy.charsLeft(words.length),
                    fontSize = 12.sp,
                    color = if (words.length >= Reaction.MAX_TEXT) AdhxColors.Warn else AdhxColors.Faint,
                    modifier = Modifier.align(Alignment.End).padding(end = 6.dp),
                )
            }
        }
    }
}

/**
 * Reactions floating up the left of the screen, each with the face of who
 * sent it, fading as they go. With animations off they fade in and out in
 * place. Screen readers hear the newest. Doesn't take touches.
 */
@Composable
fun FloatingReactions(items: List<Floating>, server: String, onLanded: (Long) -> Unit, modifier: Modifier = Modifier) {
    val still = rememberReducedMotion()
    val latest = items.lastOrNull()
    BoxWithConstraints(
        modifier
            .fillMaxSize()
            .clearAndSetSemantics {
                contentDescription = latest?.let { Copy.reactionDescription(it.who?.label, it.emoji, it.text) } ?: Copy.FLOATING_LABEL
                liveRegion = LiveRegionMode.Polite
            },
    ) {
        val height = maxHeight
        val width = maxWidth
        items.forEach { item ->
            androidx.compose.runtime.key(item.id) {
                FloatingOne(item, server, height, width, still) { onLanded(item.id) }
            }
        }
    }
}

@Composable
private fun FloatingOne(item: Floating, server: String, height: Dp, width: Dp, still: Boolean, onDone: () -> Unit) {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(item.id) {
        if (item.delayMs > 0) kotlinx.coroutines.delay(item.delayMs)
        progress.animateTo(1f, tween(if (still) STILL_MS else RISE_MS, easing = LinearEasing))
        onDone()
    }
    val p = progress.value
    // Fade in over the first 12%, out over the last 35%.
    val alpha = when {
        p < 0.12f -> p / 0.12f
        p > 0.65f -> ((1f - p) / 0.35f).coerceIn(0f, 1f)
        else -> 1f
    }
    val face = (44 + (item.lane * 12)).dp
    val text = item.text
    val itemWidth = if (text != null) (width * 0.8f) else face + 24.dp
    val x = ((width - itemWidth).coerceAtLeast(0.dp)) * item.lane
    // Rising from the bottom of the space to the top; in place without motion.
    val y = if (still) height * (0.25f + 0.5f * item.lane) else (height - face) * (1f - p)
    Box(
        Modifier
            .offset(x = x, y = y)
            .graphicsLayer { this.alpha = alpha },
    ) {
        if (text != null) TextReaction(item.who, text, server, face) else EmojiReaction(item.who, item.emoji.orEmpty(), server, face)
    }
}

private const val RISE_MS = 3_600
private const val STILL_MS = 2_600

/** Their face, ringed in their colour, with a black gap between. */
@Composable
private fun RingedFace(who: Saver?, server: String, size: Dp) {
    val color = faceColor(who?.username.orEmpty())
    Box(
        Modifier
            .size(size + 10.dp)
            .border(2.dp, color, GobShape)
            .padding(2.dp)
            .border(3.dp, Color.Black, GobShape)
            .padding(3.dp),
    ) {
        Avatar(
            username = who?.username.orEmpty(),
            label = who?.label ?: "?",
            avatarUrl = who?.avatarUrl,
            server = server,
            size = size,
        )
    }
}

/** The face, with the emoji as a sticker over its bottom-right corner. */
@Composable
private fun EmojiReaction(who: Saver?, emoji: String, server: String, face: Dp) {
    Box {
        RingedFace(who, server, face)
        Text(
            emoji,
            fontSize = (face.value * 0.6f).sp,
            lineHeight = (face.value * 0.6f).sp,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .offset(x = 14.dp, y = 12.dp),
        )
    }
}

/** The face, with a speech bubble in their colour whose tail points back to it. */
@Composable
private fun TextReaction(who: Saver?, text: String, server: String, face: Dp) {
    val color = faceColor(who?.username.orEmpty())
    Row(verticalAlignment = Alignment.Bottom) {
        RingedFace(who, server, face)
        Spacer(Modifier.width(6.dp))
        // The small bottom-left corner is the tail, towards the face.
        Text(
            text,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = Color.Black,
            maxLines = 2,
            modifier = Modifier
                .padding(bottom = 18.dp)
                .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomEnd = 16.dp, bottomStart = 4.dp))
                .background(color)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        )
    }
}
