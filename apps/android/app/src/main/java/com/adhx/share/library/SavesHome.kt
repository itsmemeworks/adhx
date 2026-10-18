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
import androidx.compose.ui.platform.LocalContext
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
import com.adhx.share.ui.AdhxBrand
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.PrimaryButton
import com.adhx.share.ui.Spinner
import com.adhx.share.ui.openInAdhx

/** Home: My saves in the player, or what to do while there's nothing to play. */
@Composable
fun SavesHome(
    vm: LibraryViewModel,
    connection: Connection,
    reach: Reach,
    onSearch: () -> Unit,
    onSharedLately: () -> Unit,
    onSettings: () -> Unit,
) {
    val context = LocalContext.current
    val ui by vm.saves.collectAsStateWithLifecycle()

    // Back in the app at the top: show anything shared meanwhile.
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val resumed = lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    LaunchedEffect(resumed) {
        if (resumed) vm.refreshSaves()
    }

    val topBar: @Composable BoxScope.() -> Unit = {
        Row(
            Modifier
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.6f), Color.Transparent)))
                .statusBarsPadding()
                .padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            AdhxBrand(markSize = 28.dp, modifier = Modifier.weight(1f))
            BarButton(painterResource(R.drawable.ic_history), "Shared lately", onSharedLately)
            BarButton(Icons.Filled.Search, "Search your saves", onSearch)
            BarButton(Icons.Filled.Settings, "Settings", onSettings)
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
        )
        return
    }

    Box(Modifier.fillMaxSize().background(AdhxColors.Background)) {
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(start = 20.dp, end = 20.dp, top = 76.dp, bottom = 16.dp),
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
                else -> Text(
                    "Nothing yet. In any app, tap Share on a post and pick ADHX.",
                    fontSize = 15.sp,
                    lineHeight = 22.sp,
                    color = AdhxColors.Faint,
                )
            }
            Spacer(Modifier.weight(1f))
            PrimaryButton(
                "Open my ADHX",
                onClick = { openInAdhx(context, connection.server) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        topBar()
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
        BarButton(Icons.AutoMirrored.Filled.ArrowBack, "Back", onBack)
    }
}
