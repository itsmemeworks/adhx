package com.adhx.share.main

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.graphics.vector.group
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.adhx.share.data.Connection
import com.adhx.share.feed.HomeTab
import com.adhx.share.links.Networks
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ApiResult
import com.adhx.share.net.FeedMode
import com.adhx.share.net.PhonePost
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Faces
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.SerifFamily

/** The board's green for "This phone is connected". */
private val Green = Color(0xFF7FD1AE)

/**
 * Just paired: Gob cheering, "This phone is connected", "Connected to Ana's
 * ADHX" with your people's faces, a row of what they saved lately, and
 * Start watching. Shown once, right after pairing.
 */
@Composable
fun ConnectedScreen(
    connection: Connection,
    people: PeopleViewModel,
    onStart: () -> Unit,
) {
    LaunchedEffect(Unit) { people.load() }
    val peopleUi by people.ui.collectAsStateWithLifecycle()
    val members = peopleUi.people?.members.orEmpty().filterNot { it.banned }
    val owner = members.firstOrNull { it.role == com.adhx.share.net.PersonRole.OWNER }
    val others = members.filterNot { it.isYou }.map { it.asSaver }
    var posts by remember { mutableStateOf<List<PhonePost>>(emptyList()) }
    LaunchedEffect(connection.key) {
        // Everyone's latest, keeping the ones a friend saved.
        val result = AdhxApi(connection).feed(FeedMode.EVERYONE)
        if (result is ApiResult.Ok) posts = result.value.items.filter { p -> p.savers.any { !it.isYou } }.take(8)
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Background)
            .drawBehind {
                // A soft yellow glow behind Gob.
                val c = Offset(size.width / 2, 60.dp.toPx() + 144.dp.toPx())
                drawOval(
                    Brush.radialGradient(0f to AdhxColors.Accent.copy(alpha = 0.16f), 0.65f to Color.Transparent, center = c, radius = 275.dp.toPx()),
                    topLeft = Offset(-80.dp.toPx(), 60.dp.toPx()),
                    size = Size(size.width + 160.dp.toPx(), 360.dp.toPx()),
                )
            },
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // No header here, as on iPhone: the welcome is its own moment and
            // Start watching is the way in (the app has no "adhx" wordmark row).
            Spacer(Modifier.statusBarsPadding().height(20.dp))
            Column(
                Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(top = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.size(width = 240.dp, height = 92.dp), contentAlignment = Alignment.Center) {
                    Image(rememberVectorPainter(Confetti), null, Modifier.fillMaxSize())
                    Image(rememberVectorPainter(GobHappy), null, Modifier.size(92.dp))
                }
                Row(
                    Modifier
                        .padding(top = 12.dp)
                        .height(30.dp)
                        .clip(RoundedCornerShape(50))
                        .background(Green.copy(alpha = 0.14f))
                        .padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Glyphs.Check, null, tint = Green, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(Copy.PHONE_CONNECTED, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Green)
                }
                Text(
                    buildAnnotatedString {
                        append(Copy.CONNECTED_TO)
                        append("\n")
                        withStyle(SpanStyle(color = AdhxColors.Accent)) { append(Copy.whoseAdhx(owner?.label, owner?.isYou == true)) }
                    },
                    fontFamily = SerifFamily,
                    fontSize = 48.sp,
                    lineHeight = 46.sp,
                    color = AdhxColors.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(start = 24.dp, end = 24.dp, top = 6.dp).semantics { heading() },
                )
                if (others.isNotEmpty()) {
                    Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Faces(others, connection.server, size = 30.dp, max = 4, ring = AdhxColors.Background)
                        Spacer(Modifier.width(10.dp))
                        Text(Copy.youAnd(others.map { it.label }), fontSize = 14.sp, color = AdhxColors.Muted)
                    }
                }
                if (posts.isNotEmpty()) {
                    Text(
                        Copy.SAVED_THIS_WEEK,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = AdhxColors.White,
                        modifier = Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 18.dp, bottom = 12.dp),
                    )
                    val list = rememberLazyListState()
                    LazyRow(
                        state = list,
                        contentPadding = PaddingValues(horizontal = 24.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        items(posts, key = { it.key }) { post -> WeekCard(post, connection.server) }
                    }
                    val first by remember { derivedStateOf { list.firstVisibleItemIndex } }
                    val pages = ((posts.size + 1) / 2).coerceIn(1, 4)
                    Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        repeat(pages) { i ->
                            val on = i == (first / 2).coerceAtMost(pages - 1)
                            Box(
                                Modifier
                                    .size(width = if (on) 18.dp else 6.dp, height = 6.dp)
                                    .clip(RoundedCornerShape(50))
                                    .background(if (on) AdhxColors.White else AdhxColors.Hairline),
                            )
                        }
                    }
                }
            }
            Column(
                Modifier.padding(start = 24.dp, end = 24.dp, top = 16.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                        .clip(RoundedCornerShape(50))
                        .background(AdhxColors.Accent)
                        .clickable(onClick = onStart),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Glyphs.Play, null, tint = Color.Black, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(10.dp))
                    Text(Copy.START_WATCHING, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Color.Black)
                }
                Text(Copy.CONNECTED_NOTE, fontSize = 12.sp, lineHeight = 17.sp, color = AdhxColors.Faint, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

/** One save of the week: its picture, the network, who saved it and its first words. */
@Composable
private fun WeekCard(post: PhonePost, server: String) {
    val media = post.media.firstOrNull()
    val poster = (media?.posterUrl ?: media?.url?.takeIf { media.kind == "photo" })?.let { AdhxApi.resolve(server, it)?.toString() }
    val friends = post.savers.filterNot { it.isYou }
    Box(
        Modifier
            .size(width = 146.dp, height = 232.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(AdhxColors.Placeholder),
    ) {
        if (poster != null) AsyncImage(poster, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        Networks.name(post.platform)?.let { network ->
            Text(
                network,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White,
                modifier = Modifier
                    .padding(8.dp)
                    .height(24.dp)
                    .clip(RoundedCornerShape(50))
                    .background(Color.Black.copy(alpha = 0.5f))
                    .padding(horizontal = 9.dp, vertical = 4.dp),
            )
        }
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.9f))))
                .padding(start = 10.dp, end = 10.dp, top = 40.dp, bottom = 10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Faces(friends, server, size = 22.dp, max = 2)
                Spacer(Modifier.width(6.dp))
                Text(
                    if (friends.size == 1) "${friends[0].label} saved" else Copy.names(friends),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                (post.article?.title?.takeIf { it.isNotBlank() } ?: post.text).trim().lineSequence().firstOrNull().orEmpty(),
                fontSize = 12.sp,
                lineHeight = 16.sp,
                color = Color.White,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

private fun ImageVector.Builder.line(d: String, color: Color, width: Float, fill: Color? = null) = addPath(
    pathData = addPathNodes(d),
    fill = fill?.let { SolidColor(it) },
    stroke = SolidColor(color),
    strokeLineWidth = width,
    strokeLineCap = StrokeCap.Round,
    strokeLineJoin = StrokeJoin.Round,
)

private fun ImageVector.Builder.blob(d: String, color: Color) = addPath(pathData = addPathNodes(d), fill = SolidColor(color))

private fun rect(x: Float, y: Float, w: Float, h: Float, r: Float) =
    "M${x + r} ${y}h${w - 2 * r}a$r $r 0 0 1 $r ${r}v${h - 2 * r}a$r $r 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a$r $r 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a$r $r 0 0 1 $r ${-r}z"

private fun circle(cx: Float, cy: Float, r: Float) = "M${cx - r} ${cy}a$r $r 0 1 0 ${2 * r} 0a$r $r 0 1 0 ${-2 * r} 0z"

/** Gob, cheering: eyes shut in smiles and a wide grin, tilted −7°. */
private val GobHappy: ImageVector = ImageVector.Builder(defaultWidth = 92.dp, defaultHeight = 92.dp, viewportWidth = 40f, viewportHeight = 40f)
    .group(rotate = -7f, pivotX = 20f, pivotY = 20f) {
        blob(rect(3f, 3f, 34f, 34f, 14f), AdhxColors.Accent)
        line("M10.5 17.5 q3 -4 6 0", Color.Black, 2.4f)
        line("M21.5 17 q4.5 -6 9 0", Color.Black, 2.6f)
        line("M13.5 25 q6.5 6 13 -0.5", Color.Black, 2.4f, fill = Color.Black)
    }
    .build()

/** The bits of confetti round Gob. */
private val Confetti: ImageVector = ImageVector.Builder(defaultWidth = 240.dp, defaultHeight = 92.dp, viewportWidth = 240f, viewportHeight = 92f)
    .group(rotate = -25f, pivotX = 35f, pivotY = 20f) { blob(rect(30f, 18f, 10f, 5f, 2f), Color(0xFFFF8FA3)) }
    .group(rotate = 30f, pivotX = 62f, pivotY = 64f) { blob(rect(58f, 62f, 9f, 5f, 2f), Color(0xFF7FD1AE)) }
    .apply { blob(circle(70f, 22f, 3.5f), AdhxColors.Accent) }
    .group(rotate = 35f, pivotX = 181f, pivotY = 16f) { blob(rect(176f, 14f, 10f, 5f, 2f), Color(0xFFC4A7FF)) }
    .group(rotate = -20f, pivotX = 201f, pivotY = 58f) { blob(rect(196f, 56f, 10f, 5f, 2f), Color(0xFFFFB35C)) }
    .apply {
        blob(circle(168f, 70f, 3f), Color(0xFFFF8FA3))
        line("M14 48 q6 -8 12 0 t12 0", AdhxColors.Accent, 2f)
        line("M206 34 q5 -7 10 0 t10 0", Color(0xFF7FD1AE), 2f)
    }
    .build()
