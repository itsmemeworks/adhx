package com.adhx.share.feed

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.adhx.share.R
import com.adhx.share.data.Connection
import com.adhx.share.doing.DoingPillHost
import com.adhx.share.doing.DoingViewModel
import com.adhx.share.library.BarButton
import com.adhx.share.library.LibraryViewModel
import com.adhx.share.library.Route
import com.adhx.share.main.Reach
import com.adhx.share.net.FeedMode
import com.adhx.share.net.Saver
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy
import com.adhx.share.ui.Glyphs
import com.adhx.share.ui.SerifFamily

/** What every tab of home can do: open a screen, or open a person's channel. */
class HomeActions(
    val open: (Route) -> Unit,
    val openPerson: (Saver) -> Unit,
    val onSearch: () -> Unit,
    val onSettings: () -> Unit,
    /** What your ADHX is doing, in full (from the "On their way" sheet). */
    val onDoing: () -> Unit = {},
    /** Your people, all of them (Channels → See all). */
    val onPeople: () -> Unit = {},
    /** Invite someone (Channels → Invite); null when you can't. */
    val onInvite: (() -> Unit)? = null,
)

/**
 * Home: one light row on top (Gob for Settings, New · Channels · Live, and
 * Search), then the tab. New is the friends feed in the player; Channels and
 * Live are pages.
 */
@Composable
fun HomeScreen(
    feed: FeedViewModel,
    library: LibraryViewModel,
    connection: Connection,
    reach: Reach,
    actions: HomeActions,
    doing: DoingViewModel? = null,
) {
    val tab = feed.tab
    // Tapping New again opens "What's in your feed".
    val onTab: (HomeTab) -> Unit = { if (it == tab && it == HomeTab.New) feed.filterOpen = true else feed.tab = it }
    val ui by feed.feed.collectAsStateWithLifecycle()
    // Away from New the count stays where you left the feed.
    val badge = newBadge(ui, feed.feedPage)
    when (tab) {
        HomeTab.New -> NewTab(
            feed = feed,
            library = library,
            connection = connection,
            reach = reach,
            actions = actions,
            header = { b ->
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    HomeHeader(tab, onTab, actions, overMedia = true, newBadge = b)
                    // "3 on their way" over the player, while posts are processing.
                    if (doing != null) {
                        DoingPillHost(doing, connection.server, onSeeAll = actions.onDoing, modifier = Modifier.offset(y = (-14).dp))
                    }
                }
            },
        )
        HomeTab.Channels -> Box(Modifier.fillMaxSize().background(AdhxColors.Background)) {
            ChannelsTab(feed, connection.server, actions, header = { HomeHeader(tab, onTab, actions, overMedia = false, newBadge = badge) })
            BottomFade()
        }
        HomeTab.Live -> Box(Modifier.fillMaxSize().background(AdhxColors.Background)) {
            LiveTab(feed, connection.server, actions, header = { HomeHeader(tab, onTab, actions, overMedia = false, newBadge = badge) })
            BottomFade()
        }
    }
}

/** The pages fade into the bottom edge (48dp, over the navigation bar). */
@Composable
fun BoxScope.BottomFade() {
    Box(
        Modifier
            .align(Alignment.BottomCenter)
            .fillMaxWidth()
            .windowInsetsBottomHeight(WindowInsets.navigationBars)
            .background(AdhxColors.Background),
    )
    Box(
        Modifier
            .align(Alignment.BottomCenter)
            .navigationBarsPadding()
            .fillMaxWidth()
            .height(48.dp)
            .background(Brush.verticalGradient(listOf(AdhxColors.Background.copy(alpha = 0f), AdhxColors.Background))),
    )
}

/** The New tab's badge for the feed at [page]: only in New mode, and only while there's something to count. */
internal fun newBadge(ui: FeedUi, page: Int): String? {
    if (ui.mode != FeedMode.NEW || ui.unavailable || ui.items.isEmpty()) return null
    val left = (ui.items.size - page - 1).coerceAtLeast(0)
    return Copy.newBadge(left, more = !ui.ended)
}

/**
 * Home's top. Over the player (New) it's one row: Gob (opens Settings), the
 * tabs in the middle and Search, on a soft shadow. On the pages (Channels,
 * Live) it's two: Gob and "adhx", Search and Settings, then the tabs across
 * the whole width.
 */
@Composable
fun HomeHeader(
    tab: HomeTab,
    onTab: (HomeTab) -> Unit,
    actions: HomeActions,
    overMedia: Boolean,
    newBadge: String? = null,
) {
    if (!overMedia) {
        // The pages' tabs are plain, as on the boards: New's count is only over the player.
        PageHeader(tab, onTab, onHome = { onTab(HomeTab.New) }, onSearch = actions.onSearch, onSettings = actions.onSettings)
        return
    }
    Box(Modifier.fillMaxWidth()) {
        // The shadow under the row: 240dp from the top, black at 70% fading out.
        Box(
            Modifier
                .fillMaxWidth()
                .windowInsetsTopHeight(WindowInsets.statusBars)
                .background(Color.Black.copy(alpha = 0.7f)),
        )
        Box(
            Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .height(240.dp)
                .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.7f), Color.Transparent))),
        )
        Row(
            Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 28.dp)
                .height(52.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(44.dp)
                    .offset(x = (-7).dp)
                    .clip(CircleShape)
                    .clickable(onClickLabel = Copy.OPEN_SETTINGS, onClick = actions.onSettings)
                    .semantics { contentDescription = Copy.OPEN_SETTINGS },
                contentAlignment = Alignment.Center,
            ) {
                Image(painterResource(R.drawable.ic_gob), contentDescription = null, modifier = Modifier.size(32.dp).rotate(-4f))
            }
            Spacer(Modifier.weight(1f))
            HomeTabs(
                tab = tab,
                onTab = onTab,
                newBadge = newBadge,
                background = Color.Black.copy(alpha = 0.5f),
            )
            Spacer(Modifier.weight(1f))
            BarButton(Glyphs.Search, Copy.SEARCH, actions.onSearch)
        }
    }
}

/**
 * The pages' top (Channels, Live, a friend's saves): Gob and "adhx" (home),
 * Search and Settings, then New · Channels · Live across the whole width.
 */
@Composable
fun PageHeader(
    tab: HomeTab,
    onTab: (HomeTab) -> Unit,
    onHome: () -> Unit,
    onSearch: () -> Unit,
    onSettings: () -> Unit,
    newBadge: String? = null,
) {
    Column(Modifier.fillMaxWidth().statusBarsPadding()) {
        Row(
            Modifier
                .fillMaxWidth()
                .height(52.dp)
                .padding(start = 16.dp, end = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClickLabel = Copy.TABS[0], onClick = onHome)
                    .semantics(mergeDescendants = true) { contentDescription = "adhx home" },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Image(painterResource(R.drawable.ic_gob), contentDescription = null, modifier = Modifier.size(32.dp).rotate(-4f))
                Spacer(Modifier.width(9.dp))
                Text("adhx", fontFamily = SerifFamily, fontSize = 28.sp, lineHeight = 28.sp, color = AdhxColors.White)
            }
            Spacer(Modifier.weight(1f))
            BarButton(Glyphs.Search, Copy.SEARCH, onSearch, background = AdhxColors.Surface)
            BarButton(Glyphs.Settings, Copy.OPEN_SETTINGS, onSettings, background = AdhxColors.Surface)
        }
        HomeTabs(
            tab = tab,
            onTab = onTab,
            newBadge = newBadge,
            background = AdhxColors.Surface,
            fill = true,
            modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 4.dp).fillMaxWidth(),
        )
    }
}

/**
 * New · Channels · Live, each as wide as its label. New's count is a small
 * badge over its top-right corner, so the tab never changes width.
 */
@Composable
private fun HomeTabs(
    tab: HomeTab,
    onTab: (HomeTab) -> Unit,
    newBadge: String?,
    background: Color,
    modifier: Modifier = Modifier,
    fill: Boolean = false,
) {
    // Not clipped: the badge reaches past the pill's edge.
    Row(
        modifier
            .background(background, RoundedCornerShape(50))
            .padding(4.dp)
            .selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(if (fill) 4.dp else 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HomeTab.entries.forEach { t ->
            val on = t == tab
            val label = Copy.TABS[t.ordinal]
            val badge = newBadge.takeIf { t == HomeTab.New }
            Box(if (fill) Modifier.weight(1f) else Modifier) {
                Row(
                    (if (fill) Modifier.fillMaxWidth() else Modifier)
                        .height(if (fill) 44.dp else 40.dp)
                        .clip(RoundedCornerShape(50))
                        .background(if (on) AdhxColors.Cream else Color.Transparent)
                        .selectable(selected = on, role = Role.Tab, onClick = { onTab(t) })
                        .semantics {
                            contentDescription = if (t == HomeTab.New) Copy.newTabDescription(badge) else label
                            if (on && t == HomeTab.New) {
                                onClick(label = Copy.FILTER_TITLE) {
                                    onTab(t)
                                    true
                                }
                            }
                        }
                        .padding(horizontal = if (t == HomeTab.New) 16.dp else 14.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (t == HomeTab.Live) {
                        // On the pages the dot has a soft red ring.
                        Box(
                            Modifier
                                .size(if (fill) 13.dp else 7.dp)
                                .then(if (fill) Modifier.background(AdhxColors.Live.copy(alpha = 0.25f), CircleShape).padding(3.dp) else Modifier)
                                .clip(CircleShape)
                                .background(AdhxColors.Live),
                        )
                        Spacer(Modifier.width(if (fill) 4.dp else 6.dp))
                    }
                    Text(
                        label,
                        fontSize = 15.sp,
                        fontWeight = if (on) FontWeight.ExtraBold else FontWeight.SemiBold,
                        color = if (on) AdhxColors.Black else AdhxColors.Cream,
                        maxLines = 1,
                        softWrap = false,
                        modifier = Modifier.clearAndSetSemantics { },
                    )
                }
                if (badge != null) {
                    Box(
                        Modifier
                            .align(Alignment.TopEnd)
                            .offset(x = 8.dp, y = (-9).dp)
                            .height(20.dp)
                            .defaultMinSize(minWidth = 20.dp)
                            .background(Color.Black, RoundedCornerShape(50))
                            .padding(2.dp)
                            .background(AdhxColors.Accent, RoundedCornerShape(50))
                            .padding(horizontal = 3.dp)
                            .clearAndSetSemantics { },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            badge,
                            fontSize = 11.sp,
                            lineHeight = 11.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Color.Black,
                            maxLines = 1,
                            softWrap = false,
                        )
                    }
                }
            }
        }
    }
}
