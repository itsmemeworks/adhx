package com.adhx.share.library

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adhx.share.data.ConnectionStore
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.PhonePost
import com.adhx.share.net.SendPerson
import com.adhx.share.net.SendResult
import com.adhx.share.net.SendTargets
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.Spinner
import kotlinx.coroutines.launch

/** Where each face in the row stands: whether they have it, whether it's gone to them, whether it's going. */
internal data class SendRow(
    val sendable: Boolean = true,
    val people: List<SendPerson> = emptyList(),
    val sending: String? = null,
    val problem: String? = null,
) {
    /** "Jo already has it." for the ones who have it (and weren't sent it by you). */
    val alreadyLine: String? get() = Copy.alreadyHave(people.filter { it.has && !it.sent }.map { it.label })

    /** Whether there's anything to show: faces, or the private save's line. */
    val shown: Boolean get() = !sendable || people.isNotEmpty()

    /** The row after a send: the ones it went to are sent; skips say why. */
    fun after(result: SendResult): SendRow {
        val skipped = result.skipped.associate { it.username to it.reason }
        return copy(
            sending = null,
            problem = null,
            people = people.map { p ->
                when {
                    p.username in result.sent -> p.copy(sent = true)
                    skipped[p.username] == "has" -> p.copy(has = true)
                    skipped[p.username] == "sent" -> p.copy(sent = true)
                    else -> p
                }
            },
        )
    }

    companion object {
        fun of(targets: SendTargets) = SendRow(sendable = targets.sendable, people = if (targets.sendable) targets.people else emptyList())
    }
}

/**
 * "Or straight to your people" (board j4-4): a face for each member, a tap
 * sends them the post (`POST /api/app/send`) and leaves a tick. Someone who
 * already has it is dimmed ("Jo already has it."). Your own private save
 * can't be sent ("Just for you. Share it first to send it."). Nothing shows
 * on a server without the route, or for a post you can't see.
 */
@Composable
fun SendToPeople(post: PhonePost, server: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var row by remember(post.key) { mutableStateOf<SendRow?>(null) }

    LaunchedEffect(post.key) {
        val connection = ConnectionStore.get(context).current() ?: return@LaunchedEffect
        val result = AdhxApi(connection).sendTargets(post.platform, post.id)
        if (result is ApiResult.Ok) row = SendRow.of(result.value)
    }

    val now = row ?: return
    if (!now.shown) return

    val send: (SendPerson) -> Unit = send@{ person ->
        if (person.has || person.sent || now.sending != null) return@send
        val connection = ConnectionStore.get(context).current() ?: return@send
        row = now.copy(sending = person.username, problem = null)
        scope.launch {
            val result = AdhxApi(connection).sendTo(post.platform, post.id, listOf(person.username))
            val current = row ?: return@launch
            row = when (result) {
                is ApiResult.Ok -> current.after(result.value)
                is ApiResult.Failed -> current.copy(sending = null, problem = result.message?.takeIf { it.isNotBlank() } ?: Copy.SEND_FAILED)
                ApiResult.Offline -> current.copy(sending = null, problem = Copy.SEND_FAILED)
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(Copy.STRAIGHT_TO_PEOPLE, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.7.sp, color = AdhxColors.Faint)
        if (!now.sendable) {
            Text(Copy.SEND_PRIVATE, fontSize = 14.sp, lineHeight = 20.sp, color = AdhxColors.Muted)
            return@Column
        }
        val already = now.alreadyLine
        // Four faces and the line fit across, as on the board; more scroll, with the line under them.
        if (now.people.size <= FACES_ACROSS) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.CenterVertically) {
                now.people.forEach { SendFace(it, server, sending = now.sending == it.username) { send(it) } }
                if (already != null) {
                    Text(already, fontSize = 12.sp, lineHeight = 17.sp, color = AdhxColors.Faint, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
                }
            }
        } else {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                now.people.forEach { SendFace(it, server, sending = now.sending == it.username) { send(it) } }
            }
            if (already != null) Text(already, fontSize = 12.sp, lineHeight = 17.sp, color = AdhxColors.Faint)
        }
        now.problem?.let { Text(it, fontSize = 13.sp, color = AdhxColors.Warn) }
    }
}

private const val FACES_ACROSS = 4

/** One person: their 52dp face and name. Dimmed when they have it; a tick once it's gone to them. */
@Composable
private fun SendFace(person: SendPerson, server: String, sending: Boolean, onClick: () -> Unit) {
    val enabled = !person.has && !person.sent && !sending
    Column(
        Modifier
            .width(56.dp)
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(14.dp))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) {
                contentDescription = Copy.sendTo(person.label, person.has, person.sent)
                role = Role.Button
                if (!enabled) disabled()
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(52.dp).alpha(if (person.has && !person.sent) DIMMED else 1f)) {
            Avatar(person.username, person.label, person.avatarUrl, server, size = 52.dp)
            when {
                sending -> Box(Modifier.size(52.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.35f)), contentAlignment = Alignment.Center) {
                    Spinner(size = 18.dp, stroke = 2.dp)
                }
                person.sent -> Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .offset(x = 4.dp, y = 4.dp)
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(AdhxColors.Surface)
                        .padding(2.dp)
                        .clip(CircleShape)
                        .background(AdhxColors.Accent),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Glyphs.Check, contentDescription = null, tint = Color.Black, modifier = Modifier.size(11.dp))
                }
            }
        }
        Text(
            person.label,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = AdhxColors.White.copy(alpha = if (person.has && !person.sent) DIMMED else 1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}

private const val DIMMED = 0.4f
