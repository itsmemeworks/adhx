package com.adhx.share.library

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.adhx.share.net.AdhxApi
import com.adhx.share.net.PhonePost
import com.adhx.share.feed.Privacy
import com.adhx.share.net.PostKind
import com.adhx.share.net.SearchScope
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Faces
import com.adhx.share.ui.NetworkMark
import com.adhx.share.ui.PrivateLock
import com.adhx.share.ui.Segmented
import com.adhx.share.ui.Spinner
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics

private val PROMPTS = listOf(
    "that video with the squirrel",
    "something about being tired after work",
    "tiny animations that make an app feel nicer",
    "a synth you play by typing",
)

/**
 * Search by meaning: a field, Everyone's saves · Mine (Everyone first), the
 * TRY DESCRIBING prompts, then a grid of posters with who saved each.
 */
@Composable
fun SearchScreen(vm: LibraryViewModel, server: String, onBack: () -> Unit, onOpen: (Int) -> Unit) {
    val ui by vm.search.collectAsStateWithLifecycle()
    val keyboard = LocalSoftwareKeyboardController.current
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        if (ui.query.isEmpty()) focus.requestFocus()
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(AdhxColors.Background)
            .systemBarsPadding()
            .imePadding()
            .padding(top = 8.dp),
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .clickable(onClickLabel = "Back", onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = AdhxColors.White)
            }
            Spacer(Modifier.width(6.dp))
            TextField(
                value = ui.query,
                onValueChange = vm::setQuery,
                placeholder = { Text("Describe what you’re looking for", color = AdhxColors.Faint, maxLines = 1) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = AdhxColors.Faint) },
                trailingIcon = if (ui.query.isNotEmpty()) {
                    {
                        Icon(
                            Icons.Filled.Close,
                            contentDescription = "Clear",
                            tint = AdhxColors.Faint,
                            modifier = Modifier.clickable { vm.setQuery("") },
                        )
                    }
                } else {
                    null
                },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { keyboard?.hide() }),
                shape = RoundedCornerShape(26.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = AdhxColors.Surface,
                    unfocusedContainerColor = AdhxColors.Surface,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    focusedTextColor = AdhxColors.White,
                    unfocusedTextColor = AdhxColors.White,
                    cursorColor = AdhxColors.Accent,
                ),
                modifier = Modifier
                    .weight(1f)
                    .focusRequester(focus)
                    .semantics {
                        contentDescription = if (ui.scope == SearchScope.EVERYONE) "Search everyone’s saves" else "Search your saves"
                    },
            )
        }

        val scopes = listOf(SearchScope.EVERYONE, SearchScope.MINE)
        Segmented(
            options = listOf(Copy.SCOPE_EVERYONE, Copy.SCOPE_MINE),
            selected = scopes.indexOf(ui.scope).coerceAtLeast(0),
            onSelect = { vm.setScope(scopes[it]) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 16.dp, top = 14.dp),
        )

        when {
            ui.query.isBlank() -> TryDescribing(onPick = {
                vm.setQuery(it)
                keyboard?.hide()
            })
            ui.items.isEmpty() && (ui.loading || ui.searched != ui.query.trim()) -> Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.Center) {
                Spinner(size = 30.dp, stroke = 3.dp)
            }
            ui.error != null -> Note(ui.error!!)
            ui.items.isEmpty() -> Note(ui.noResults)
            else -> Results(ui, server, vm::onSearchPage, onOpen)
        }
    }
}

@Composable
private fun TryDescribing(onPick: (String) -> Unit) {
    Column(
        Modifier.padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            "TRY DESCRIBING",
            fontSize = 12.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 1.4.sp,
            color = AdhxColors.Faint,
        )
        PROMPTS.forEach { prompt ->
            Text(
                prompt,
                fontSize = 15.sp,
                color = AdhxColors.Cream,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(AdhxColors.Surface)
                    .clickable { onPick(prompt) }
                    .padding(horizontal = 16.dp, vertical = 14.dp),
            )
        }
    }
}

@Composable
private fun Note(text: String) {
    Text(
        text,
        fontSize = 15.sp,
        lineHeight = 22.sp,
        color = AdhxColors.Muted,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 24.dp),
    )
}

@Composable
private fun Results(ui: SearchUi, server: String, onPage: (Int) -> Unit, onOpen: (Int) -> Unit) {
    val grid = rememberLazyGridState()
    val lastVisible by remember { derivedStateOf { grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 } }
    LaunchedEffect(lastVisible, ui.items.size) { onPage(lastVisible) }

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        state = grid,
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        ui.note?.let { note ->
            item(span = { GridItemSpan(maxLineSpan) }, key = "note") {
                Text(note, fontSize = 13.sp, color = AdhxColors.Faint, modifier = Modifier.padding(bottom = 2.dp))
            }
        }
        itemsIndexed(ui.items, key = { _, post -> post.key }) { index, post ->
            PosterCard(post, server) { onOpen(index) }
        }
    }
}

/**
 * A poster tile: the picture (or the words), the network and author, who of
 * your people saved it, a lock when it's just for you, and how well it matched.
 */
@Composable
fun PosterCard(post: PhonePost, server: String, onClick: () -> Unit) {
    val media = post.media.firstOrNull()
    val image = (media?.posterUrl ?: media?.url?.takeIf { media.kind == "photo" })
        ?.let { AdhxApi.resolve(server, it)?.toString() }
    Box(
        Modifier
            .fillMaxWidth()
            .aspectRatio(3f / 4f)
            .clip(RoundedCornerShape(16.dp))
            .background(AdhxColors.Placeholder)
            .clickable(onClickLabel = "Play", onClick = onClick),
    ) {
        if (image != null) {
            AsyncImage(
                model = image,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                post.article?.title?.takeIf { it.isNotBlank() } ?: post.text,
                fontSize = 14.sp,
                lineHeight = 19.sp,
                color = AdhxColors.Cream,
                maxLines = 7,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(14.dp),
            )
        }
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.7f))))
                .padding(start = 10.dp, end = 10.dp, top = 24.dp, bottom = 10.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                NetworkMark(post.platform, size = 13.dp)
                Spacer(Modifier.width(6.dp))
                Text(
                    Copy.handle(post.author.handle) ?: "",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = AdhxColors.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Copy.saversLine(post.savers)?.let { line ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Faces(post.savers, server, size = 18.dp, description = line)
                    Spacer(Modifier.width(6.dp))
                    Text(
                        Copy.names(post.savers),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = AdhxColors.Cream,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            post.match?.let { Strength(it.strength) }
        }
        if (Privacy.isPrivate(post)) {
            Box(
                Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp)
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(Color.Black.copy(alpha = 0.55f)),
                contentAlignment = Alignment.Center,
            ) {
                PrivateLock(size = 13.dp)
            }
        }
        if (post.kind == PostKind.VIDEO || post.kind == PostKind.AUDIO) {
            val seconds = media?.durationMs?.let { (it / 1000).toInt() }
            if (seconds != null && seconds > 0) {
                Text(
                    "%d:%02d".format(seconds / 60, seconds % 60),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = AdhxColors.White,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.Black.copy(alpha = 0.55f))
                        .padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
    }
}

/** Strong / Good / Related, with the website's three bars. */
@Composable
private fun Strength(strength: String) {
    val (label, bars) = when (strength) {
        "strong" -> "Strong match" to 3
        "good" -> "Good match" to 2
        else -> "Related" to 1
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Bottom) {
            for (i in 1..3) {
                Box(
                    Modifier
                        .width(3.dp)
                        .height((4 + i * 3).dp)
                        .clip(RoundedCornerShape(1.dp))
                        .background(if (i <= bars) AdhxColors.Accent else AdhxColors.White.copy(alpha = 0.3f)),
                )
            }
        }
        Spacer(Modifier.width(6.dp))
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Cream)
    }
}
