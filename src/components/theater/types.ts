import type { TrendingItem } from '@/lib/trending/query'

export type { TextLinkRef, TheaterQuoteRef } from '@/lib/trending/query'

/**
 * Shared contract for the theater surfaces (docs/specs/theater-first.md).
 *
 * The theater renders `TrendingItem`s from the anonymity-safe choke point
 * (`getTrendingItems()`) — it deliberately adds NO fields of its own, so no
 * new read path can leak anything the pulse doesn't already expose.
 */
export type TheaterItem = TrendingItem

/**
 * Stable identity for a post across polls and surfaces. Matches the dedup key
 * used by `getTrendingItems()` / `DiscoverFeed` (`platform:bookmarkId`, URL
 * fallback for rows without a source id).
 */
export function theaterItemKey(item: Pick<TheaterItem, 'platform' | 'bookmarkId' | 'url'>): string {
  return `${item.platform}:${item.bookmarkId || item.url}`
}

/**
 * Which rail the theater carries: signed-out home, a shared preview (PR 3),
 * a public playlist (one shared tag, `/t/{username}/{tag}` — playlists-as-
 * theater), or the authed Collection's collection queue (`unified-theater-
 * collection.md` §2). Collection mode loops (advancing past the last item wraps
 * to the first, and vice versa) and never enters the end-of-feed waiting
 * stage. Collection mode is an overlay over `/` with its own Done/Later/Delete
 * queue (never live, never loops, never rewrites the URL) plus a
 * Collection ↔ Live sub-tab that blends in the same live pulse feed home
 * mode uses.
 */
export type TheaterMode = 'home' | 'shared' | 'playlist' | 'personal'

/** Collection mode's Collection ↔ Live sub-tab (unified-theater-collection.md §2).
 * Internal values are unchanged (plumbed through TheaterShell, AuthedHome,
 * and the Header's `open-theater` dispatches) — only display order/label
 * changed: Live reads first and is the default landing tab, "Collection" is
 * labeled "My Collection" so it's clear it's the viewer's own, not a shared
 * one. See `PERSONAL_TAB_ORDER`/`PERSONAL_TAB_LABEL` below for the chrome's
 * single source of truth for both. */
export type PersonalTab = 'collection' | 'live'

/**
 * Spotify-style repeat control (mobile round 8): 'off' waits for new content
 * at the end of the queue, 'all' loops the whole queue, 'one' repeats the
 * current post. Owned by TheaterShell; the chromes render the cycling button.
 */
export type RepeatMode = 'off' | 'all' | 'one'

/**
 * What each repeat state DOES at the end of the unwatched run — which is the
 * decision the control actually makes, and what the old labels ("Repeat: off")
 * failed to say. Auto-advance stops at that boundary rather than replaying
 * watched posts, so "off" means "stop when caught up" and "all" means "keep
 * going". Owner asked whether the boundary needed its own switch; it doesn't —
 * this control IS the switch, it just wasn't named like one.
 *
 * Lives here rather than in either chrome so the two can't drift apart.
 */
export const REPEAT_MODE_LABEL: Record<
  RepeatMode,
  { action: string; state: string; queue: string }
> = {
  off: {
    action: 'Stop when caught up',
    state: 'Stops when you’re caught up',
    queue: 'Stops when caught up',
  },
  all: {
    action: 'Keep playing',
    state: 'Keeps playing — watched posts too, then round again',
    queue: 'Keeps playing',
  },
  one: {
    action: 'Repeat this post',
    state: 'Repeating this post',
    queue: 'Repeating this post',
  },
}

/** Left-to-right render order for the Live/My-Collection tab switcher —
 * Live first, matching the default in TheaterShell's `useState`. */
export const PERSONAL_TAB_ORDER: readonly PersonalTab[] = ['live', 'collection']

/** Display labels for the tab switcher (desktop top bar + mobile peek bar) —
 * "My Collection" rather than a bare "Collection" so it reads as the
 * viewer's own saved posts, not a shared/public one. */
export const PERSONAL_TAB_LABEL: Record<PersonalTab, string> = {
  live: 'Live',
  collection: 'My Collection',
}

/** Identity + loop metadata for a public playlist theater (a shared tag — mode `'playlist'`). */
export interface TheaterPlaylistMeta {
  /** The (sanitized) tag name, e.g. `claude-code`. */
  tag: string
  /** The curator's username. */
  curator: string
  /** Number of posts in the playlist — drives the "Save playlist · N" CTA label. */
  count: number
}

/** Save-collection CTA status, shared by the desktop and mobile chrome. */
export type SavePlaylistStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Bundled collection-mode chrome contract (unified-theater-collection.md §2) —
 * passed as a single optional prop to `DesktopStageChrome`/
 * `TheaterMobileChrome`/`DesktopDock` instead of a dozen separate ones.
 * Present only when `mode === 'personal'`.
 */
export interface TheaterPersonalChrome {
  tab: PersonalTab
  onTabChange: (tab: PersonalTab) => void
  /** Done: mark read + advance (Collection tab only). */
  onDone: () => void
  /** Later: advance without changing read state (Collection tab only). */
  onLater: () => void
  /** Delete: 5s undo window, then DELETE (Collection tab only). */
  onDelete: () => void
  /** Open the TagQuickPicker for the current item (Collection tab only). */
  onTag: () => void
  /** Current Collection-tab item's tags (unified-theater-collection.md §B) — display-only chip rendering, kept live by TheaterShell's `bookmark-tags-changed` listener. Undefined/empty renders nothing. */
  tags?: string[]
  /** Save the current Live-tab item to the collection. */
  onSave: (item: TheaterItem) => void
  /** Live tab: tag a community post — saves it first when not yet in the collection, then opens the tag picker. */
  onLiveTag?: (item: TheaterItem) => void
  savedKeys: ReadonlySet<string>
  /** Items left in the Collection queue. */
  remaining: number
  /** Closes the whole collection overlay. */
  onClose: () => void
}

/** Human platform label for "Open on {platform}" titles — shared by the desktop chrome, mobile chrome, and `CollectionRail`. */
export const PLATFORM_LABEL: Record<string, string> = {
  twitter: 'X',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
}

/** Server-rendered seed for the shell — same items as the crawlable list. */
export interface TheaterFeedSeed {
  items: TheaterItem[]
  savedToday: number
  recentActivity: number
}
