package com.adhx.share.library

import com.adhx.share.ui.KeepUpright
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import coil3.compose.AsyncImage
import com.adhx.share.R
import com.adhx.share.feed.Privacy
import com.adhx.share.links.Networks
import com.adhx.share.net.ApiResult
import com.adhx.share.ui.JustForMeRow
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.PhonePost
import com.adhx.share.net.PostKind
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.NetworkMark
import com.adhx.share.ui.SquircleShape
import com.adhx.share.ui.openUrl
import kotlinx.coroutines.launch

/**
 * More: the post at a glance, "Just for me" (on your own saves), then Share the video (the kept file, not the
 * link), Copy link, Copy the words, Share an ADHX link (for people on the
 * same server).
 */
/**
 * The player's own switches, which live in More so the column on the right
 * stays as on the boards: Sound (null for photos and words), Fit video (videos
 * only), Repeat (null for words), Dock (the small window; null when it
 * can't) and Hide. Sound and Fit video are remembered.
 */
class PlayerControls(
    val muted: Boolean?,
    val onToggleMute: () -> Unit,
    val fit: Boolean?,
    val onToggleFit: () -> Unit,
    val repeat: Boolean?,
    val onToggleRepeat: () -> Unit,
    val onPip: (() -> Unit)?,
    val onHide: () -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MoreSheet(
    post: PhonePost,
    server: String,
    onNotice: (String) -> Unit,
    onDismiss: () -> Unit,
    controls: PlayerControls? = null,
    /** Save to phone, moved here from the rail: the video, sound or photos. */
    onSaveToPhone: (() -> Unit)? = null,
) {
    KeepUpright()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var fetching by remember { mutableStateOf(false) }
    val network = Networks.name(post.platform) ?: "the web"
    val media = post.media.firstOrNull()
    val source = post.sourceUrl?.takeIf { it.isNotBlank() }
    val words = (post.article?.title?.takeIf { it.isNotBlank() } ?: post.text).trim()

    fun close() {
        scope.launch { state.hide() }.invokeOnCompletion { onDismiss() }
    }

    fun copy(label: String, text: String, notice: String) {
        context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText(label, text))
        onNotice(notice)
        close()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = AdhxColors.Surface,
        shape = SquircleShape.top(28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(color = AdhxColors.Line) },
    ) {
        Column(
            Modifier
                .navigationBarsPadding()
                .padding(start = 20.dp, end = 20.dp, bottom = 16.dp),
        ) {
            Header(post, server, network, onClose = { close() })
            Spacer(Modifier.height(12.dp))
            if (onSaveToPhone != null) {
                MoreRow(
                    icon = rememberVectorPainter(Glyphs.Download),
                    title = "Save to your phone",
                    subtitle = when (post.kind) {
                        PostKind.PHOTO -> "Keeps the photos in your gallery"
                        PostKind.AUDIO -> "Keeps the sound on your phone"
                        else -> "Keeps the video in your gallery"
                    },
                    onClick = {
                        onSaveToPhone()
                        close()
                    },
                )
            }
            if (controls != null) {
                controls.muted?.let { muted ->
                    MoreRow(
                        icon = painterResource(if (muted) R.drawable.ic_sound_on else R.drawable.ic_sound_off),
                        title = if (muted) "Sound on" else "Sound off",
                        subtitle = if (muted) "Every video plays with sound until you turn it off" else "Every video plays without sound",
                        onClick = {
                            controls.onToggleMute()
                            close()
                        },
                    )
                }
                controls.fit?.let { fit ->
                    MoreRow(
                        icon = painterResource(R.drawable.ic_fit_video),
                        title = if (fit) "Fill the screen" else "Fit video",
                        subtitle = if (fit) "Videos cover the whole screen" else "The whole video at its own shape",
                        onClick = {
                            controls.onToggleFit()
                            close()
                        },
                    )
                }
                controls.repeat?.let { repeat ->
                    MoreRow(
                        icon = painterResource(R.drawable.ic_repeat_one),
                        title = if (repeat) "Repeat off" else "Repeat this one",
                        subtitle = if (repeat) "Plays the next save when this ends" else "Loops until you swipe",
                        onClick = {
                            controls.onToggleRepeat()
                            close()
                        },
                    )
                }
                controls.onPip?.let { pip ->
                    MoreRow(
                        icon = painterResource(R.drawable.ic_pip),
                        title = "Dock",
                        subtitle = "Keeps playing in a small window over your other apps",
                        onClick = {
                            close()
                            pip()
                        },
                    )
                }
                MoreRow(
                    icon = painterResource(R.drawable.ic_hide_overlay),
                    title = "Hide controls",
                    subtitle = "Or hold the post. A tap brings them back",
                    onClick = {
                        controls.onHide()
                        close()
                    },
                )
            }
            if (source != null) {
                MoreRow(
                    icon = painterResource(Networks.icon(post.platform)),
                    title = "Open on $network",
                    subtitle = "The original post",
                    onClick = {
                        openUrl(context, source)
                        close()
                    },
                )
            }
            if (post.yours) {
                var switching by remember { mutableStateOf(false) }
                JustForMeRow(
                    on = Privacy.isPrivate(post),
                    busy = switching,
                    enabled = !switching,
                    onChange = { want ->
                        switching = true
                        scope.launch {
                            val result = Privacy.set(context, post, want)
                            switching = false
                            onNotice(
                                when {
                                    result is ApiResult.Ok -> if (result.value) Copy.NOW_PRIVATE else Copy.NOW_SHARED
                                    result is ApiResult.Failed && result.code == "not_saved" -> Copy.NOT_YOURS
                                    result is ApiResult.Failed -> result.message ?: Copy.PRIVATE_FAILED
                                    else -> Copy.PRIVATE_FAILED
                                },
                            )
                        }
                    },
                    modifier = Modifier.padding(vertical = 6.dp),
                )
                Spacer(Modifier.height(6.dp))
            }
            val videoUrl = media?.url?.takeIf { post.kind == PostKind.VIDEO }?.let { AdhxApi.resolve(server, it)?.toString() }
            if (videoUrl != null) {
                MoreRow(
                    icon = rememberVectorPainter(Icons.Filled.Share),
                    title = "Share the video",
                    subtitle = if (fetching) "Getting the copy from your ADHX…" else "Sends the copy your ADHX kept, not just the link",
                    busy = fetching,
                    onClick = {
                        if (fetching) return@MoreRow
                        fetching = true
                        scope.launch {
                            val got = SaveToPhone.fetchToShare(context, videoUrl, SaveToPhone.fileName(post.platform, post.id))
                            fetching = false
                            if (got == null) {
                                onNotice("Couldn’t get the video from your ADHX")
                                return@launch
                            }
                            val (file, type) = got
                            val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
                            val send = Intent(Intent.ACTION_SEND)
                                .setType(type)
                                .putExtra(Intent.EXTRA_STREAM, uri)
                                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            context.startActivity(Intent.createChooser(send, null))
                            close()
                        }
                    },
                )
            }
            if (source != null) {
                MoreRow(
                    icon = painterResource(R.drawable.ic_net_link),
                    title = "Copy link",
                    subtitle = "The original post on $network",
                    onClick = { copy("Link", source, "Link copied") },
                )
            }
            if (words.isNotBlank()) {
                MoreRow(
                    icon = painterResource(R.drawable.ic_copy),
                    title = "Copy the words",
                    subtitle = words.lineSequence().first(),
                    onClick = { copy("Words", words, "Words copied") },
                )
            }
            val adhxLink = post.openPath?.takeIf { it.isNotBlank() }?.let { AdhxApi.resolve(server, it)?.toString() }
            if (adhxLink != null) {
                MoreRow(
                    icon = rememberVectorPainter(Icons.Filled.Share),
                    title = "Share an ADHX link",
                    subtitle = "Only opens for people on your ADHX",
                    onClick = {
                        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, adhxLink)
                        context.startActivity(Intent.createChooser(send, null))
                        close()
                    },
                )
            }
        }
    }
}

@Composable
private fun Header(post: PhonePost, server: String, network: String, onClose: () -> Unit) {
    val media = post.media.firstOrNull()
    val poster = (media?.posterUrl ?: media?.url?.takeIf { media.kind == "photo" })
        ?.let { AdhxApi.resolve(server, it)?.toString() }
    val height = media?.height?.toInt()?.takeIf { post.kind == PostKind.VIDEO && it > 0 }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .width(40.dp)
                .height(64.dp)
                .clip(SquircleShape(8.dp))
                .background(AdhxColors.Placeholder),
            contentAlignment = Alignment.Center,
        ) {
            if (poster != null) {
                AsyncImage(model = poster, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().height(64.dp))
            } else {
                NetworkMark(post.platform, size = 16.dp)
            }
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                NetworkMark(post.platform, size = 13.dp, tint = AdhxColors.InkSoft)
                Spacer(Modifier.width(6.dp))
                Text(
                    network + (height?.let { " · ${it}p" } ?: ""),
                    fontSize = 13.sp,
                    color = AdhxColors.InkSoft,
                    maxLines = 1,
                )
            }
            Text(
                Copy.handle(post.author.handle) ?: post.author.name ?: network,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = AdhxColors.Ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Box(
            Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(AdhxColors.Raised)
                .clickable(onClickLabel = "Close", onClick = onClose)
                .semantics { contentDescription = "Close" },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Close, contentDescription = null, tint = AdhxColors.Ink, modifier = Modifier.size(18.dp))
        }
    }
}

/** A row with a yellow tile, a title and a grey line under it. A null icon is Gob. */
@Composable
private fun MoreRow(icon: Painter?, title: String, subtitle: String, onClick: () -> Unit, busy: Boolean = false) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(SquircleShape(14.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(SquircleShape(11.dp))
                .background(AdhxColors.Accent),
            contentAlignment = Alignment.Center,
        ) {
            when {
                busy -> CircularProgressIndicator(color = AdhxColors.OnAccent, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                icon == null -> Image(painterResource(R.drawable.ic_gob), contentDescription = null, modifier = Modifier.size(26.dp))
                else -> Icon(icon, contentDescription = null, tint = AdhxColors.OnAccent, modifier = Modifier.size(21.dp))
            }
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Ink)
            Text(subtitle, fontSize = 13.sp, color = AdhxColors.InkFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
