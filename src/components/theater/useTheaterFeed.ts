'use client'

/**
 * Live feed for the theater (spec §4). Seeded from the server render (same
 * items as the crawlable `sr-only` list), then polls `GET /api/activity`
 * every 12s — the same anonymous, cached endpoint the Discover grid and the
 * trending Reel already poll.
 *
 * The merge is deliberately conservative: a genuinely new key inserts at the
 * TOP of the list and is reported via `freshKeys` (for the rail's accent
 * treatment). Existing items keep their object reference unless the poll can
 * fill display metadata the seed lacked (notably an article cover/title from
 * a sparse public-tag backfill); their position and playback identity never
 * change. The merge itself is exported as a pure function (`mergeFeedItems`)
 * so it's unit-testable without a fetch/timer harness.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TheaterFeedSeed, TheaterItem } from './types'
import { theaterItemKey } from './types'
import { fetchWithTimeout } from '@/lib/utils/fetch-timeout'

const POLL_MS = 12_000
const FETCH_TIMEOUT_MS = 10_000

export interface TheaterFeed {
  items: TheaterItem[]
  savedToday: number
  recentActivity: number
  /** Keys of items that arrived via polling after mount (accent treatment). */
  freshKeys: ReadonlySet<string>
  /**
   * Optimistic insert after a personal-theater paste-to-save. Moves an
   * already-present post to the front. Same-tab paste then jumps current
   * onto that post; a second-window prepend does not.
   */
  prependItem: (item: TheaterItem) => void
  /** Replace an existing key in place (shared-preview stub → resolved post). */
  replaceItem: (item: TheaterItem) => void
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
 * already in `prev` keeps its order and is only replaced when the poll fills
 * missing display metadata.
 */
function isBareUrl(value: string | null | undefined): boolean {
  return /^https?:\/\/\S+$/i.test((value || '').trim())
}

function enrichExistingItem(existing: TheaterItem, incoming: TheaterItem): TheaterItem {
  const thumbnailUrl = existing.thumbnailUrl || incoming.thumbnailUrl || null
  const contentType = existing.contentType || incoming.contentType
  const authorName = existing.authorName || incoming.authorName || null
  const authorAvatarUrl = existing.authorAvatarUrl || incoming.authorAvatarUrl || null
  const textLinks =
    existing.textLinks?.length || !incoming.textLinks?.length
      ? existing.textLinks
      : incoming.textLinks
  const text =
    contentType === 'article' &&
    incoming.text &&
    (!existing.text || (isBareUrl(existing.text) && !isBareUrl(incoming.text)))
      ? incoming.text
      : existing.text

  if (
    thumbnailUrl === (existing.thumbnailUrl ?? null) &&
    contentType === existing.contentType &&
    authorName === (existing.authorName ?? null) &&
    authorAvatarUrl === (existing.authorAvatarUrl ?? null) &&
    textLinks === existing.textLinks &&
    text === existing.text
  ) {
    return existing
  }

  return {
    ...existing,
    thumbnailUrl,
    contentType,
    authorName,
    authorAvatarUrl,
    textLinks,
    text,
  }
}

export function mergeFeedItems(
  prev: TheaterItem[],
  next: TheaterItem[],
): { items: TheaterItem[]; freshKeys: string[] } {
  const prevKeys = new Set(prev.map(theaterItemKey))
  const topTime = prev.length > 0 ? new Date(prev[0].createdAt).getTime() : -Infinity
  const freshKeys: string[] = []
  const fresh: TheaterItem[] = []
  const older: TheaterItem[] = []
  const incomingByKey = new Map(next.map((item) => [theaterItemKey(item), item]))
  let enriched = false
  const retained = prev.map((item) => {
    const incoming = incomingByKey.get(theaterItemKey(item))
    if (!incoming) return item
    const merged = enrichExistingItem(item, incoming)
    if (merged !== item) enriched = true
    return merged
  })

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

  if (fresh.length === 0 && older.length === 0 && !enriched) return { items: prev, freshKeys }
  return { items: [...fresh, ...retained, ...older], freshKeys }
}

/**
 * Swap the object at `key` (same position, same neighbors). Used when a
 * shared-preview stub is replaced by the resolved FxTwitter / mirror item
 * so the lead keeps its pin without looking like a fresh arrival.
 */
export function replaceFeedItem(prev: TheaterItem[], item: TheaterItem): TheaterItem[] {
  const key = theaterItemKey(item)
  const idx = prev.findIndex((existing) => theaterItemKey(existing) === key)
  if (idx === -1) return [item, ...prev]
  if (prev[idx] === item) return prev
  const next = prev.slice()
  next[idx] = item
  return next
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
        const res = await fetchWithTimeout('/api/activity', FETCH_TIMEOUT_MS)
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

    // Poll as soon as Live is enabled — empty seed (Saved→Live) and a
    // return from Saved both need arrivals now, not after 12s.
    void poll()

    const id = window.setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [live])

  const prependItem = useCallback((item: TheaterItem) => {
    const key = theaterItemKey(item)
    setItems((prev) => {
      if (prev.some((existing) => theaterItemKey(existing) === key)) {
        return [item, ...prev.filter((existing) => theaterItemKey(existing) !== key)]
      }
      return [item, ...prev]
    })
    setFreshKeys((prev) => new Set(prev).add(key))
  }, [])

  const replaceItem = useCallback((item: TheaterItem) => {
    setItems((prev) => replaceFeedItem(prev, item))
  }, [])

  return { items, savedToday, recentActivity, freshKeys, prependItem, replaceItem }
}
