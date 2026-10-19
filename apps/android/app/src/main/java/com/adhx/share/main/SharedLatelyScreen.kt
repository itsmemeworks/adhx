package com.adhx.share.main

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.data.Connection
import com.adhx.share.data.HistoryItem
import com.adhx.share.links.Links
import com.adhx.share.ui.AdhxBrand
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.NetworkMark
import com.adhx.share.ui.PrimaryButton
import com.adhx.share.ui.openInAdhx
import kotlinx.coroutines.delay

/** "Shared lately" (Home.dc.html): what this phone shared. A row opens the post in the player. */
@Composable
fun SharedLatelyScreen(vm: MainViewModel, connection: Connection, onBack: () -> Unit, onOpen: (HistoryItem) -> Unit) {
    val context = LocalContext.current
    val items by vm.items.collectAsStateWithLifecycle()
    val reach by vm.reach.collectAsStateWithLifecycle()

    // While the screen is in front: check the key, then keep unfinished copies up to date.
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val resumed = lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    LaunchedEffect(resumed, connection.server, connection.key) {
        if (resumed) {
            vm.checkMe()
            var tick = 0
            while (true) {
                vm.refreshStatuses()
                delay(3_000)
                // Can't be reached: look again every few seconds, so it says
                // connected once the phone or the server is back.
                if (vm.reach.value == Reach.Unreachable && ++tick % 3 == 0) vm.checkMe()
            }
        }
    }

    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(resumed) {
        while (resumed) {
            now = System.currentTimeMillis()
            delay(30_000)
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Background)
            .systemBarsPadding()
            .padding(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(AdhxColors.Surface)
                    .clickable(onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = AdhxColors.White, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.weight(1f))
            AdhxBrand(markSize = 26.dp)
        }

        ConnectedPill(host = Links.host(connection.server), reach = reach)

        Text("Shared lately", style = MaterialTheme.typography.displaySmall, color = AdhxColors.White)

        if (items.isEmpty()) {
            Text(
                "Nothing yet. In any app, tap Share on a post and pick ADHX.",
                fontSize = 15.sp,
                lineHeight = 22.sp,
                color = AdhxColors.Faint,
                modifier = Modifier.weight(1f),
            )
        } else {
            // A new share goes on top. LazyColumn keeps the old first row in
            // place, which would leave the new one just above the fold, so
            // follow it when the list was already at the top.
            val listState = rememberLazyListState()
            val firstId = items.first().id
            LaunchedEffect(firstId) {
                if (listState.firstVisibleItemIndex <= 1) listState.scrollToItem(0)
            }
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(items, key = { it.id }) { item ->
                    HistoryRow(item, now) { onOpen(item) }
                }
            }
        }

        PrimaryButton(
            "Open my ADHX",
            onClick = { openInAdhx(context, connection.server) },
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
fun ConnectedPill(host: String, reach: Reach) {
    val (dot, label) = when (reach) {
        Reach.Connected -> AdhxColors.Good to "$host · connected"
        Reach.Checking -> AdhxColors.Faint to host
        Reach.Unreachable -> AdhxColors.Warn to "$host · can’t be reached"
    }
    Row(
        Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(AdhxColors.Surface)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(dot))
        Box(Modifier.width(8.dp))
        Text(label, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun HistoryRow(item: HistoryItem, now: Long, onClick: () -> Unit) {
    val (status, statusColor: Color) = Copy.historyLine(item)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(AdhxColors.Surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(AdhxColors.Black),
            contentAlignment = Alignment.Center,
        ) {
            NetworkMark(item.platform ?: Links.guessPlatform(item.link), size = 20.dp)
        }
        Box(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                Copy.historyTitle(item),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = AdhxColors.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(status, fontSize = 12.sp, color = statusColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(Modifier.width(12.dp))
        Text(Copy.shortAgo(item.sharedAt, now), fontSize = 12.sp, color = AdhxColors.Faint)
    }
}
