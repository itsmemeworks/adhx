'use client'

/**
 * Live feed for the theater (spec §4). Seeded from the server render (same
 * items as the crawlable `sr-only` list), then polls `GET /api/activity`
 * every 12s — the same anonymous, cached endpoint the Discover grid and the
 * trending Reel already poll.
 *
 * The merge is deliberately conservative: a genuinely new key inserts at the
 * TOP of the list and is reported via `freshKeys` (for the rail's accent
 * treatment); every item that was already in the list keeps its exact object
 * reference and position so an in-flight `<video>` never gets disturbed by a
 * poll tick. The merge itself is exported as a pure function (`mergeFeedItems`)
 * so it's unit-testable without a fetch/timer harness.
 */

import { useEffect, useRef, useState } from 'react'
import type { TheaterFeedSeed, TheaterItem } from './types'
import { theaterItemKey } from './types'

const POLL_MS = 12_000
const FETCH_TIMEOUT_MS = 10_000

export interface TheaterFeed {
  items: TheaterItem[]
  savedToday: number
  recentActivity: number
  /** Keys of items that arrived via polling after mount (accent treatment). */
  freshKeys: ReadonlySet<string>
}

interface ActivityResponse {
  items?: TheaterItem[]
  savedToday?: number
  recentActivity?: number
}

/**
 * Merge a poll response into the current item list. Pure — no fetch, no
 * timers. Unknown keys NEWER than the current top are genuinely fresh: they
 * prepend and are collected into `freshKeys` (accent treatment). Unknown keys
 * that are OLDER (e.g. the poll window differs from the seed, or an item
 * re-enters the API's dedup window) append quietly at the bottom instead —
 * an old post must never surface at the top of Up next as "new". Everything
 * already in `prev` is returned untouched (same order, same object refs).
 */
export function mergeFeedItems(
  prev: TheaterItem[],
  next: TheaterItem[],
): { items: TheaterItem[]; freshKeys: string[] } {
  const prevKeys = new Set(prev.map(theaterItemKey))
  const topTime = prev.length > 0 ? new Date(prev[0].createdAt).getTime() : -Infinity
  const freshKeys: string[] = []
  const fresh: TheaterItem[] = []
  const older: TheaterItem[] = []

  for (const item of next) {
    const key = theaterItemKey(item)
    if (prevKeys.has(key)) continue
    const t = new Date(item.createdAt).getTime()
    if (Number.isFinite(t) && t > topTime) {
      freshKeys.push(key)
      fresh.push(item)
    } else {
      older.push(item)
    }
  }

  if (fresh.length === 0 && older.length === 0) return { items: prev, freshKeys }
  return { items: [...fresh, ...prev, ...older], freshKeys }
}

export interface UseTheaterFeedOptions {
  /**
   * Whether to poll `/api/activity` for fresh pulse items. Defaults to
   * `true`. Collection mode (`/t/{username}/{tag}`) passes `false` — a
   * public tag collection is a fixed, curated queue to loop through, not a
   * live blend with the anonymous community pulse.
   */
  live?: boolean
}

export function useTheaterFeed(
  seed: TheaterFeedSeed,
  options?: UseTheaterFeedOptions,
): TheaterFeed {
  const live = options?.live ?? true
  const [items, setItems] = useState<TheaterItem[]>(seed.items)
  const [savedToday, setSavedToday] = useState(seed.savedToday)
  const [recentActivity, setRecentActivity] = useState(seed.recentActivity)
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set())

  // Kept in sync so the poll always merges against the latest list without
  // making the interval effect depend on (and re-schedule around) `items`.
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    if (!live) return
    let cancelled = false

    const poll = async () => {
      // Pause while the tab isn't visible — no point spending the request.
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const res = await fetch('/api/activity', { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
        if (!res.ok) return
        const data: ActivityResponse = await res.json()
        if (cancelled || !Array.isArray(data.items)) return

        const { items: merged, freshKeys: newFresh } = mergeFeedItems(itemsRef.current, data.items)
        if (merged !== itemsRef.current) setItems(merged)
        if (newFresh.length) {
          setFreshKeys((prev) => {
            const next = new Set(prev)
            newFresh.forEach((key) => next.add(key))
            return next
          })
        }
        if (typeof data.savedToday === 'number') setSavedToday(data.savedToday)
        if (typeof data.recentActivity === 'number') setRecentActivity(data.recentActivity)
      } catch {
        // Transient (network/abort/parse) — keep the current list, try again
        // next tick.
      }
    }

    const id = window.setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [live])

  return { items, savedToday, recentActivity, freshKeys }
}
