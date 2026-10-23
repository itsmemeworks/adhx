package com.adhx.share.library

import com.adhx.share.ui.KeepUpright
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adhx.share.links.Links
import com.adhx.share.net.PhonePost
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.rememberLinked

/**
 * All of a long text post or article, as a normal scrolling page: the title
 * and description first, then the words. A thin yellow line across the top
 * shows how far you've read. The down arrow (or back) returns to the save.
 */
@Composable
fun Reader(post: PhonePost, onClose: () -> Unit) {
    KeepUpright()
    BackHandler(onBack = onClose)
    val scroll = rememberScrollState()
    val article = post.article
    // A kept X article's whole body replaces the summary and the post's own words.
    val body = remember(article?.body) { ArticleBody.parse(article?.body) }
    Box(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Bg),
    ) {
        // The words scroll below the down arrow, never under it or the status bar.
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(top = 64.dp)
                .verticalScroll(scroll)
                .navigationBarsPadding()
                .padding(start = 24.dp, end = 24.dp, top = 8.dp, bottom = 48.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Copy.handle(post.author.handle)?.let {
                Text(it, fontSize = 14.sp, color = AdhxColors.InkFaint)
            }
            article?.title?.takeIf { it.isNotBlank() }?.let {
                Text(it, fontFamily = SerifFamily, fontSize = 32.sp, lineHeight = 37.sp, color = AdhxColors.Ink)
            }
            if (body.isEmpty()) {
                article?.description?.takeIf { it.isNotBlank() && it != post.text }?.let {
                    Text(it, fontSize = 17.sp, lineHeight = 26.sp, color = AdhxColors.InkSoft)
                }
            }
            article?.url?.takeIf { it.isNotBlank() }?.let {
                Text(Links.display(it), fontSize = 13.sp, color = AdhxColors.InkFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (body.isNotEmpty()) {
                ArticleBodyText(body)
            } else if (post.text.isNotBlank()) {
                // Links in the words open in the browser.
                Text(rememberLinked(post.text), fontFamily = SerifFamily, fontSize = 22.sp, lineHeight = 32.sp, color = AdhxColors.Ink)
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
