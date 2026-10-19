package com.adhx.share.feed

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.adhx.share.R
import com.adhx.share.library.Route
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.LiveMoment
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Faces
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.PrimaryButton
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.Spinner
import com.adhx.share.ui.rememberReducedMotion
import kotlinx.coroutines.delay
import java.util.Calendar

/**
 * Live: the moments your lot are saving into right now, each with who's in
 * it and who's watching. The first is big; Tune in plays it.
 */
@Composable
fun LiveTab(feed: FeedViewModel, server: String, actions: HomeActions, header: @Composable () -> Unit) {
    val ui by feed.live.collectAsStateWithLifecycle()
    val lifecycleState by LocalLifecycleOwner.current.lifecycle.currentStateFlow.collectAsState()
    val resumed = lifecycleState.isAtLeast(Lifecycle.State.RESUMED)
    // Fresh while it's on screen.
    LaunchedEffect(resumed) {
        while (resumed) {
            feed.loadLive()
            delay(LIST_POLL_MS)
        }
    }
    val tuneIn: (LiveMoment) -> Unit = { actions.open(Route.TunedIn(it.slug)) }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
        item(key = "header") { header() }
        item(key = "title") {
            Text(
                Copy.liveTitle(Calendar.getInstance().get(Calendar.HOUR_OF_DAY)),
                fontFamily = SerifFamily,
                fontSize = 36.sp,
                lineHeight = 36.sp,
                color = AdhxColors.White,
                modifier = Modifier
                    .padding(start = 16.dp, end = 16.dp, top = 18.dp, bottom = 16.dp)
                    .semantics { heading() },
            )
        }
        when {
            ui.moments.isEmpty() && !ui.loadedOnce -> item(key = "loading") {
                Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { Spinner(size = 30.dp, stroke = 3.dp) }
            }
            ui.moments.isEmpty() && ui.error != null -> item(key = "error") {
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(ui.error ?: Copy.LIVE_CANT_LOAD, fontSize = 15.sp, color = AdhxColors.Muted)
                    OutlineButton("Try again", onClick = feed::loadLive, minHeight = 44.dp)
                }
            }
            ui.moments.isEmpty() -> item(key = "empty") { NothingLive() }
        }
        itemsIndexed(ui.moments, key = { _, m -> m.slug }) { i, moment ->
            if (i == 0) BigMoment(moment, server) { tuneIn(moment) } else SmallMoment(moment, server) { tuneIn(moment) }
        }
        item(key = "bottom") { Spacer(Modifier.navigationBarsPadding()) }
    }
}

private const val LIST_POLL_MS = 20_000L

@Composable
private fun NothingLive() {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Image(painterResource(R.drawable.ic_gob), contentDescription = null, modifier = Modifier.size(64.dp))
        Text(Copy.LIVE_EMPTY_TITLE, fontFamily = SerifFamily, fontSize = 28.sp, color = AdhxColors.White)
        Text(Copy.LIVE_EMPTY_NOTE, fontSize = 14.sp, lineHeight = 20.sp, color = AdhxColors.Faint)
    }
}

/** The red LIVE badge; the dot pulses unless animations are off. */
@Composable
fun LiveBadge(modifier: Modifier = Modifier) {
    val still = rememberReducedMotion()
    val pulse = if (still) {
        1f
    } else {
        val t = rememberInfiniteTransition(label = "live")
        t.animateFloat(1f, 0.35f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "dot").value
    }
    Row(
        modifier
            .height(32.dp)
            .clip(RoundedCornerShape(50))
            .background(Color.Black.copy(alpha = 0.55f))
            .border(1.dp, AdhxColors.Live.copy(alpha = 0.5f), RoundedCornerShape(50))
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).alpha(pulse).clip(CircleShape).background(AdhxColors.Live))
        Spacer(Modifier.width(6.dp))
        Text(Copy.LIVE_BADGE, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.sp, color = AdhxColors.White)
    }
}

/** The first moment: a mosaic of its covers, LIVE, who's watching, its name, and Tune in. */
@Composable
private fun BigMoment(moment: LiveMoment, server: String, onTuneIn: () -> Unit) {
    val urls = moment.covers.mapNotNull { AdhxApi.resolve(server, it)?.toString() }
    val watching = Copy.watching(moment.watching.coerceAtLeast(moment.watchers.size))
    val line = Copy.momentLine(moment.posts, moment.people, moment.savers)
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(AdhxColors.Surface)
            .clickable(onClickLabel = Copy.TUNE_IN, onClick = onTuneIn)
            .padding(10.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = listOfNotNull(moment.label, if (moment.live) Copy.LIVE_BADGE.lowercase() else null, watching, line).joinToString(", ")
            },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(178.dp)
                .clip(RoundedCornerShape(20.dp)),
        ) {
            Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                Cover(urls.getOrNull(0), Modifier.weight(1.3f).fillMaxHeight())
                for (col in 0..1) {
                    Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Cover(urls.getOrNull(1 + col * 2), Modifier.weight(1f).fillMaxWidth())
                        Cover(urls.getOrNull(2 + col * 2), Modifier.weight(1f).fillMaxWidth())
                    }
                }
            }
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.6f)))),
            )
            if (moment.live) LiveBadge(Modifier.align(Alignment.TopStart).padding(10.dp))
            if (watching != null) {
                Row(
                    Modifier
                        .align(Alignment.BottomStart)
                        .padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val faces = moment.watchers.ifEmpty { moment.savers }
                    if (faces.isNotEmpty()) {
                        Faces(faces, server, size = 24.dp)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(watching, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = AdhxColors.White)
                }
            }
        }
        Column(Modifier.padding(horizontal = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(moment.label, fontFamily = SerifFamily, fontSize = 32.sp, lineHeight = 32.sp, color = AdhxColors.White)
            if (line.isNotBlank()) Text(line, fontSize = 13.sp, color = AdhxColors.Muted)
        }
        PrimaryButton(Copy.TUNE_IN, onClick = onTuneIn, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun Cover(url: String?, modifier: Modifier) {
    Box(modifier.background(AdhxColors.Placeholder)) {
        if (url != null) AsyncImage(url, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
    }
}

/** Another moment: a cover, Live or not, its name, and who's in it. */
@Composable
private fun SmallMoment(moment: LiveMoment, server: String, onTuneIn: () -> Unit) {
    val url = moment.covers.firstOrNull()?.let { AdhxApi.resolve(server, it)?.toString() }
    val line = Copy.momentLine(moment.posts, moment.people, moment.savers)
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(AdhxColors.Surface)
            .clickable(onClickLabel = Copy.TUNE_IN, onClick = onTuneIn)
            .padding(10.dp)
            .semantics(mergeDescendants = true) { },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(url, Modifier.size(width = 76.dp, height = 88.dp).clip(RoundedCornerShape(14.dp)))
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            if (moment.live) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(AdhxColors.Live))
                    Spacer(Modifier.width(6.dp))
                    Text(Copy.LIVE_BADGE, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.sp, color = AdhxColors.Live)
                }
            }
            Text(moment.label, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (moment.savers.isNotEmpty()) {
                    Faces(moment.savers, server, size = 20.dp, ring = AdhxColors.Surface)
                    Spacer(Modifier.width(6.dp))
                }
                if (line.isNotBlank()) Text(line, fontSize = 13.sp, color = AdhxColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}
