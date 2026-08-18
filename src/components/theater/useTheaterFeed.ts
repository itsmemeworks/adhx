'use client'

/**
 * STUB — implemented by the theater-hooks agent (spec §4).
 * Seeded from the server render, then polls `/api/activity` every 12s.
 * New items insert at the top; existing item object identity is preserved
 * where possible so playback isn't disturbed.
 */

import type { TheaterFeedSeed, TheaterItem } from './types'

export interface TheaterFeed {
  items: TheaterItem[]
  savedToday: number
  recentActivity: number
  /** Keys of items that arrived via polling after mount (accent treatment). */
  freshKeys: ReadonlySet<string>
}

export function useTheaterFeed(seed: TheaterFeedSeed): TheaterFeed {
  return {
    items: seed.items,
    savedToday: seed.savedToday,
    recentActivity: seed.recentActivity,
    freshKeys: new Set(),
  }
}
