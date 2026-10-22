package com.adhx.share.library

import android.content.ClipData
import android.content.ClipboardManager
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.SubcomposeAsyncImage
import com.adhx.share.links.Networks
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.PhonePost
import com.adhx.share.net.PostKind
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.KeepUpright
import com.adhx.share.ui.NetworkMark
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.SquircleShape
import com.adhx.share.ui.openUrl
import com.adhx.share.ui.rememberLinked
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Who posted it, for the sheet's header: their name, else their handle; null
 * when neither says more than the network (empty, one letter, or the
 * network's own name), as on iPhone.
 */
internal fun originalName(post: PhonePost): String? {
    val name = post.author.name?.trim().orEmpty()
    val picked = name.ifEmpty { post.author.handle.trim().removePrefix("@") }
    val network = Networks.name(post.platform)
    if (picked.length <= 1 || (network != null && picked.equals(network, ignoreCase = true))) return null
    return picked
}

/** The header's name: who posted it, else the network ("YouTube"). */
internal fun originalHeading(post: PhonePost): String = originalName(post) ?: Networks.name(post.platform) ?: "The original post"

/** "@handle", unless it's the network's name or already the header's name. */
internal fun originalHandle(post: PhonePost): String? {
    val raw = post.author.handle.trim().removePrefix("@")
    if (raw.isEmpty()) return null
    val network = Networks.name(post.platform)
    if (network != null && raw.equals(network, ignoreCase = true)) return null
    if (raw.equals(originalName(post), ignoreCase = true)) return null
    return "@$raw"
}

/** "18 Oct 2026" for when it was posted, or null when we don't know. */
internal fun postedDay(iso: String?, zone: ZoneId = ZoneId.systemDefault(), locale: Locale = Locale.getDefault()): String? = try {
    iso?.takeIf { it.isNotBlank() }?.let { DateTimeFormatter.ofPattern("d MMM yyyy", locale).format(Instant.parse(it).atZone(zone)) }
} catch (e: Exception) {
    null
}

/** The line under the name: "@handle · Posted 18 Oct 2026" (the network's name when we don't know the day). */
internal fun originalLine(post: PhonePost, posted: String? = postedDay(post.postedAt)): String =
    listOfNotNull(originalHandle(post), posted?.let { "Posted $it" } ?: Networks.name(post.platform)).joinToString(" · ")

/**
 * The network's mark shows once: beside the line when their own picture leads
 * the header, else it is the header's picture and the line goes without it.
 */
internal fun lineShowsMark(hasPicture: Boolean): Boolean = hasPicture

/** "No words with this one, just the video." (picture, sound). */
internal fun noWordsLine(kind: String): String = "No words with this one, just the " + when (kind) {
    PostKind.PHOTO -> "picture"
    PostKind.AUDIO -> "sound"
    else -> "video"
} + "."

/** Whether the post has words of its own to show in full. */
internal fun hasOriginalWords(post: PhonePost): Boolean =
    post.text.isNotBlank() || post.article?.let { !it.title.isNullOrBlank() || !it.body.isNullOrBlank() || !it.description.isNullOrBlank() } == true

/**
 * The original post, from the rail's network button: who posted it and when,
 * everything they wrote (a kept article in full, selectable, links tappable),
 * then Open on {network} and Copy link. Keeps the phone upright while it's up.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OriginalSheet(post: PhonePost, server: String, onNotice: (String) -> Unit, onDismiss: () -> Unit) {
    KeepUpright()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val network = Networks.name(post.platform) ?: "the web"
    val source = post.sourceUrl?.takeIf { it.isNotBlank() }
    val picture = remember(post.author.avatarUrl, server) { post.author.avatarUrl?.takeIf { it.isNotBlank() }?.let { AdhxApi.resolve(server, it)?.toString() } }

    fun close() {
        scope.launch { state.hide() }.invokeOnCompletion { onDismiss() }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = AdhxColors.Surface,
        shape = SquircleShape.top(28.dp),
        dragHandle = { BottomSheetDefaults.DragHandle(color = AdhxColors.Hairline) },
    ) {
        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(48.dp).clip(CircleShape), contentAlignment = Alignment.Center) {
                    if (picture != null) {
                        SubcomposeAsyncImage(
                            model = picture,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            error = { MarkTile(post.platform) },
                            loading = { MarkTile(post.platform) },
                            modifier = Modifier.size(48.dp),
                        )
                    } else {
                        MarkTile(post.platform)
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(originalHeading(post), fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // The network's mark shows once: here only when their picture leads.
                        if (lineShowsMark(picture != null)) {
                            NetworkMark(post.platform, size = 13.dp, tint = AdhxColors.Muted)
                            Spacer(Modifier.width(6.dp))
                        }
                        Text(originalLine(post), fontSize = 13.sp, color = AdhxColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                Spacer(Modifier.width(8.dp))
                Box(
                    Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(AdhxColors.Raised)
                        .clickable(onClickLabel = "Close") { close() }
                        .semantics { contentDescription = "Close" },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Close, contentDescription = null, tint = AdhxColors.White, modifier = Modifier.size(18.dp))
                }
            }

            if (hasOriginalWords(post)) {
                SelectionContainer { OriginalWords(post) }
            } else {
                Text(noWordsLine(post.kind), fontSize = 15.sp, color = AdhxColors.Muted)
            }

            if (source != null) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 52.dp)
                            .clip(RoundedCornerShape(26.dp))
                            .background(AdhxColors.Accent)
                            .clickable {
                                openUrl(context, source)
                                close()
                            }
                            .semantics { role = Role.Button }
                            .padding(horizontal = 20.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        NetworkMark(post.platform, size = 18.dp, tint = AdhxColors.Black)
                        Spacer(Modifier.width(8.dp))
                        Text("Open on $network", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.Black)
                    }
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 52.dp)
                            .clip(RoundedCornerShape(26.dp))
                            .border(1.5.dp, AdhxColors.Cream.copy(alpha = 0.6f), RoundedCornerShape(26.dp))
                            .clickable {
                                context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Link", source))
                                onNotice("Link copied")
                                close()
                            }
                            .semantics { role = Role.Button },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("Copy link", fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.Cream)
                    }
                }
            }
        }
    }
}

/** The network's mark in a round raised tile: the header's picture when theirs isn't there. */
@Composable
private fun MarkTile(platform: String?) {
    Box(Modifier.size(48.dp).clip(CircleShape).background(AdhxColors.Raised), contentAlignment = Alignment.Center) {
        NetworkMark(platform, size = 22.dp, tint = AdhxColors.Cream)
    }
}

/** Their words at reading size: a kept article in full, else the title, summary and post text. */
@Composable
private fun OriginalWords(post: PhonePost) {
    val article = post.article
    val body = remember(article?.body) { ArticleBody.parse(article?.body) }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        article?.title?.takeIf { it.isNotBlank() }?.let {
            Text(it, fontFamily = SerifFamily, fontSize = 28.sp, lineHeight = 33.sp, color = AdhxColors.White)
        }
        if (body.isNotEmpty()) {
            ArticleBodyText(body, size = 20.sp, lineHeight = 29.sp)
        } else {
            article?.description?.takeIf { it.isNotBlank() && it != post.text }?.let {
                Text(it, fontSize = 16.sp, lineHeight = 24.sp, color = AdhxColors.Muted)
            }
            if (post.text.isNotBlank()) {
                Text(rememberLinked(post.text), fontFamily = SerifFamily, fontSize = 22.sp, lineHeight = 32.sp, color = AdhxColors.Cream)
            }
        }
    }
}
