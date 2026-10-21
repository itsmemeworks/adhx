package com.adhx.share.main

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adhx.share.data.Connection
import com.adhx.share.feed.SheetHandle
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.Invite
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.KeepUpright
import com.adhx.share.ui.PrimaryButton
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.Spinner
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant

/** The words of Invite someone. */
object InviteCopy {
    const val TITLE = "Invite someone"
    const val NOTE = "Anyone with this link can ask to join. Nobody gets in until you say yes."
    const val MAKE = "Make a link and share it"
    const val YOUR_LINKS = "YOUR INVITE LINKS"
    const val NONE = "No invite links waiting."
    const val SHARE = "Share again"
    const val SHARE_NOTE = "Share again makes a fresh link; the one you sent before stops working."
    const val REVOKE = "Revoke"
    const val CANT_LOAD = "Your invite links didn’t load."
    const val FAILED = "Couldn’t make a link just now. Try again."
    const val REVOKE_FAILED = "Couldn’t revoke that link. Try again."
    const val ADMIN_ONLY = "Only the admin can make invites here."
    const val OLD_SERVER = "This ADHX can’t make invites from the phone yet."
    const val OFFLINE = "Can’t reach your ADHX right now."

    /** What goes in the share sheet with the link. */
    fun shareText(url: String): String = "Come and join my ADHX: $url"

    const val TOO_MANY = "You have as many invites waiting as you can. Revoke one first."
    const val BUSY = "That’s a lot of invites. Try again in a bit."
    const val GONE = "That invite doesn’t work any more."

    fun createError(status: Int, message: String?, code: String? = null): String = when {
        code == "not_allowed" || status == 403 -> message?.takeIf { it.isNotBlank() } ?: ADMIN_ONLY
        code == "too_many" || status == 409 -> message?.takeIf { it.isNotBlank() } ?: TOO_MANY
        code == "busy" || status == 429 -> message?.takeIf { it.isNotBlank() } ?: BUSY
        status == 404 || status == 405 -> OLD_SERVER
        else -> message?.takeIf { it.isNotBlank() } ?: FAILED
    }

    /** What a link row is called: who it's for, else its code. */
    fun title(invite: Invite): String =
        invite.nameHint?.trim()?.takeIf { it.isNotEmpty() }?.let { "For $it" }
            ?: invite.code?.trim()?.takeIf { it.isNotEmpty() }?.let { "Invite $it" }
            ?: "Invite link"

    /** "Made 2 h ago · ends in 6 days · used once". */
    fun line(invite: Invite, now: Instant): String = listOfNotNull(
        made(parse(invite.createdAt), now),
        ends(parse(invite.expiresAt), now),
        uses(invite.uses),
    ).joinToString(" · ")

    fun made(at: Instant?, now: Instant): String? {
        at ?: return null
        val minutes = Duration.between(at, now).toMinutes().coerceAtLeast(0)
        return when {
            minutes < 1 -> "Made just now"
            minutes < 60 -> "Made $minutes min ago"
            minutes < 60 * 24 -> "Made ${minutes / 60} h ago"
            minutes < 60 * 48 -> "Made yesterday"
            else -> "Made ${minutes / (60 * 24)} days ago"
        }
    }

    fun ends(at: Instant?, now: Instant): String? {
        at ?: return null
        val minutes = Duration.between(now, at).toMinutes()
        return when {
            minutes <= 0 -> "ended"
            minutes < 60 -> "ends in $minutes min"
            minutes < 60 * 24 -> "ends in ${minutes / 60} h"
            minutes < 60 * 48 -> "ends tomorrow"
            else -> "ends in ${minutes / (60 * 24)} days"
        }
    }

    fun uses(count: Int): String? = when {
        count <= 0 -> null
        count == 1 -> "used once"
        else -> "used $count times"
    }

    private fun parse(text: String?): Instant? = try {
        text?.let(Instant::parse)
    } catch (e: Exception) {
        null
    }
}

/** Hand [url] to the system share sheet. */
fun shareInvite(context: Context, url: String) {
    val send = Intent(Intent.ACTION_SEND)
        .setType("text/plain")
        .putExtra(Intent.EXTRA_SUBJECT, InviteCopy.TITLE)
        .putExtra(Intent.EXTRA_TEXT, InviteCopy.shareText(url))
    context.startActivity(Intent.createChooser(send, InviteCopy.TITLE))
}

/**
 * Invite someone, without the website: make a link and share it with the
 * phone's share sheet, and your links that still work, each with Revoke
 * (`/api/app/invites`).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InviteSheet(connection: Connection, onClose: () -> Unit) {
    KeepUpright()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val invites = remember { mutableStateListOf<Invite>() }
    var loading by remember { mutableStateOf(true) }
    var making by remember { mutableStateOf(false) }
    var revoking by remember { mutableStateOf<Set<String>>(emptySet()) }
    var error by remember { mutableStateOf<String?>(null) }
    var listError by remember { mutableStateOf<String?>(null) }
    var canInvite by remember { mutableStateOf(true) }
    val api = remember(connection) { AdhxApi(connection) }

    suspend fun reload() {
        when (val result = api.invites()) {
            is ApiResult.Ok -> {
                invites.clear()
                invites.addAll(result.value.invites)
                listError = null
                canInvite = result.value.canInvite != false
            }
            is ApiResult.Failed -> listError = if (result.status == 404 || result.status == 405) null else result.message ?: InviteCopy.CANT_LOAD
            ApiResult.Offline -> listError = InviteCopy.OFFLINE
        }
        loading = false
    }
    LaunchedEffect(connection.key) { reload() }

    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = state,
        containerColor = AdhxColors.Surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { SheetHandle(AdhxColors.Hairline) },
    ) {
        Column(
            Modifier
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(start = 20.dp, end = 20.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                InviteCopy.TITLE,
                fontFamily = SerifFamily,
                fontSize = 32.sp,
                lineHeight = 32.sp,
                color = AdhxColors.White,
                modifier = Modifier.semantics { heading() },
            )
            Text(InviteCopy.NOTE, fontSize = 15.sp, lineHeight = 21.sp, color = AdhxColors.Muted)
            if (canInvite) {
                PrimaryButton(
                    if (making) "Making a link…" else InviteCopy.MAKE,
                    enabled = !making,
                    onClick = {
                        making = true
                        error = null
                        scope.launch {
                            when (val result = api.createInvite()) {
                                is ApiResult.Ok -> {
                                    val made = result.value
                                    if (made.url.isNotBlank()) shareInvite(context, made.url)
                                    reload()
                                    if (invites.none { it.id == made.id }) {
                                        invites.add(0, Invite(id = made.id, createdAt = Instant.now().toString(), expiresAt = made.expiresAt))
                                    }
                                }
                                is ApiResult.Failed -> {
                                    if (result.code == "not_allowed") canInvite = false
                                    error = InviteCopy.createError(result.status, result.message, result.code)
                                }
                                ApiResult.Offline -> error = InviteCopy.OFFLINE
                            }
                            making = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                Text(InviteCopy.ADMIN_ONLY, fontSize = 14.sp, lineHeight = 19.sp, color = AdhxColors.Faint)
            }
            error?.let { Text(it, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Warn) }

            Text(
                InviteCopy.YOUR_LINKS,
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 0.8.sp,
                color = AdhxColors.Faint,
                modifier = Modifier.padding(top = 6.dp),
            )
            when {
                loading -> Box(Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.Center) { Spinner(size = 24.dp, stroke = 2.5.dp) }
                listError != null -> Text(listError.orEmpty(), fontSize = 14.sp, color = AdhxColors.Faint)
                invites.isEmpty() -> Text(InviteCopy.NONE, fontSize = 14.sp, color = AdhxColors.Faint)
                else -> Column(
                    Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(AdhxColors.Card),
                ) {
                    val now = Instant.now()
                    invites.forEachIndexed { i, invite ->
                        if (i > 0) HorizontalDivider(thickness = 1.dp, color = Color.White.copy(alpha = 0.06f))
                        InviteRow(
                            invite = invite,
                            line = InviteCopy.line(invite, now),
                            busy = invite.id in revoking,
                            onShare = {
                                // The list never has the links (only their hashes are kept): make a fresh one.
                                revoking = revoking + invite.id
                                error = null
                                scope.launch {
                                    when (val result = api.renewInvite(invite.id)) {
                                        is ApiResult.Ok -> {
                                            if (result.value.url.isNotBlank()) shareInvite(context, result.value.url)
                                            val i = invites.indexOfFirst { it.id == invite.id }
                                            if (i >= 0) invites[i] = invites[i].copy(expiresAt = result.value.expiresAt ?: invites[i].expiresAt)
                                        }
                                        is ApiResult.Failed -> if (result.status == 404) {
                                            invites.removeAll { it.id == invite.id }
                                            error = InviteCopy.GONE
                                        } else {
                                            error = InviteCopy.createError(result.status, result.message, result.code)
                                        }
                                        ApiResult.Offline -> error = InviteCopy.OFFLINE
                                    }
                                    revoking = revoking - invite.id
                                }
                            },
                            onRevoke = {
                                revoking = revoking + invite.id
                                error = null
                                scope.launch {
                                    when (val result = api.revokeInvite(invite.id)) {
                                        is ApiResult.Ok -> invites.removeAll { it.id == invite.id }
                                        is ApiResult.Failed -> if (result.status == 404) {
                                            invites.removeAll { it.id == invite.id }
                                        } else {
                                            error = result.message?.takeIf { it.isNotBlank() } ?: InviteCopy.REVOKE_FAILED
                                        }
                                        ApiResult.Offline -> error = InviteCopy.OFFLINE
                                    }
                                    revoking = revoking - invite.id
                                }
                            },
                        )
                    }
                }
            }
            if (invites.isNotEmpty()) Text(InviteCopy.SHARE_NOTE, fontSize = 12.sp, lineHeight = 16.sp, color = AdhxColors.Faint)
        }
    }
}

@Composable
private fun InviteRow(invite: Invite, line: String, busy: Boolean, onShare: () -> Unit, onRevoke: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 60.dp)
            .padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Glyphs.Link, contentDescription = null, tint = AdhxColors.Accent, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                InviteCopy.title(invite),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = AdhxColors.Cream,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (line.isNotEmpty()) Text(line, fontSize = 12.sp, lineHeight = 16.sp, color = AdhxColors.Faint, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (busy) {
            Spinner(size = 18.dp)
            Spacer(Modifier.width(12.dp))
        } else {
            SmallAction(InviteCopy.SHARE, AdhxColors.Accent, onShare)
            SmallAction(InviteCopy.REVOKE, AdhxColors.Warn, onRevoke)
        }
    }
}

@Composable
private fun SmallAction(text: String, color: Color, onClick: () -> Unit) {
    Box(
        Modifier
            .height(36.dp)
            .clip(RoundedCornerShape(50))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = color, maxLines = 1)
    }
}
