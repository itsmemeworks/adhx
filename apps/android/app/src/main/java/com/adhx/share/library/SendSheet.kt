package com.adhx.share.library

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Telephony
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.adhx.share.feed.SheetHandle
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.PhonePost
import com.adhx.share.net.PostKind
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Glyphs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Where the send sheet hands the files. */
private enum class Target { Chat, Mail, Files, Phone, More }

/** The tiles' and track's colour on the sheet. */
private val Tile = Color(0xFF3A352D)

/**
 * Send it (the rail's Share, for videos, sounds and photos): the copy your
 * ADHX kept comes down to the phone ("Sending the video itself", with how
 * far along), then goes to an app: Chat, Mail, Files, Save to phone, or
 * More (the share sheet). A choice made while it's downloading waits for it.
 * Under them, "Or straight to your people" ([SendToPeople]) sends the post
 * itself to a member.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SendSheet(post: PhonePost, server: String, onNotice: (String) -> Unit, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var progress by remember { mutableStateOf<Float?>(null) }
    var read by remember { mutableLongStateOf(0L) }
    var total by remember { mutableStateOf<Long?>(null) }
    var ready by remember { mutableStateOf<ShareKept.Ready?>(null) }
    var pending by remember { mutableStateOf<Target?>(null) }
    var saving by remember { mutableStateOf(false) }

    fun close() {
        scope.launch { state.hide() }.invokeOnCompletion { onDismiss() }
    }

    val createFile = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(ready?.type ?: "*/*")) { uri ->
        val file = ready?.files?.firstOrNull()
        if (uri != null && file != null) {
            scope.launch {
                val ok = withContext(Dispatchers.IO) {
                    runCatching { context.contentResolver.openOutputStream(uri)?.use { out -> file.inputStream().use { it.copyTo(out) } } != null }.getOrDefault(false)
                }
                onNotice(if (ok) "Saved to Files" else "Couldn’t save it there")
                close()
            }
        }
    }

    fun go(target: Target, files: ShareKept.Ready) {
        when (target) {
            Target.Files -> createFile.launch(files.files.first().name)
            Target.More -> {
                ShareKept.send(context, files.intent())
                close()
            }
            else -> {
                launchIn(context, files, target)
                close()
            }
        }
    }

    LaunchedEffect(post.key) {
        val (got, problem) = ShareKept.prepare(context, server, post, onProgress = { progress = it }, onBytes = { r, t ->
            read = r
            total = t
        })
        if (got == null) {
            onNotice(problem ?: "Couldn’t get it from your ADHX")
            close()
        } else {
            ready = got
            pending?.let { go(it, got) }
            pending = null
        }
    }

    val pick: (Target) -> Unit = { target ->
        if (target == Target.Phone) {
            // Saving to the phone fetches into the gallery itself.
            if (!saving) {
                saving = true
                scope.launch {
                    onNotice(ShareKept.save(context, server, post))
                    saving = false
                    close()
                }
            }
        } else {
            ready?.let { go(target, it) } ?: run { pending = target }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = AdhxColors.Surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { SheetHandle(AdhxColors.Hairline) },
    ) {
        Column(
            Modifier
                .navigationBarsPadding()
                .padding(start = 16.dp, end = 16.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Sending(post, server, progress, read, total, done = ready != null)
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Label("SEND WITH")
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Choice(Glyphs.Chat, "Chat", waiting = pending == Target.Chat) { pick(Target.Chat) }
                    Choice(Glyphs.Mail, "Mail", waiting = pending == Target.Mail) { pick(Target.Mail) }
                    // One file can be saved somewhere; an album goes through More.
                    if (ShareKept.files(post, server).size == 1) {
                        Choice(Glyphs.Folder, "Files", waiting = pending == Target.Files) { pick(Target.Files) }
                    }
                    if (SaveToPhone.supported) Choice(Glyphs.Photo, "Save to phone", waiting = saving) { pick(Target.Phone) }
                    Choice(Glyphs.More, "More", waiting = pending == Target.More) { pick(Target.More) }
                }
            }
            SendToPeople(post, server, onShown = { scope.launch { state.expand() } })
        }
    }
}

/** "1080p": the short side, as video sizes are named (an upright 1080×1920 is 1080p too). */
internal fun videoQuality(width: Int?, height: Int?): String? {
    val sides = listOfNotNull(width, height).filter { it > 0 }
    return sides.minOrNull()?.let { "${it}p" }
}

/** The post, what's being sent ("1080p · 12 MB · not a link that dies next month"), and the download. */
@Composable
private fun Sending(post: PhonePost, server: String, progress: Float?, read: Long, total: Long?, done: Boolean) {
    val media = post.media.firstOrNull()
    val poster = (media?.posterUrl ?: media?.url?.takeIf { media.kind == "photo" })?.let { AdhxApi.resolve(server, it)?.toString() }
    val what = when (post.kind) {
        PostKind.VIDEO -> "Sending the video itself"
        PostKind.AUDIO -> "Sending the sound itself"
        else -> if (post.media.size > 1) "Sending the photos themselves" else "Sending the photo itself"
    }
    val quality = if (post.kind == PostKind.VIDEO) videoQuality(media?.width?.toInt(), media?.height?.toInt()) else null
    val size = total?.let(::megabytes)
    val line = listOfNotNull(quality, size, "not a link that dies next month").joinToString(" · ")
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(AdhxColors.Card)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Box(
                Modifier
                    .size(width = 54.dp, height = 96.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(AdhxColors.Placeholder),
            ) {
                if (poster != null) AsyncImage(poster, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
                Box(
                    Modifier
                        .align(Alignment.BottomStart)
                        .padding(4.dp)
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.6f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(if (post.kind == PostKind.PHOTO) Glyphs.Photo else Glyphs.Video, null, tint = Color.White, modifier = Modifier.size(12.dp))
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(what, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.White)
                Text(line, fontSize = 13.sp, lineHeight = 19.sp, color = AdhxColors.Muted)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth()) {
                val percent = progress?.let { " · ${(it * 100).toInt()}%" } ?: ""
                Text(
                    if (done) "Ready to send" else "Downloading from your ADHX$percent",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = AdhxColors.White,
                    modifier = Modifier.weight(1f),
                )
                if (total != null && !done) {
                    Text("${megabytes(read, unit = false)} of ${megabytes(total)}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.Faint)
                }
            }
            val fraction by animateFloatAsState(if (done) 1f else (progress ?: 0f), label = "send")
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Tile),
            ) {
                Box(
                    Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(fraction)
                        .clip(RoundedCornerShape(50))
                        .background(AdhxColors.Accent),
                )
            }
        }
    }
}

@Composable
private fun Label(text: String) {
    Text(text, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.7.sp, color = AdhxColors.Faint)
}

/** One way to send: a 60dp tile with its icon, and its name under it. */
@Composable
private fun Choice(icon: ImageVector, label: String, waiting: Boolean, onClick: () -> Unit) {
    Column(
        Modifier
            .width(64.dp)
            .clip(RoundedCornerShape(14.dp))
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics(mergeDescendants = true) { },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier
                .size(60.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(if (waiting) AdhxColors.Accent.copy(alpha = 0.25f) else Tile),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = AdhxColors.White, modifier = Modifier.size(24.dp))
        }
        Text(label, fontSize = 12.sp, lineHeight = 14.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.White, textAlign = TextAlign.Center)
    }
}

/** "12 MB", "9.6 MB" (or without the unit). */
internal fun megabytes(bytes: Long, unit: Boolean = true): String {
    val mb = bytes / 1_000_000.0
    val n = if (mb >= 10) "%.0f".format(mb) else "%.1f".format(mb).removeSuffix(".0")
    return if (unit) "$n MB" else n
}

/** Chat (the phone's messages app) or Mail; the share sheet when there's no such app. */
private fun launchIn(context: Context, files: ShareKept.Ready, target: Target) {
    val intent = files.intent()
    when (target) {
        Target.Chat -> Telephony.Sms.getDefaultSmsPackage(context)?.let { intent.setPackage(it) }
        Target.Mail -> intent.selector = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:"))
        else -> Unit
    }
    try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: ActivityNotFoundException) {
        ShareKept.send(context, files.intent())
    } catch (_: SecurityException) {
        ShareKept.send(context, files.intent())
    }
}
