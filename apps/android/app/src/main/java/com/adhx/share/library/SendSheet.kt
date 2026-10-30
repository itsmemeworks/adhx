package com.adhx.share.library

import com.adhx.share.ui.KeepUpright
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.ClipData
import android.content.ClipboardManager
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.Icons
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.adhx.share.feed.SheetHandle
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.PhonePost
import com.adhx.share.net.PostKind
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.SquircleShape
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Where the send sheet hands the files. */
private enum class Target { WhatsApp, Files, Phone, More }

/**
 * Send it (the rail's Share, for videos, sounds and photos): the copy your
 * ADHX kept comes down to the phone ("Sending the video itself", with how
 * far along), then goes to an app: WhatsApp, Files, Save to phone, or More
 * (the share sheet). Copy copies the post's ADHX link straight away; a choice
 * that needs the file and is made while it's downloading waits for it.
 * Under them, "Or straight to your people" ([SendToPeople]) sends the post
 * itself to a member.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SendSheet(post: PhonePost, server: String, onNotice: (String) -> Unit, onDismiss: () -> Unit) {
    KeepUpright()
    // A text post or article has no file: send its words, or straight to your people.
    if (remember(post.key, server) { ShareKept.files(post, server).isEmpty() }) {
        WordsSendSheet(post, server, onNotice, onDismiss)
        return
    }
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

    // One file: Files asks where to put it, under its own name.
    val createFile = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(ready?.type ?: "*/*")) { uri ->
        val file = ready?.files?.singleOrNull()
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
    // An album: Files asks for a folder, and every photo goes into it.
    val pickFolder = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { tree ->
        val files = ready?.files.orEmpty()
        if (tree != null && files.isNotEmpty()) {
            scope.launch {
                val saved = withContext(Dispatchers.IO) { ShareKept.saveToFolder(context, tree, files) }
                onNotice(
                    when (saved) {
                        files.size -> "${files.size} photos saved to Files"
                        0 -> "Couldn’t save them there"
                        else -> "Saved $saved of ${files.size} photos. Try the rest again."
                    },
                )
                close()
            }
        }
    }

    fun go(target: Target, files: ShareKept.Ready) {
        when (target) {
            Target.Files ->
                if (files.files.size == 1) createFile.launch(files.files.first().name) else pickFolder.launch(null)
            Target.More -> {
                ShareKept.send(context, files.intent())
                close()
            }
            Target.WhatsApp -> {
                sendWithWhatsApp(context) { files.intent() }
                close()
            }
            Target.Phone -> Unit
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
        shape = SquircleShape.top(28.dp),
        dragHandle = { SheetHandle(AdhxColors.Line) },
    ) {
        Column(
            Modifier
                .navigationBarsPadding()
                .padding(start = 16.dp, end = 16.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            // The board's ×, so the sheet can be closed without knowing to swipe it.
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                Box(
                    Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(AdhxColors.Raised)
                        .clickable(onClickLabel = "Close") { close() }
                        .semantics { contentDescription = "Close" },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Close, contentDescription = null, tint = AdhxColors.Ink, modifier = Modifier.size(18.dp))
                }
            }
            Sending(post, server, progress, read, total, done = ready != null)
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Label("SEND VIA")
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Choice(Glyphs.WhatsApp, "WhatsApp", waiting = pending == Target.WhatsApp) { pick(Target.WhatsApp) }
                    Choice(Glyphs.Copy, "Copy", waiting = false) {
                        onNotice(copyLink(context, post, server))
                        close()
                    }
                    // One file is saved where you choose; an album into a folder you choose.
                    Choice(Glyphs.Folder, "Files", waiting = pending == Target.Files) { pick(Target.Files) }
                    if (SaveToPhone.supported) Choice(Glyphs.Photo, "Save to phone", waiting = saving) { pick(Target.Phone) }
                    Choice(Glyphs.More, "More", waiting = pending == Target.More) { pick(Target.More) }
                }
            }
            SendToPeople(post, server, onShown = { scope.launch { state.expand() } })
        }
    }
}

/** The send sheet for a post with no file: its words through WhatsApp or More, Copy (its ADHX link), and your people. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WordsSendSheet(post: PhonePost, server: String, onNotice: (String) -> Unit, onDismiss: () -> Unit) {
    KeepUpright()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val words = remember(post.key) { ShareKept.words(post) }

    fun close() {
        scope.launch { state.hide() }.invokeOnCompletion { onDismiss() }
    }

    fun send(target: Target) {
        if (words.isBlank()) {
            onNotice("There’s nothing to share in this one")
            return close()
        }
        val intent = { Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, words) }
        if (target == Target.WhatsApp) sendWithWhatsApp(context, intent) else ShareKept.send(context, intent())
        close()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = AdhxColors.Surface,
        shape = SquircleShape.top(28.dp),
        dragHandle = { SheetHandle(AdhxColors.Line) },
    ) {
        Column(
            Modifier
                .navigationBarsPadding()
                .padding(start = 16.dp, end = 16.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .clip(SquircleShape(22.dp))
                    .background(AdhxColors.Plate)
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    if (post.kind == PostKind.ARTICLE) "Sending the article" else "Sending the words",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = AdhxColors.Ink,
                )
                Text(words.ifBlank { "Nothing to send" }, fontSize = 13.sp, lineHeight = 19.sp, color = AdhxColors.InkSoft, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Label("SEND VIA")
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    Choice(Glyphs.WhatsApp, "WhatsApp", waiting = false) { send(Target.WhatsApp) }
                    Choice(Glyphs.Copy, "Copy", waiting = false) {
                        onNotice(copyLink(context, post, server))
                        close()
                    }
                    Choice(Glyphs.More, "More", waiting = false) { send(Target.More) }
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
            .clip(SquircleShape(22.dp))
            .background(AdhxColors.Plate)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            // Tucked into the card's corner: 22 − 14 padding = 8.
            Box(
                Modifier
                    .size(width = 54.dp, height = 96.dp)
                    .clip(SquircleShape(8.dp))
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
                Text(what, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.Ink)
                Text(line, fontSize = 13.sp, lineHeight = 19.sp, color = AdhxColors.InkSoft)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth()) {
                val percent = progress?.let { " · ${(it * 100).toInt()}%" } ?: ""
                Text(
                    if (done) "Ready to send" else "Downloading from your ADHX$percent",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = AdhxColors.Ink,
                    modifier = Modifier.weight(1f),
                )
                if (total != null && !done) {
                    Text("${megabytes(read, unit = false, scale = total)} of ${megabytes(total)}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.InkFaint)
                }
            }
            val fraction by animateFloatAsState(if (done) 1f else (progress ?: 0f), label = "send")
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(50))
                    .background(AdhxColors.PaperInkSoft),
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
    Text(text, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.7.sp, color = AdhxColors.InkFaint)
}

/** One way to send: a 60dp tile with its icon, and its name under it. */
@Composable
private fun Choice(icon: ImageVector, label: String, waiting: Boolean, onClick: () -> Unit) {
    Column(
        Modifier
            .width(64.dp)
            .clip(SquircleShape(14.dp))
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics(mergeDescendants = true) { },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier
                .size(60.dp)
                .clip(SquircleShape(18.dp))
                .background(if (waiting) AdhxColors.Accent.copy(alpha = 0.25f) else AdhxColors.PaperInkSoft),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = AdhxColors.Ink, modifier = Modifier.size(24.dp))
        }
        Text(label, fontSize = 12.sp, lineHeight = 14.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.Ink, textAlign = TextAlign.Center)
    }
}

/**
 * "12 MB", "9.6 MB", "47 KB" (or without the unit). [scale] picks the unit, so
 * "12 of 47 KB" counts in the total's unit; under a megabyte it's kilobytes.
 */
internal fun megabytes(bytes: Long, unit: Boolean = true, scale: Long = bytes): String {
    if (scale < 1_000_000) {
        val kb = maxOf(if (scale == bytes) 1L else 0L, Math.round(bytes / 1000.0))
        return if (unit) "$kb KB" else "$kb"
    }
    val mb = bytes / 1_000_000.0
    val n = if (mb >= 10) "%.0f".format(mb) else "%.1f".format(mb).removeSuffix(".0")
    return if (unit) "$n MB" else n
}

/** WhatsApp, then WhatsApp Business: the apps the WhatsApp choice tries, in order. */
internal val WHATSAPP_PACKAGES = listOf("com.whatsapp", "com.whatsapp.w4b")

/**
 * Hands [intent] (made fresh for each try) straight to WhatsApp; the share
 * sheet when it isn't on the phone.
 */
private fun sendWithWhatsApp(context: Context, intent: () -> Intent) {
    for (app in WHATSAPP_PACKAGES) {
        try {
            context.startActivity(intent().setPackage(app).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return
        } catch (_: ActivityNotFoundException) {
        } catch (_: SecurityException) {
        }
    }
    ShareKept.send(context, intent())
}

/** The post's link on your ADHX (else the original's), for Copy; null when it has neither. */
internal fun linkToCopy(post: PhonePost, server: String): String? =
    post.openPath?.takeIf { it.isNotBlank() }?.let { AdhxApi.resolve(server, it)?.toString() }
        ?: post.sourceUrl?.takeIf { it.isNotBlank() }

/** Copies [linkToCopy] and says how it went. */
private fun copyLink(context: Context, post: PhonePost, server: String): String {
    val link = linkToCopy(post, server) ?: return "There’s no link to copy for this one"
    context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Link", link))
    return "Link copied"
}
