import type { TrendingItem } from '@/lib/trending/query'

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

/** Which rail the theater carries: signed-out home vs a shared preview (PR 3). */
export type TheaterMode = 'home' | 'shared'

/** Server-rendered seed for the shell — same items as the crawlable list. */
export interface TheaterFeedSeed {
  items: TheaterItem[]
  savedToday: number
  recentActivity: number
}
