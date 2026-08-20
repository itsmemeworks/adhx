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
 * or a public tag collection (`/t/{username}/{tag}` — tag-collections-as-
 * theater). Collection mode loops (advancing past the last item wraps to the
 * first, and vice versa) and never enters the end-of-feed waiting stage.
 */
export type TheaterMode = 'home' | 'shared' | 'collection'

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
