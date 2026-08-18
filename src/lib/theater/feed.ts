/**
 * STUB — implemented by the theater-shell agent (spec §4).
 * Server-side seed for the theater: `getTrendingItems()` plus backfill so the
 * theater never opens empty (if < 12 items, append top saved posts from
 * PUBLIC tags — already crawlable/public — mapped into the TrendingItem shape).
 * Must go through anonymity-safe reads only; never selects any userId.
 */

import { getTrendingItems } from '@/lib/trending/query'
import type { TheaterFeedSeed } from '@/components/theater/types'

export const THEATER_MIN_ITEMS = 12

export async function getTheaterFeed(): Promise<TheaterFeedSeed> {
  const { items, savedToday, recentActivity } = await getTrendingItems()
  return { items, savedToday, recentActivity }
}
