package com.adhx.share.library

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.adhx.share.net.ApiResult
import com.adhx.share.net.PhonePost
import com.adhx.share.net.StatusResponse
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.OutlineButton
import kotlinx.coroutines.delay

/**
 * One post opened by adhx://post?platform=…&id=… (the share card's Open in
 * ADHX). While its copy is still being kept it shows the shimmering card
 * with a progress ring; once kept (or if it never will be) the player.
 */
@Composable
fun PostLinkScreen(
    library: LibraryViewModel,
    server: String,
    platform: String,
    id: String,
    onBack: () -> Unit,
) {
    var post by remember { mutableStateOf<PhonePost?>(null) }
    var status by remember { mutableStateOf<StatusResponse?>(null) }
    // True once the server says the copy is done with (kept, or never will be).
    var settled by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    var tries by remember { mutableIntStateOf(0) }

    // The post, and again once its copy is kept: the player needs the kept file.
    LaunchedEffect(platform, id, tries, settled) {
        problem = null
        when (val result = library.post(platform, id)) {
            is ApiResult.Ok -> post = result.value
            is ApiResult.Failed -> if (result.status != 401) {
                problem = if (result.status == 404) NOT_SAVED else result.message ?: CANT_OPEN
            }
            ApiResult.Offline -> if (post == null) problem = LibraryViewModel.OFFLINE
        }
    }

    // How the copy is coming along, every 1.5 s until it's done with.
    LaunchedEffect(platform, id, tries) {
        while (!settled) {
            when (val result = library.status(platform, id)) {
                is ApiResult.Ok -> {
                    status = result.value
                    if (!stillKeeping(result.value.status)) settled = true
                }
                // Not known or can't say: just play what there is.
                is ApiResult.Failed -> settled = true
                ApiResult.Offline -> Unit
            }
            if (!settled) delay(1_500)
        }
    }

    val shown = post
    val ready = shown != null && settled
    AnimatedContent(
        targetState = ready,
        transitionSpec = { fadeIn() togetherWith fadeOut() },
        label = "post-link",
    ) { playing ->
        if (playing && shown != null) {
            PlayerScreen(
                posts = listOf(shown),
                server = server,
                startIndex = 0,
                onPage = {},
                topBar = { BackBar(onBack) },
            )
        } else {
            Box(Modifier.fillMaxSize().background(AdhxColors.Background)) {
                val error = problem
                if (error != null) {
                    Column(
                        Modifier.align(Alignment.Center).padding(horizontal = 32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Text(error, fontSize = 15.sp, lineHeight = 22.sp, color = AdhxColors.Muted, textAlign = TextAlign.Center)
                        OutlineButton("Try again", onClick = { tries++ })
                    }
                } else {
                    PreparingCard(
                        post = shown,
                        status = status,
                        ring = true,
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
                BackBar(onBack)
            }
        }
    }
}

private const val NOT_SAVED = "That post isn’t in your saves yet."
private const val CANT_OPEN = "That post didn’t open. Try again."
