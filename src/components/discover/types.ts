import type { TrendingItem } from '@/lib/trending/query'

/**
 * The Discover/Trending item shape — the canonical, anonymity-safe public item
 * from the trending query module (carries NO `userId`). Kept under the
 * historical `ActivityItem` name so `DiscoverCard` and other call sites
 * keep importing it unchanged.
 */
export type ActivityItem = TrendingItem
