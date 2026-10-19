package com.adhx.share.feed

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
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
import com.adhx.share.library.BarButton
import com.adhx.share.library.LibraryViewModel
import com.adhx.share.library.Route
import com.adhx.share.main.Reach
import com.adhx.share.net.FeedMode
import com.adhx.share.net.Saver
import com.adhx.share.ui.AdhxColors
import com.adhx.share.ui.Copy

/** What every tab of home can do: open a screen, or open a person's channel. */
class HomeActions(
    val open: (Route) -> Unit,
    val openPerson: (Saver) -> Unit,
    val onSearch: () -> Unit,
    val onSettings: () -> Unit,
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
            header = { b -> HomeHeader(tab, onTab, actions, overMedia = true, newBadge = b) },
        )
        HomeTab.Channels -> Box(Modifier.fillMaxSize().background(AdhxColors.Background)) {
            ChannelsTab(feed, connection.server, actions, header = { HomeHeader(tab, onTab, actions, overMedia = false, newBadge = badge) })
        }
        HomeTab.Live -> Box(Modifier.fillMaxSize().background(AdhxColors.Background)) {
            LiveTab(feed, connection.server, actions, header = { HomeHeader(tab, onTab, actions, overMedia = false, newBadge = badge) })
        }
    }
}

/** The New tab's badge for the feed at [page]: only in New mode, and only while there's something to count. */
internal fun newBadge(ui: FeedUi, page: Int): String? {
    if (ui.mode != FeedMode.NEW || ui.unavailable || ui.items.isEmpty()) return null
    val left = (ui.items.size - page - 1).coerceAtLeast(0)
    return Copy.newBadge(left, more = !ui.ended)
}

/**
 * The one row: Gob (opens Settings) on the left, the tabs in the middle and
 * Search on the right. Over the player it sits on a soft shadow.
 */
@Composable
fun HomeHeader(
    tab: HomeTab,
    onTab: (HomeTab) -> Unit,
    actions: HomeActions,
    overMedia: Boolean,
    newBadge: String? = null,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .then(
                if (overMedia) {
                    Modifier.background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.65f), Color.Transparent)))
                } else {
                    Modifier
                },
            )
            .statusBarsPadding()
            .padding(start = 8.dp, end = 12.dp, top = 6.dp, bottom = if (overMedia) 24.dp else 6.dp)
            .height(52.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(48.dp)
                .clip(CircleShape)
                .clickable(onClickLabel = Copy.OPEN_SETTINGS, onClick = actions.onSettings)
                .semantics { contentDescription = Copy.OPEN_SETTINGS },
            contentAlignment = Alignment.Center,
        ) {
            Image(painterResource(R.drawable.ic_gob), contentDescription = null, modifier = Modifier.size(30.dp).rotate(-4f))
        }
        Spacer(Modifier.weight(1f))
        HomeTabs(
            tab = tab,
            onTab = onTab,
            newBadge = newBadge,
            background = if (overMedia) Color.Black.copy(alpha = 0.5f) else AdhxColors.Surface,
            modifier = Modifier.weight(8f, fill = false),
        )
        Spacer(Modifier.weight(1f))
        BarButton(Icons.Filled.Search, Copy.SEARCH, actions.onSearch)
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
) {
    // Not clipped: the badge reaches past the pill's edge.
    Row(
        modifier
            .background(background, RoundedCornerShape(50))
            .padding(4.dp)
            .selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HomeTab.entries.forEach { t ->
            val on = t == tab
            val label = Copy.TABS[t.ordinal]
            val badge = newBadge.takeIf { t == HomeTab.New }
            Box {
                Row(
                    Modifier
                        .height(40.dp)
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
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (t == HomeTab.Live) {
                        Box(Modifier.size(7.dp).clip(CircleShape).background(AdhxColors.Live))
                        Spacer(Modifier.width(6.dp))
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
                    Text(
                        badge,
                        fontSize = 11.sp,
                        lineHeight = 11.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.Black,
                        maxLines = 1,
                        softWrap = false,
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .offset(x = 8.dp, y = (-9).dp)
                            .border(2.dp, Color.Black, RoundedCornerShape(50))
                            .padding(2.dp)
                            .background(AdhxColors.Accent, RoundedCornerShape(50))
                            .defaultMinSize(minWidth = 16.dp)
                            .padding(horizontal = 4.dp, vertical = 2.5.dp)
                            .clearAndSetSemantics { },
                    )
                }
            }
        }
    }
}
