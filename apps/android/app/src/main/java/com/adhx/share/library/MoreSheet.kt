package com.adhx.share.library

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
import androidx.compose.foundation.shape.RoundedCornerShape
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
import coil.compose.AsyncImage
import com.adhx.share.R
import com.adhx.share.links.Networks
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.PhonePost
import com.adhx.share.net.PostKind
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.NetworkMark
import com.adhx.share.ui.openInAdhx
import kotlinx.coroutines.launch

/**
 * More: the post at a glance, then Share the video (the kept file, not the
 * link), Copy link, Copy the words and Open in my ADHX.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MoreSheet(post: PhonePost, server: String, onNotice: (String) -> Unit, onDismiss: () -> Unit) {
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
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(color = AdhxColors.Hairline) },
    ) {
        Column(
            Modifier
                .navigationBarsPadding()
                .padding(start = 20.dp, end = 20.dp, bottom = 16.dp),
        ) {
            Header(post, server, network, onClose = { close() })
            Spacer(Modifier.height(12.dp))
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
            post.openPath?.takeIf { it.isNotBlank() }?.let { path ->
                MoreRow(
                    icon = null,
                    title = "Open in my ADHX",
                    subtitle = "This post on your ADHX, in the browser",
                    onClick = {
                        openInAdhx(context, server, path)
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
                .clip(RoundedCornerShape(8.dp))
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
                NetworkMark(post.platform, size = 13.dp, tint = AdhxColors.Muted)
                Spacer(Modifier.width(6.dp))
                Text(
                    network + (height?.let { " · ${it}p" } ?: ""),
                    fontSize = 13.sp,
                    color = AdhxColors.Muted,
                    maxLines = 1,
                )
            }
            Text(
                Copy.handle(post.author.handle) ?: post.author.name ?: network,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = AdhxColors.White,
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
            Icon(Icons.Filled.Close, contentDescription = null, tint = AdhxColors.White, modifier = Modifier.size(18.dp))
        }
    }
}

/** A row with a yellow tile, a title and a grey line under it. A null icon is Gob. */
@Composable
private fun MoreRow(icon: Painter?, title: String, subtitle: String, onClick: () -> Unit, busy: Boolean = false) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(11.dp))
                .background(AdhxColors.Accent),
            contentAlignment = Alignment.Center,
        ) {
            when {
                busy -> CircularProgressIndicator(color = AdhxColors.Black, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                icon == null -> Image(painterResource(R.drawable.ic_gob), contentDescription = null, modifier = Modifier.size(26.dp))
                else -> Icon(icon, contentDescription = null, tint = AdhxColors.Black, modifier = Modifier.size(21.dp))
            }
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = AdhxColors.White)
            Text(subtitle, fontSize = 13.sp, color = AdhxColors.Faint, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
