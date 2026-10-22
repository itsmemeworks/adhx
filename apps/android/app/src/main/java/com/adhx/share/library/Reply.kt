package com.adhx.share.library

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adhx.share.net.LiveReaction
import com.adhx.share.net.PhonePost
import com.adhx.share.net.Reaction
import com.adhx.share.net.Saver
import com.adhx.share.net.WhyKind
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.Copy
import com.adhx.share.ui.SansFamily
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.KeepUpright
import com.adhx.share.ui.SquircleShape
import kotlinx.coroutines.launch
import java.time.Instant

/*
 * Answering a post someone sent you (boards 14.5–14.7). A reply is a reaction
 * on that post: it floats up when they next watch it, and shows in Channels →
 * Reactions, so it needs nothing new on the server.
 */
object Replies {
    /** "Pete replied · 2m" shows for answers from the last week. */
    const val ANSWER_FOR_MS = 7L * 86_400_000L

    /** Who sent you this post, when that's why it's here (the first reason is "sent"). */
    fun sender(post: PhonePost): Saver? {
        val lead = post.whyReasons.firstOrNull()?.takeIf { it.kind == WhyKind.SENT } ?: return null
        val username = lead.username ?: return null
        return post.savers.firstOrNull { it.username == username } ?: Saver(username = username)
    }

    /** The newest reaction from someone else in the last week, or null. */
    fun answer(reactions: List<LiveReaction>, nowMs: Long = System.currentTimeMillis()): LiveReaction? =
        reactions.lastOrNull { r ->
            val who = r.who ?: return@lastOrNull false
            if (who.isYou) return@lastOrNull false
            val at = r.at?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: return@lastOrNull false
            nowMs - at < ANSWER_FOR_MS
        }

    /** "Pete replied · 2m", "Pete reacted 😂 · 2m". */
    fun line(reaction: LiveReaction, nowMs: Long = System.currentTimeMillis()): String {
        val name = reaction.who?.label ?: "Someone"
        val ago = reaction.at?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
            ?.let { " · " + Copy.shortAgo(it, nowMs) } ?: ""
        return if (reaction.emoji != null) "$name reacted ${reaction.emoji}$ago" else "$name replied$ago"
    }
}

/** "Reply", beside "Ana sent you this". */
@Composable
fun ReplyButton(onClick: () -> Unit) {
    Box(
        Modifier
            .height(40.dp)
            .clip(RoundedCornerShape(50))
            .background(AdhxColors.Accent)
            .clickable(onClickLabel = "Reply", onClick = onClick)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text("Reply", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = Color.Black)
    }
}

/** "Pete replied · 2m" over a post you sent or saved, when someone answered. */
@Composable
fun RepliedChip(reaction: LiveReaction, server: String) {
    val line = Replies.line(reaction)
    Row(
        Modifier
            .height(34.dp)
            .clip(RoundedCornerShape(50))
            .background(Color.Black.copy(alpha = 0.55f))
            .border(1.dp, AdhxColors.White.copy(alpha = 0.14f), RoundedCornerShape(50))
            .semantics(mergeDescendants = true) { contentDescription = line }
            .padding(start = 6.dp, end = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        reaction.who?.let { Avatar(it, server, 24.dp) }
        Text(line, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = AdhxColors.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** "Reply to Ana": an emoji, or a few words back. [send] says whether it went. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReplySheet(
    sender: Saver,
    server: String,
    note: String?,
    send: suspend (emoji: String?, text: String?) -> Boolean,
    onDismiss: () -> Unit,
) {
    KeepUpright()
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var words by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    val name = sender.label
    fun go(emoji: String?, text: String?) {
        if (sending) return
        sending = true
        problem = null
        scope.launch {
            if (send(emoji, text)) {
                state.hide()
                onDismiss()
            } else {
                sending = false
                problem = "Couldn’t send that. Try again."
            }
        }
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = AdhxColors.Surface,
        shape = SquircleShape.top(28.dp),
    ) {
        Column(
            Modifier.navigationBarsPadding().padding(start = 20.dp, end = 20.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Avatar(sender, server, 40.dp)
                Column {
                    Text(
                        "Reply to $name",
                        fontFamily = SerifFamily,
                        fontSize = 30.sp,
                        lineHeight = 32.sp,
                        color = AdhxColors.White,
                        modifier = Modifier.semantics { heading() },
                    )
                    Text(
                        note?.let { "They said: $it" } ?: "$name sent you this",
                        fontSize = 13.sp,
                        color = AdhxColors.Faint,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Reaction.emoji.forEach { emoji ->
                    Box(
                        Modifier
                            .size(48.dp)
                            .clip(CircleShape)
                            .background(AdhxColors.Card)
                            .clickable(enabled = !sending, onClickLabel = Reaction.names[emoji]) { go(emoji, null) }
                            .semantics { contentDescription = Reaction.names[emoji] ?: emoji },
                        contentAlignment = Alignment.Center,
                    ) { Text(emoji, fontSize = 24.sp) }
                }
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .clip(RoundedCornerShape(50))
                    .background(AdhxColors.Background)
                    .border(1.dp, if (words.isNotEmpty()) AdhxColors.Accent.copy(alpha = 0.6f) else AdhxColors.White.copy(alpha = 0.12f), RoundedCornerShape(50))
                    .padding(start = 16.dp, end = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(Modifier.weight(1f)) {
                    if (words.isEmpty()) Text("Say something back", fontSize = 16.sp, color = AdhxColors.Faint)
                    BasicTextField(
                        value = words,
                        onValueChange = { words = Reaction.clip(it) },
                        singleLine = true,
                        textStyle = TextStyle(fontFamily = SansFamily, fontSize = 16.sp, color = AdhxColors.White),
                        cursorBrush = SolidColor(AdhxColors.Accent),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                        keyboardActions = KeyboardActions(onSend = { words.trim().takeIf { it.isNotEmpty() }?.let { go(null, it) } }),
                        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Say something back" },
                    )
                }
                val canSend = !sending && words.isNotBlank()
                Box(
                    Modifier
                        .height(40.dp)
                        .clip(RoundedCornerShape(50))
                        .background(if (canSend) AdhxColors.Accent else AdhxColors.Raised)
                        .clickable(enabled = canSend, onClickLabel = "Send") { go(null, words.trim()) }
                        .padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(if (sending) "Sending…" else "Send", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = if (canSend) Color.Black else AdhxColors.Faint)
                }
            }
            if (problem != null) Text(problem!!, fontSize = 13.sp, color = AdhxColors.Warn)
            Text(
                "$name sees it on this post, and in Reactions. It floats up when they next watch it.",
                fontSize = 13.sp,
                lineHeight = 18.sp,
                color = AdhxColors.Faint,
            )
        }
    }
}
