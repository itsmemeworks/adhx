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
 * a public tag collection (`/t/{username}/{tag}` — tag-collections-as-
 * theater), or the authed Collection's triage queue (`unified-theater-
 * triage.md` §2). Collection mode loops (advancing past the last item wraps
 * to the first, and vice versa) and never enters the end-of-feed waiting
 * stage. Triage mode is an overlay over `/` with its own Done/Later/Delete
 * queue (never live, never loops, never rewrites the URL) plus a
 * Collection ↔ Live sub-tab that blends in the same live pulse feed home
 * mode uses.
 */
export type TheaterMode = 'home' | 'shared' | 'collection' | 'triage'

/** Triage mode's Collection ↔ Live sub-tab (unified-theater-triage.md §2). */
export type TriageTab = 'collection' | 'live'

/** Identity + loop metadata for a public tag collection theater (mode `'collection'`). */
export interface TheaterCollectionMeta {
  /** The (sanitized) tag name, e.g. `claude-code`. */
  tag: string
  /** The curator's username. */
  curator: string
  /** Number of posts in the collection — drives the "Save collection · N" CTA label. */
  count: number
}

/** Save-collection CTA status, shared by the desktop and mobile chrome. */
export type SaveCollectionStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Bundled triage-mode chrome contract (unified-theater-triage.md §2) —
 * passed as a single optional prop to `DesktopStageChrome`/
 * `TheaterMobileChrome`/`DesktopDock` instead of a dozen separate ones.
 * Present only when `mode === 'triage'`.
 */
export interface TheaterTriageChrome {
  tab: TriageTab
  onTabChange: (tab: TriageTab) => void
  /** Done: mark read + advance (Collection tab only). */
  onDone: () => void
  /** Later: advance without changing read state (Collection tab only). */
  onLater: () => void
  /** Delete: 5s undo window, then DELETE (Collection tab only). */
  onDelete: () => void
  /** Open the TagQuickPicker for the current item (Collection tab only). */
  onTag: () => void
  /** Current Collection-tab item's tags (unified-theater-triage.md §B) — display-only chip rendering, kept live by TheaterShell's `bookmark-tags-changed` listener. Undefined/empty renders nothing. */
  tags?: string[]
  /** Save the current Live-tab item to the collection. */
  onSave: (item: TheaterItem) => void
  /** Live tab: tag a community post — saves it first when not yet in the collection, then opens the tag picker. */
  onLiveTag?: (item: TheaterItem) => void
  savedKeys: ReadonlySet<string>
  /** Items left in the Collection queue. */
  remaining: number
  streak: { current: number; longest: number }
  /** Closes the whole triage overlay. */
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
