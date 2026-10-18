package com.adhx.share.library

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adhx.share.links.Links
import com.adhx.share.net.PhonePost
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.SerifFamily

/**
 * All of a long text post or article, as a normal scrolling page: the title
 * and description first, then the words. A thin yellow line across the top
 * shows how far you've read. The down arrow (or back) returns to the save.
 */
@Composable
fun Reader(post: PhonePost, onClose: () -> Unit) {
    BackHandler(onBack = onClose)
    val scroll = rememberScrollState()
    val article = post.article
    Box(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Background),
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(scroll)
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(start = 24.dp, end = 24.dp, top = 72.dp, bottom = 48.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Copy.handle(post.author.handle)?.let {
                Text(it, fontSize = 14.sp, color = AdhxColors.Faint)
            }
            article?.title?.takeIf { it.isNotBlank() }?.let {
                Text(it, fontFamily = SerifFamily, fontSize = 32.sp, lineHeight = 37.sp, color = AdhxColors.White)
            }
            article?.description?.takeIf { it.isNotBlank() && it != post.text }?.let {
                Text(it, fontSize = 17.sp, lineHeight = 26.sp, color = AdhxColors.Muted)
            }
            article?.url?.takeIf { it.isNotBlank() }?.let {
                Text(Links.display(it), fontSize = 13.sp, color = AdhxColors.Faint, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (post.text.isNotBlank()) {
                Text(post.text, fontFamily = SerifFamily, fontSize = 22.sp, lineHeight = 32.sp, color = AdhxColors.Cream)
            }
        }
        val read = if (scroll.maxValue > 0) scroll.value.toFloat() / scroll.maxValue else 1f
        Box(
            Modifier
                .statusBarsPadding()
                .fillMaxWidth()
                .height(3.dp),
        ) {
            Box(
                Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(read.coerceIn(0f, 1f))
                    .background(AdhxColors.Accent),
            )
        }
        Box(
            Modifier
                .statusBarsPadding()
                .padding(start = 16.dp, top = 12.dp),
        ) {
            BarButton(Icons.Filled.KeyboardArrowDown, "Back to the save", onClose)
        }
    }
}
