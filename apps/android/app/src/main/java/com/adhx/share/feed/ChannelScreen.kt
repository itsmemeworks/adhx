package com.adhx.share.feed

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridItemSpan
import androidx.compose.foundation.lazy.staggeredgrid.itemsIndexed
import androidx.compose.material3.Icon
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import com.adhx.share.net.PhonePost
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.GobShape
import com.adhx.share.ui.faceColor
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.library.BackTitleRow
import com.adhx.share.library.PosterCard
import com.adhx.share.library.Route
import com.adhx.share.net.ChannelKind
import com.adhx.share.net.Saver
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.Copy
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.Spinner

/**
 * One channel (`/api/app/channels/{kind}/{slug}`): a friend's saves with
 * their face and how many you haven't seen, or a channel's name; Play; then
 * a grid of posters. A poster plays the channel from there.
 */
@Composable
fun ChannelScreen(
    feed: FeedViewModel,
    route: Route.Channel,
    server: String,
    onBack: () -> Unit,
    onPlay: (Int) -> Unit,
    /** The pages' header (Channels lit); null keeps a back button. */
    header: (@Composable () -> Unit)? = null,
) {
    LaunchedEffect(route) {
        val person = if (route.kind == ChannelKind.FRIEND) Saver(username = route.slug, name = route.title, avatarUrl = route.avatarUrl) else null
        feed.openChannel(route.kind, route.slug, route.title, person)
    }
    val ui by feed.channel.collectAsStateWithLifecycle()
    val title = if (route.kind == ChannelKind.FRIEND) Copy.friendsSaves(route.title) else route.title
    val owner = route.slug.takeIf { route.kind == ChannelKind.FRIEND }

    Column(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Background)
            .then(if (header == null) Modifier.systemBarsPadding() else Modifier.navigationBarsPadding()),
    ) {
        if (header != null) header() else Box(Modifier.padding(start = 16.dp, end = 16.dp, top = 6.dp)) { BackTitleRow("", onBack) }
        LazyVerticalStaggeredGrid(
            columns = StaggeredGridCells.Fixed(2),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalItemSpacing = 10.dp,
            modifier = Modifier.fillMaxSize(),
        ) {
            item(span = StaggeredGridItemSpan.FullLine, key = "head") {
                Column(Modifier.padding(top = 18.dp, bottom = 6.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val person = ui.person
                        if (route.kind == ChannelKind.FRIEND && person != null) {
                            // Their face with a 3dp gap and a soft ring in their colour.
                            Box(
                                Modifier
                                    .size(74.dp)
                                    .border(2.dp, faceColor(person.username).copy(alpha = 0.35f), GobShape)
                                    .padding(5.dp),
                            ) { Avatar(person, server, size = 64.dp) }
                            Spacer(Modifier.width(12.dp))
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                title,
                                fontFamily = SerifFamily,
                                fontSize = 40.sp,
                                lineHeight = 38.sp,
                                color = AdhxColors.White,
                                modifier = Modifier.semantics { heading() },
                            )
                            val size = ui.size.takeIf { it > 0 } ?: ui.items.size
                            if (size > 0) {
                                Text(
                                    buildAnnotatedString {
                                        append(Copy.saves(size))
                                        if (route.kind == ChannelKind.FRIEND && ui.newCount > 0) {
                                            append(" · ")
                                            withStyle(SpanStyle(color = AdhxColors.Accent)) { append("${ui.newCount} you haven’t seen") }
                                        }
                                    },
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = AdhxColors.Muted,
                                )
                            }
                        }
                    }
                    if (ui.items.isNotEmpty()) PlayButton { onPlay(0) }
                }
            }
            when {
                ui.items.isEmpty() && ui.loading -> item(span = StaggeredGridItemSpan.FullLine, key = "loading") {
                    Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { Spinner(size = 30.dp, stroke = 3.dp) }
                }
                ui.items.isEmpty() && ui.error != null -> item(span = StaggeredGridItemSpan.FullLine, key = "error") {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(ui.error ?: Copy.CHANNEL_EMPTY, fontSize = 15.sp, color = AdhxColors.Muted)
                        if (ui.error != Copy.CHANNEL_EMPTY) OutlineButton("Try again", onClick = feed::loadChannel, minHeight = 44.dp)
                    }
                }
                ui.items.isEmpty() -> item(span = StaggeredGridItemSpan.FullLine, key = "empty") {
                    Text(Copy.CHANNEL_EMPTY, fontSize = 15.sp, color = AdhxColors.Muted)
                }
            }
            itemsIndexed(ui.items, key = { _, post -> post.key }) { index, post ->
                PosterCard(post, server, height = tileHeight(post), owner = owner) { onPlay(index) }
            }
        }
    }
}

/** A tile's height in the channel's two staggered columns, from the post's shape: 180–290dp. */
internal fun tileHeight(post: PhonePost): Dp {
    val media = post.media.firstOrNull()
    val w = media?.width ?: return if (post.media.isEmpty()) 180.dp else 230.dp
    val h = media.height ?: return 230.dp
    if (w <= 0 || h <= 0) return 230.dp
    return (174 * (h / w)).toFloat().coerceIn(180f, 290f).dp
}

/** "Play all": yellow, with a play mark. */
@Composable
private fun PlayButton(onClick: () -> Unit) {
    Row(
        Modifier
            .height(48.dp)
            .clip(RoundedCornerShape(50))
            .background(AdhxColors.Accent)
            .clickable(onClick = onClick)
            .padding(horizontal = 22.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Glyphs.Play, contentDescription = null, tint = Color.Black, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text(Copy.PLAY_ALL, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = Color.Black)
    }
}
