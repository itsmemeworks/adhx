package com.adhx.share.library

import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import com.adhx.share.links.Networks
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.SansFamily
import com.adhx.share.ui.SerifFamily
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
            Modifier.padding(start = 6.dp, end = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Box(
                Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .clickable(onClickLabel = "Back", onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Glyphs.Back, contentDescription = "Back", tint = AdhxColors.White, modifier = Modifier.size(22.dp))
            }
            var focused by remember { mutableStateOf(false) }
            // A 48dp pill; focused, a yellow ring with a soft glow.
            Row(
                Modifier
                    .weight(1f)
                    .height(56.dp)
                    .then(if (focused) Modifier.border(4.dp, AdhxColors.Accent.copy(alpha = 0.16f), RoundedCornerShape(50)) else Modifier)
                    .padding(4.dp)
                    .clip(RoundedCornerShape(50))
                    .background(AdhxColors.Surface)
                    .border(2.dp, if (focused) AdhxColors.Accent else Color.White.copy(alpha = 0.08f), RoundedCornerShape(50))
                    .padding(start = 14.dp, end = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Glyphs.Search, contentDescription = null, tint = AdhxColors.Accent, modifier = Modifier.size(18.dp))
                Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                    if (ui.query.isEmpty()) {
                        Text("Describe what you’re looking for", fontSize = 16.sp, color = AdhxColors.Faint, maxLines = 1, modifier = Modifier.clearAndSetSemantics { })
                    }
                    BasicTextField(
                        value = ui.query,
                        onValueChange = vm::setQuery,
                        singleLine = true,
                        textStyle = TextStyle(fontFamily = SansFamily, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.White),
                        cursorBrush = SolidColor(AdhxColors.Accent),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { keyboard?.hide() }),
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(focus)
                            .onFocusChanged { focused = it.isFocused }
                            .semantics {
                                contentDescription = if (ui.scope == SearchScope.EVERYONE) "Search everyone’s saves" else "Search your saves"
                            },
                    )
                }
                if (ui.query.isNotEmpty()) {
                    Box(
                        Modifier
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(AdhxColors.Card)
                            .clickable(onClickLabel = "Clear search") { vm.setQuery("") },
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Glyphs.Close, contentDescription = "Clear search", tint = AdhxColors.Muted, modifier = Modifier.size(14.dp))
                    }
                }
            }
        }

        val scopes = listOf(SearchScope.EVERYONE, SearchScope.MINE)
        Segmented(
            options = listOf(Copy.SCOPE_EVERYONE, Copy.SCOPE_MINE),
            selected = scopes.indexOf(ui.scope).coerceAtLeast(0),
            onSelect = { vm.setScope(scopes[it]) },
            fontSize = 14,
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 16.dp, top = 10.dp),
        )
        TryDescribing(onPick = {
            vm.setQuery(it)
            keyboard?.hide()
        })

        when {
            ui.query.isBlank() -> Unit
            ui.items.isEmpty() && (ui.loading || ui.searched != ui.query.trim()) -> Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.Center) {
                Spinner(size = 30.dp, stroke = 3.dp)
            }
            ui.error != null -> Note(ui.error!!)
            ui.items.isEmpty() -> Note(ui.noResults)
            else -> Results(ui, server, vm::onSearchPage, onOpen)
        }
    }
}

/** TRY DESCRIBING, then a row of example searches as chips (it scrolls sideways). */
@Composable
private fun TryDescribing(onPick: (String) -> Unit) {
    Column(
        Modifier.padding(top = 14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            "TRY DESCRIBING",
            fontSize = 12.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 0.7.sp,
            color = AdhxColors.Faint,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        Row(
            Modifier
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            PROMPTS.forEach { prompt ->
                Box(
                    Modifier
                        .height(40.dp)
                        .clip(RoundedCornerShape(50))
                        .background(AdhxColors.Surface)
                        .border(1.dp, AdhxColors.Accent.copy(alpha = 0.4f), RoundedCornerShape(50))
                        .clickable { onPick(prompt) }
                        .padding(horizontal = 14.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(prompt, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.White, maxLines = 1)
                }
            }
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
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 18.dp, bottom = 24.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }, key = "heading") {
            Row(Modifier.padding(bottom = 0.dp), verticalAlignment = Alignment.Bottom) {
                Text(
                    foundHeading(ui.items.firstOrNull()?.match?.on.orEmpty()),
                    fontFamily = SerifFamily,
                    fontSize = 28.sp,
                    lineHeight = 28.sp,
                    color = AdhxColors.White,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                if (ui.total > 0) Text(Copy.found(ui.total), fontSize = 12.sp, color = AdhxColors.Faint, modifier = Modifier.padding(bottom = 3.dp))
            }
        }
        ui.note?.let { note ->
            item(span = { GridItemSpan(maxLineSpan) }, key = "note") {
                Text(note, fontSize = 13.sp, color = AdhxColors.Faint, modifier = Modifier.padding(bottom = 2.dp))
            }
        }
        itemsIndexed(ui.items, key = { _, post -> post.key }) { index, post ->
            val on = post.match?.on.orEmpty()
            PosterCard(
                post,
                server,
                label = if (post.match != null) matchLabel(on) else Networks.name(post.platform),
                lit = index == 0 && post.match?.strength == "strong",
            ) { onOpen(index) }
        }
    }
}

/**
 * A poster tile, as on the boards: the picture (or the words), a pill
 * top-left (the network, or where a search found it; yellow when it's the
 * strongest), how well it matched top-right, then its first line and who
 * saved it over a dark fade. A lock when it's just for you.
 * [owner] is the channel's person: the line then says who else saved it
 * ("You and Ben too").
 */
@Composable
fun PosterCard(
    post: PhonePost,
    server: String,
    height: Dp = 250.dp,
    label: String? = Networks.name(post.platform),
    lit: Boolean = false,
    owner: String? = null,
    /** The yellow "New" in the top corner (channels: you haven't saved or seen it). */
    newMark: Boolean = false,
    onClick: () -> Unit,
) {
    val media = post.media.firstOrNull()
    val image = (media?.posterUrl ?: media?.url?.takeIf { media.kind == "photo" })
        ?.let { AdhxApi.resolve(server, it)?.toString() }
    val title = (post.article?.title?.takeIf { it.isNotBlank() } ?: post.text).trim().lineSequence().firstOrNull()?.trim().orEmpty()
    val others = if (owner != null) post.savers.filterNot { it.username == owner } else post.savers
    val line = when {
        others.isEmpty() -> null
        owner != null -> if (others.size == 1 && others[0].isYou) Copy.YOU_SAVED_TOO else "${Copy.names(others)} too"
        else -> listOfNotNull(Copy.names(others), Networks.name(post.platform)).joinToString(" · ")
    }
    Box(
        Modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(18.dp))
            .background(if (image != null) AdhxColors.Placeholder else AdhxColors.Surface)
            .clickable(onClickLabel = "Play", onClick = onClick),
    ) {
        if (image != null) {
            AsyncImage(
                model = image,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            Column(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.9f))))
                    .padding(start = 10.dp, end = 10.dp, top = 36.dp, bottom = 10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (title.isNotBlank()) {
                    Text(title, fontSize = 13.sp, lineHeight = 16.sp, fontWeight = FontWeight.ExtraBold, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                if (line != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Faces(others, server, size = 18.dp, description = line)
                        Spacer(Modifier.width(6.dp))
                        Text(line, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        } else {
            WordsTile(post, server, others, line)
        }
        Row(
            Modifier.align(Alignment.TopStart).padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (label != null) {
                Text(
                    label,
                    fontSize = 10.sp,
                    lineHeight = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = if (lit) Color.Black else Color.White,
                    maxLines = 1,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(if (lit) AdhxColors.Accent else Color.Black.copy(alpha = 0.55f))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
            if (Privacy.isPrivate(post)) {
                Box(
                    Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.55f)),
                    contentAlignment = Alignment.Center,
                ) {
                    PrivateLock(size = 12.dp)
                }
            }
        }
        post.match?.let { Strength(it.strength, Modifier.align(Alignment.TopEnd).padding(8.dp)) }
        if (newMark && post.match == null) {
            Text(
                com.adhx.share.ui.Copy.NEW_MARK,
                fontSize = 10.sp,
                lineHeight = 12.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Color.Black,
                maxLines = 1,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp)
                    .clip(RoundedCornerShape(50))
                    .background(AdhxColors.Accent)
                    .padding(horizontal = 8.dp, vertical = 4.dp),
            )
        }
    }
}

/**
 * A post with no picture, as the web's words tile: its words in the reading
 * serif on the card (bigger when there are few), starting below the pills
 * and the match meter so they never cover the first line, then who posted it
 * and who saved it at the bottom.
 */
@Composable
private fun WordsTile(post: PhonePost, server: String, others: List<com.adhx.share.net.Saver>, line: String?) {
    val words = (post.article?.title?.takeIf { it.isNotBlank() } ?: Copy.oneLine(post.text)).trim()
    val size = wordsTileSize(words.length)
    val author = post.author.name?.trim()?.takeIf { it.isNotEmpty() } ?: Copy.handle(post.author.handle)
    Column(
        Modifier
            .fillMaxSize()
            .padding(start = 12.dp, end = 12.dp, top = WORDS_TILE_TOP, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            words.ifEmpty { Networks.name(post.platform) ?: "Post" },
            fontFamily = SerifFamily,
            fontSize = size.fontSize.sp,
            lineHeight = size.lineHeight.sp,
            color = AdhxColors.White,
            maxLines = size.maxLines,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = true),
        )
        if (author != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                NetworkMark(post.platform, size = 12.dp, tint = AdhxColors.Muted)
                Spacer(Modifier.width(6.dp))
                Text(author, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = AdhxColors.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (line != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Faces(others, server, size = 18.dp, description = line)
                Spacer(Modifier.width(6.dp))
                Text(line, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = AdhxColors.Cream, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** Below the tile's pills (8dp in, 22dp tall) with room to breathe: the words start here. */
private val WORDS_TILE_TOP = 42.dp

/** A words tile's type: short posts read as headlines, long ones smaller (the web's sizes, a step down for the phone's narrower tiles). */
internal data class WordsSize(val fontSize: Int, val lineHeight: Int, val maxLines: Int)

internal fun wordsTileSize(length: Int): WordsSize = when {
    length < 60 -> WordsSize(22, 25, 5)
    length < 140 -> WordsSize(18, 21, 6)
    else -> WordsSize(15, 18, 8)
}

/** Where a search found a post, for its pill: on screen, said in it, or in the words. */
fun matchLabel(on: List<String>): String = when {
    "screen" in on || "ocr" in on || "onScreen" in on -> "On screen"
    "speech" in on || "said" in on || "transcript" in on -> "Said in the video"
    "keywords" in on || "words" in on || "text" in on -> "In the words"
    else -> "Related"
}

/** How a search matched a post, for Up next's chip; null outside a search. */
fun matchChip(post: PhonePost): String? = post.match?.let { matchLabel(it.on) }

/** The heading over the results, after where the best one was found. */
fun foundHeading(on: List<String>): String = when (matchLabel(on)) {
    "On screen" -> "Found it on screen"
    "Said in the video" -> "Found it in what’s said"
    "In the words" -> "Found it in the words"
    else -> "Closest we’ve got"
}

/** Strong / Good / Related: the website's three bars in a small dark pill. */
@Composable
private fun Strength(strength: String, modifier: Modifier = Modifier) {
    val (label, bars) = when (strength) {
        "strong" -> "Strong match" to 3
        "good" -> "Good match" to 2
        else -> "Related" to 1
    }
    Row(
        modifier
            .clip(RoundedCornerShape(50))
            .background(Color.Black.copy(alpha = 0.55f))
            .padding(horizontal = 7.dp, vertical = 5.dp)
            .semantics { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        for (i in 1..3) {
            Box(
                Modifier
                    .width(3.dp)
                    .height((3 + i * 3).dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(if (i <= bars) AdhxColors.Accent else Color.White.copy(alpha = 0.3f)),
            )
        }
    }
}
