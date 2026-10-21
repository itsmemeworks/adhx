package com.adhx.share.library

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.R
import com.adhx.share.data.Connection
import com.adhx.share.links.Links
import com.adhx.share.main.ConnectedPill
import com.adhx.share.main.Reach
import com.adhx.share.net.Saver
import com.adhx.share.ui.AdhxBrand
import com.adhx.share.ui.SerifFamily
import androidx.compose.foundation.layout.width
import androidx.compose.ui.unit.Dp
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.Spinner
import kotlinx.coroutines.delay
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.fadeOut
import androidx.compose.animation.fadeIn
import androidx.compose.animation.expandVertically
import androidx.compose.animation.AnimatedVisibility

/**
 * My saves in the player, or what to do while there's nothing to play. [bar]
 * is what sits at the top (the home bar and tabs when a server has no feed
 * yet, or a back button from Made for you); [contentTop] is how far down the
 * empty page starts, below it.
 */
@Composable
fun SavesHome(
    vm: LibraryViewModel,
    connection: Connection,
    reach: Reach,
    bar: @Composable () -> Unit,
    contentTop: Dp = 76.dp,
    onSaver: ((Saver) -> Unit)? = null,
) {
    val ui by vm.saves.collectAsStateWithLifecycle()

    // Back in the app at the top: show anything shared meanwhile.
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val resumed = lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    LaunchedEffect(resumed) {
        if (resumed) vm.refreshSaves()
    }
    // Saves still on their way join the list once their copy is kept: look again now and then.
    LaunchedEffect(resumed, ui.preparing > 0) {
        while (resumed && ui.preparing > 0) {
            delay(15_000)
            vm.refreshSaves()
        }
    }

    val topBar: @Composable BoxScope.() -> Unit = {
        Column(
            Modifier
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.6f), Color.Transparent)))
                .statusBarsPadding()
                .padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 20.dp),
        ) {
            bar()
            // Only over the player: the empty page shows the whole card. A short message
            // from the player ("Link copied") takes the pill's place while it's up.
            val toast = LocalPlayerToast.current
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                AnimatedVisibility(
                    visible = ui.preparing > 0 && ui.items.isNotEmpty() && toast == null,
                    enter = fadeIn() + expandVertically(),
                    exit = fadeOut() + shrinkVertically(),
                ) {
                    OnTheirWayPill(ui.preparing.coerceAtLeast(1), Modifier.padding(top = 6.dp))
                }
                if (toast != null) ToastPill(toast, Modifier.padding(top = 6.dp, start = 24.dp, end = 24.dp))
            }
        }
    }

    if (ui.items.isNotEmpty()) {
        PlayerScreen(
            posts = ui.items,
            server = connection.server,
            startIndex = vm.savesPage,
            onPage = vm::onSavesPage,
            topBar = topBar,
            newOnTop = ui.newOnTop,
            onTop = vm::seenTop,
            onSaver = onSaver,
            toastInTopBar = true,
        )
        return
    }

    Box(Modifier.fillMaxSize().background(AdhxColors.Background)) {
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(start = 20.dp, end = 20.dp, top = contentTop, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            ConnectedPill(host = Links.host(connection.server), reach = reach)
            Text("My saves", style = MaterialTheme.typography.displaySmall, color = AdhxColors.White)
            val error = ui.error
            when {
                !ui.loadedOnce || ui.loading -> Box(Modifier.fillMaxWidth().padding(top = 30.dp), contentAlignment = Alignment.Center) {
                    Spinner(size = 34.dp, stroke = 3.dp)
                }
                error != null -> {
                    Text(error, fontSize = 15.sp, lineHeight = 22.sp, color = AdhxColors.Muted)
                    OutlineButton("Try again", onClick = vm::reloadSaves, minHeight = 44.dp)
                }
                ui.preparing > 0 -> PreparingCard(
                    count = ui.preparing,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                )
                else -> Text(
                    "Nothing yet. In any app, tap Share on a post and pick ADHX.",
                    fontSize = 15.sp,
                    lineHeight = 22.sp,
                    color = AdhxColors.Faint,
                )
            }
            Spacer(Modifier.weight(1f))
        }
        topBar()
    }
}

/** A back button and a title, for My saves and channels. */
@Composable
fun BackTitleRow(title: String, onBack: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        BarButton(com.adhx.share.ui.Glyphs.Back, "Back", onBack)
        Spacer(Modifier.width(12.dp))
        Text(title, fontFamily = SerifFamily, fontSize = 26.sp, color = AdhxColors.White, maxLines = 1)
    }
}

/** A back button over the player, for results and single posts. */
@Composable
fun BoxScope.BackBar(onBack: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.6f), Color.Transparent)))
            .statusBarsPadding()
            .padding(start = 16.dp, top = 6.dp, bottom = 20.dp),
    ) {
        BarButton(com.adhx.share.ui.Glyphs.Back, "Back", onBack)
    }
}
