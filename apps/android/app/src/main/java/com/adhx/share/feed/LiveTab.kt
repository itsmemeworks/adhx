package com.adhx.share.feed

import androidx.compose.foundation.Canvas
import androidx.compose.material3.Icon
import androidx.compose.ui.unit.Dp
import com.adhx.share.ui.Glyphs
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.translate
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
import coil3.compose.AsyncImage
import com.adhx.share.R
import com.adhx.share.library.Route
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.FormingMoment
import com.adhx.share.net.LiveMoment
import com.adhx.share.alerts.LiveAlerts
import android.Manifest
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Faces
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.PrimaryButton
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.Spinner
import com.adhx.share.ui.SquircleShape
import com.adhx.share.ui.rememberReducedMotion
import com.adhx.share.ui.sansLineBox
import com.adhx.share.ui.serifLineBox
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
        if (resumed) feed.followLive()
    }
    val tuneIn: (LiveMoment) -> Unit = { actions.open(Route.TunedIn(it.slug)) }
    val context = LocalContext.current
    // Asked once, on the first bell tap; the bell works either way (the app says it in the app when it can't notify).
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    val ring: (FormingMoment) -> Unit = { forming ->
        val on = !forming.alert
        if (on && LiveAlerts.shouldAsk(context)) {
            LiveAlerts.asked(context)
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        feed.setAlert(forming.id, on) { said -> Toast.makeText(context, said, Toast.LENGTH_SHORT).show() }
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
        item(key = "header") { header() }
        item(key = "title") {
            Text(
                Copy.liveTitle(Calendar.getInstance().get(Calendar.HOUR_OF_DAY)),
                fontFamily = SerifFamily,
                fontSize = 36.sp,
                lineHeight = 34.sp,
                color = AdhxColors.White,
                modifier = Modifier
                    .padding(start = 16.dp, end = 16.dp, top = 2.dp, bottom = 9.dp)
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
            ui.moments.isEmpty() && ui.forming.isEmpty() -> item(key = "empty") { NothingLive() }
        }
        itemsIndexed(ui.moments, key = { _, m -> m.slug }) { i, moment ->
            if (i == 0) BigMoment(moment, server) { tuneIn(moment) } else SmallMoment(moment, server) { tuneIn(moment) }
        }
        itemsIndexed(ui.forming, key = { _, f -> "forming:" + f.id.ifBlank { f.title } }) { _, forming ->
            FormingRow(forming, server, busy = feed.alertBusy == forming.id, onBell = { ring(forming) }.takeIf { forming.id.isNotBlank() })
        }
        item(key = "bottom") { Spacer(Modifier.navigationBarsPadding()) }
    }
}


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

/** The red LIVE badge: a dot whose glow pulses (unless animations are off), and LIVE. */
@Composable
fun LiveBadge(modifier: Modifier = Modifier, height: Dp = 30.dp, border: Boolean = false) {
    val still = rememberReducedMotion()
    val pulse = if (still) {
        0f
    } else {
        val t = rememberInfiniteTransition(label = "live")
        t.animateFloat(0f, 1f, infiniteRepeatable(tween(1400), RepeatMode.Restart), label = "glow").value
    }
    Row(
        modifier
            .height(height)
            .clip(RoundedCornerShape(50))
            .background(Color.Black.copy(alpha = 0.6f))
            .then(if (border) Modifier.border(1.dp, AdhxColors.Live.copy(alpha = 0.5f), RoundedCornerShape(50)) else Modifier)
            .padding(start = 10.dp, end = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // A 9dp dot with two soft rings (4dp and 9dp); the outer one breathes out.
        Canvas(Modifier.size(9.dp)) {
            val r = size.minDimension / 2
            drawCircle(AdhxColors.Live.copy(alpha = 0.12f * (1f - pulse)), radius = r + (9.dp.toPx() * (0.6f + 0.4f * pulse)))
            drawCircle(AdhxColors.Live.copy(alpha = 0.3f), radius = r + 4.dp.toPx())
            drawCircle(AdhxColors.Live, radius = r)
        }
        Spacer(Modifier.width(9.dp))
        Text(Copy.LIVE_BADGE, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.sp, color = Color.White)
    }
}

/** The ring round the live moment's card (the boards' pink). */
private val LiveRing = Color(0xFFFF8FA3)

/** The green ring round the faces of people watching now. */
val WatchingGreen = Color(0xFF5EE38A)

/** The first moment: a mosaic of its covers, LIVE, who's watching, its name, and Tune in. */
@Composable
private fun BigMoment(moment: LiveMoment, server: String, onTuneIn: () -> Unit) {
    val urls = moment.covers.mapNotNull { AdhxApi.resolve(server, it)?.toString() }
    val watching = Copy.watching(moment.watching.coerceAtLeast(moment.watchers.size))
    val line = Copy.momentLine(moment.posts, moment.people, moment.savers, moment.recentSaves, moment.windowMinutes)
    // The mosaic and Tune in follow the card's curve: 26 − 8 padding − the 2dp ring = 16 (board 7.3),
    // the same with or without the ring so the card doesn't change shape when it goes live.
    val inner = SquircleShape(SquircleShape.nested(26.dp, 10.dp))
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 5.dp)
            .clip(SquircleShape(26.dp))
            .background(AdhxColors.Surface)
            .then(if (moment.live) Modifier.border(2.dp, LiveRing, SquircleShape(26.dp)) else Modifier)
            .clickable(onClickLabel = Copy.TUNE_IN, onClick = onTuneIn)
            // The board's 2dp ring sits outside its 8dp of padding; border() draws inside this box.
            .padding(if (moment.live) 10.dp else 8.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = listOfNotNull(moment.label, if (moment.live) Copy.LIVE_BADGE.lowercase() else null, watching, line).joinToString(", ")
            },
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .height(178.dp)
                .clip(inner),
        ) {
            // One tall cover on the left; two on top and one wide underneath on the right.
            Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                Cover(urls.getOrNull(0), Modifier.weight(1.3f).fillMaxHeight())
                Column(Modifier.weight(2f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        Cover(urls.getOrNull(1), Modifier.weight(1f).fillMaxHeight())
                        Cover(urls.getOrNull(2), Modifier.weight(1f).fillMaxHeight())
                    }
                    Cover(urls.getOrNull(3), Modifier.weight(1f).fillMaxWidth())
                }
            }
            if (moment.live) LiveBadge(Modifier.align(Alignment.TopStart).padding(10.dp))
            if (watching != null) {
                Row(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(10.dp)
                        .height(34.dp)
                        .clip(RoundedCornerShape(50))
                        .background(Color.Black.copy(alpha = 0.6f))
                        .padding(start = 5.dp, end = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val faces = moment.watchers.ifEmpty { moment.savers }
                    if (faces.isNotEmpty()) {
                        Faces(faces, server, size = 24.dp, ring = WatchingGreen)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(watching, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                }
            }
        }
        Column(Modifier.padding(horizontal = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            // The board's `line-height: 0.95`, its line box split evenly as CSS does.
            Text(
                moment.label,
                fontFamily = SerifFamily,
                fontSize = 32.sp,
                lineHeight = 30.4.sp,
                color = AdhxColors.White,
                modifier = Modifier.serifLineBox(32.sp, 30.4.sp),
            )
            if (line.isNotBlank()) Text(line, fontSize = 13.sp, color = AdhxColors.Muted, modifier = Modifier.sansLineBox(13.sp))
        }
        Row(
            Modifier
                .fillMaxWidth()
                .height(52.dp)
                .clip(inner)
                .background(AdhxColors.Accent)
                .clickable(onClick = onTuneIn),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Glyphs.Play, contentDescription = null, tint = Color.Black, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(10.dp))
            Text(Copy.TUNE_IN, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold, color = Color.Black)
        }
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
    // Next to the faces, their names are enough ("Mum and you"); without faces, how busy it is.
    val line = if (moment.savers.isNotEmpty()) Copy.names(moment.savers, max = 3) else Copy.momentLine(moment.posts, moment.people, moment.savers, moment.recentSaves, moment.windowMinutes)
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 5.dp)
            .clip(SquircleShape(22.dp))
            .background(AdhxColors.Surface)
            .border(1.dp, Color.White.copy(alpha = 0.08f), SquircleShape(22.dp))
            .clickable(onClickLabel = Copy.TUNE_IN, onClick = onTuneIn)
            .padding(start = 8.dp, end = 10.dp, top = 8.dp, bottom = 8.dp)
            .semantics(mergeDescendants = true) { },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Tucked into the row's corner: 22 − 8 padding = 14.
        Cover(url, Modifier.size(width = 76.dp, height = 88.dp).clip(SquircleShape(14.dp)))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            if (moment.live) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(AdhxColors.Live))
                    Spacer(Modifier.width(6.dp))
                    Text(Copy.LIVE_BADGE, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.9.sp, color = AdhxColors.Live)
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
        Spacer(Modifier.width(12.dp))
        Box(
            Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(AdhxColors.Card),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Glyphs.Play, contentDescription = null, tint = AdhxColors.White, modifier = Modifier.size(18.dp))
        }
    }
}

/**
 * A group on its way to being a moment: its cover, a dashed edge, "Forming",
 * the people saving into it and "1 more save to go live", and a bell for
 * "Tell me when it's live" (yellow while it's on). Not playable yet.
 */
@Composable
private fun FormingRow(forming: FormingMoment, server: String, busy: Boolean = false, onBell: (() -> Unit)? = null) {
    val url = forming.covers.firstOrNull()?.let { AdhxApi.resolve(server, it)?.toString() }
    val line = Copy.toGoLive(forming.left, forming.unit)
    val shape = SquircleShape(22.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 5.dp)
            .clip(shape)
            .background(AdhxColors.Surface)
            .drawBehind { dashedOutline(Color.White.copy(alpha = 0.2f), shape) }
            .padding(start = 8.dp, end = 10.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier
                .weight(1f)
                .semantics(mergeDescendants = true) {
                    contentDescription = listOfNotNull(
                        forming.title,
                        Copy.FORMING.lowercase(),
                        forming.people.takeIf { it.isNotEmpty() }?.let { Copy.names(it, max = 3) },
                        line,
                    ).joinToString(", ")
                },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Tucked into the row's corner: 22 − 8 padding = 14.
            Cover(url, Modifier.size(width = 76.dp, height = 88.dp).clip(SquircleShape(14.dp)))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(
                    Copy.FORMING,
                    fontSize = 11.sp,
                    lineHeight = 13.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = AdhxColors.Accent,
                    modifier = Modifier
                        .drawBehind { dashedOutline(AdhxColors.Accent.copy(alpha = 0.7f), RoundedCornerShape(50)) }
                        .padding(horizontal = 9.dp, vertical = 4.dp),
                )
                Text(forming.title, fontSize = 17.sp, fontWeight = FontWeight.ExtraBold, color = AdhxColors.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (forming.people.isNotEmpty()) {
                        Faces(forming.people, server, size = 20.dp, max = 4, ring = AdhxColors.Surface)
                        Spacer(Modifier.width(7.dp))
                    }
                    Text(line, fontSize = 13.sp, color = AdhxColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        if (onBell != null) {
            Spacer(Modifier.width(12.dp))
            BellButton(forming.title, on = forming.alert, busy = busy, onClick = onBell)
        }
    }
}

/** "Tell me when it's live": a 44dp round button; yellow with a dark bell while it's on. */
@Composable
private fun BellButton(title: String, on: Boolean, busy: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(if (on) AdhxColors.Accent else AdhxColors.Card)
            .toggleable(value = on, enabled = !busy, role = Role.Switch, onValueChange = { onClick() })
            .semantics { contentDescription = Copy.tellMeWhen(title) },
        contentAlignment = Alignment.Center,
    ) {
        Icon(Glyphs.Bell, contentDescription = null, tint = if (on) Color.Black else AdhxColors.White, modifier = Modifier.size(18.dp))
    }
}

/** A 1dp dashed outline of [shape] just inside the bounds. */
private fun androidx.compose.ui.graphics.drawscope.DrawScope.dashedOutline(color: Color, shape: androidx.compose.ui.graphics.Shape) {
    val stroke = 1.dp.toPx()
    val outline = shape.createOutline(androidx.compose.ui.geometry.Size(size.width - stroke, size.height - stroke), layoutDirection, this)
    translate(stroke / 2, stroke / 2) {
        drawOutline(
            outline,
            color = color,
            style = androidx.compose.ui.graphics.drawscope.Stroke(
                width = stroke,
                pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 4.dp.toPx())),
            ),
        )
    }
}
