package com.adhx.share.feed

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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.adhx.share.R
import com.adhx.share.library.Route
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.ChannelKind
import com.adhx.share.net.FriendChannel
import com.adhx.share.net.GroupChannel
import com.adhx.share.net.MineChannel
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Avatar
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Faces
import com.adhx.share.ui.OutlineButton
import com.adhx.share.ui.SerifFamily
import com.adhx.share.ui.Spinner

/**
 * Channels: "From everyone" (channels made from the whole group's saves),
 * "Your people" (one round face per friend, with how many of theirs you
 * haven't seen), then "Made for you": My saves and your own channels.
 */
@Composable
fun ChannelsTab(feed: FeedViewModel, server: String, actions: HomeActions, header: @Composable () -> Unit) {
    val ui by feed.channels.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { feed.loadChannels(force = ui.loadedOnce) }
    val channels = ui.channels

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp),
    ) {
        item(key = "header") { header() }
        when {
            !ui.loadedOnce || (ui.loading && channels.group.isEmpty() && channels.friends.isEmpty()) -> item(key = "loading") {
                Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.Center) {
                    Spinner(size = 30.dp, stroke = 3.dp)
                }
            }
            ui.error != null -> item(key = "error") {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(ui.error ?: Copy.CHANNELS_CANT_LOAD, fontSize = 15.sp, color = AdhxColors.Muted)
                    OutlineButton("Try again", onClick = { feed.loadChannels(force = true) }, minHeight = 44.dp)
                }
            }
        }
        if (channels.group.isNotEmpty()) {
            item(key = "group-h") { Heading(Copy.FROM_EVERYONE, Copy.FROM_EVERYONE_NOTE, size = 32) }
            item(key = "group") {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(channels.group, key = { it.slug }) { channel ->
                        GroupTile(channel, server) {
                            actions.open(Route.Channel(ChannelKind.GROUP, channel.slug, channel.name))
                        }
                    }
                }
            }
        }
        if (channels.friends.isNotEmpty()) {
            item(key = "people-h") { Heading(Copy.YOUR_PEOPLE, null, size = 28) }
            item(key = "people") {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    items(channels.friends, key = { it.username }) { friend ->
                        PersonBubble(friend, server) { actions.openPerson(friend.asSaver) }
                    }
                }
            }
        }
        if (ui.loadedOnce) {
            item(key = "mine-h") { Heading(Copy.MADE_FOR_YOU, Copy.MADE_FOR_YOU_NOTE, size = 28) }
            item(key = "my-saves") {
                MineRow(title = Copy.MY_SAVES, line = Copy.MY_SAVES_NOTE, cover = null, server = server) {
                    actions.open(Route.MySaves)
                }
            }
            items(channels.mine, key = { "mine:" + it.slug }) { channel ->
                MineRow(channel, server) { actions.open(Route.Channel(ChannelKind.MINE, channel.slug, channel.name)) }
            }
            if (channels.group.isEmpty() && channels.friends.isEmpty() && channels.mine.isEmpty() && ui.error == null) {
                item(key = "empty") {
                    Text(
                        Copy.CHANNELS_EMPTY,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        color = AdhxColors.Faint,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    )
                }
            }
        }
        item(key = "bottom") { Spacer(Modifier.navigationBarsPadding()) }
    }
}

@Composable
private fun Heading(title: String, note: String?, size: Int) {
    Column(
        Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(
            title,
            fontFamily = SerifFamily,
            fontSize = size.sp,
            lineHeight = size.sp,
            color = AdhxColors.White,
            modifier = Modifier.semantics { heading() },
        )
        if (note != null) Text(note, fontSize = 13.sp, color = AdhxColors.Faint)
    }
}

/** Four covers in a square, two by two. Missing ones stay dark. */
@Composable
fun CoverGrid(covers: List<String>, server: String, size: Dp, modifier: Modifier = Modifier, corner: Dp = 20.dp) {
    val urls = covers.mapNotNull { AdhxApi.resolve(server, it)?.toString() }
    Column(
        modifier
            .size(size)
            .clip(RoundedCornerShape(corner))
            .background(AdhxColors.Background),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        for (row in 0..1) {
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                for (col in 0..1) {
                    val url = urls.getOrNull(row * 2 + col)
                    Box(
                        Modifier
                            .weight(1f)
                            .fillMaxSize()
                            .background(AdhxColors.Placeholder),
                    ) {
                        if (url != null) AsyncImage(url, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
                    }
                }
            }
        }
    }
}

@Composable
private fun GroupTile(channel: GroupChannel, server: String, onClick: () -> Unit) {
    val line = Copy.groupLine(channel.size, channel.savers)
    Column(
        Modifier
            .width(160.dp)
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = "${channel.name}, $line" },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        CoverGrid(channel.covers, server, 160.dp)
        Text(
            channel.name,
            fontSize = 15.sp,
            fontWeight = FontWeight.ExtraBold,
            color = AdhxColors.White,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (channel.savers.isNotEmpty()) {
                Faces(channel.savers, server, size = 20.dp, ring = AdhxColors.Background)
                Spacer(Modifier.width(6.dp))
            }
            Text(line, fontSize = 12.sp, color = AdhxColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** A friend: their face (ringed in yellow, with a count, when there's something new) and their name. */
@Composable
private fun PersonBubble(friend: FriendChannel, server: String, onClick: () -> Unit) {
    val fresh = friend.newCount > 0
    Column(
        Modifier
            .width(68.dp)
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .clearAndSetSemantics { contentDescription = Copy.friendDescription(friend.label, friend.newCount) },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(68.dp), contentAlignment = Alignment.Center) {
            Box(
                Modifier
                    .size(68.dp)
                    .then(if (fresh) Modifier.border(2.dp, AdhxColors.Accent, CircleShape) else Modifier),
            )
            Avatar(friend.username, friend.label, friend.avatarUrl, server, size = 60.dp)
            if (fresh) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 2.dp, y = (-2).dp)
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(AdhxColors.Accent)
                        .border(2.dp, AdhxColors.Background, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (friend.newCount > 99) "99+" else friend.newCount.toString(),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.Black,
                    )
                }
            }
        }
        Text(friend.label, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.Cream, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun MineRow(channel: MineChannel, server: String, onClick: () -> Unit) =
    MineRow(channel.name, Copy.saves(channel.size), channel.covers.firstOrNull(), server, onClick)

/** A row: a 56dp cover (Gob for My saves), the name and a line. */
@Composable
private fun MineRow(title: String, line: String, cover: String?, server: String, onClick: () -> Unit) {
    val url = cover?.let { AdhxApi.resolve(server, it)?.toString() }
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .semantics(mergeDescendants = true) { },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(if (url == null) AdhxColors.Accent else AdhxColors.Placeholder),
            contentAlignment = Alignment.Center,
        ) {
            if (url != null) {
                AsyncImage(url, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
            } else {
                Image(painterResource(R.drawable.ic_gob), contentDescription = null, modifier = Modifier.size(34.dp))
            }
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = AdhxColors.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(line, fontSize = 13.sp, color = AdhxColors.Faint, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
