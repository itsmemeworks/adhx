'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { LiveDot } from '@/components/matter'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import { theaterItemKey } from '@/components/theater/types'
import { useTheaterFeed } from '@/components/theater/useTheaterFeed'
import { type FilterId, FILTERS, applyFilter, filterToPath } from '@/lib/trending/filter'
import { rankItems } from '@/lib/trending/rank'
import { TrendingListHeader } from './TrendingListHeader'
import { TrendingRankedRow, trendingItemKey } from './TrendingRankedRow'

/**
 * /trending's visual surface — Phase 3 of theater-first.md (§1, §3): the
 * "Browse as list" escape hatch from the theater, restyled dark/Digg-style.
 * ROUTES and SEO are unchanged (the pages still server-render
 * `TrendingStaticList` + JSON-LD identically); only what mounts on top of
 * that crawlable HTML changes, from the light card grid (`DiscoverFeed`) to
 * this dark ranked list.
 *
 * "Ranked" here means "Top today" semantics: sort by `trendCount` desc,
 * newest as the tiebreak (see `rankItems`) — distinct from the theater's
 * Up-next rail, which is pure recency. The Latest/Popular/Videos/ etc.
 * filter pills still apply on top of that base ranking (mirrors
 * `applyFilter` from src/lib/trending/filter.ts so crawlable HTML and the
 * hydrated list never disagree on what a lens shows).
 */

export { rankItems }

function dedupeByPost(items: TheaterItem[]): TheaterItem[] {
  const byKey = new Map<string, TheaterItem>()
  for (const it of items) {
    const k = theaterItemKey(it)
    const prev = byKey.get(k)
    if (!prev) {
      byKey.set(k, it)
    } else {
      byKey.set(k, {
        ...prev,
        saveCount: Math.max(prev.saveCount ?? 0, it.saveCount ?? 0),
        trendCount: Math.max(prev.trendCount ?? 0, it.trendCount ?? 0),
        contentType: prev.contentType ?? it.contentType,
        thumbnailUrl: prev.thumbnailUrl ?? it.thumbnailUrl,
        authorAvatarUrl: prev.authorAvatarUrl ?? it.authorAvatarUrl,
      })
    }
  }
  return [...byKey.values()]
}

export function TrendingRankedList({
  seed,
  initialFilter = 'latest',
}: {
  seed: TheaterFeedSeed
  initialFilter?: FilterId
}) {
  const { items, savedToday, freshKeys } = useTheaterFeed(seed)
  const [filter, setFilter] = useState<FilterId>(initialFilter)
  const mountedRef = useRef(false)

  // Reflect the selected pill in the URL (tidy path), mirroring DiscoverFeed —
  // shareable + a fresh load of /trending/<filter> seeds that filter server-side.
  useEffect(() => {
    if (!mountedRef.current) {
      // Skip the replace on first mount: the URL already matches initialFilter
      // (it's how the page got its seed), and history.replaceState this early
      // can fight Next's own initial history entry.
      mountedRef.current = true
      return
    }
    window.history.replaceState(null, '', filterToPath(filter))
  }, [filter])

  const selectFilter = useCallback((id: FilterId) => setFilter(id), [])

  const ranked = rankItems(dedupeByPost(items))
  const visible = applyFilter(ranked, filter)

  return (
    <div className="min-h-screen bg-[#08070a] text-white/90">
      <TrendingListHeader
        status={
          <span className="inline-flex items-center gap-2">
            <LiveDot />
            <span className="text-[12.5px] font-semibold text-white/60" suppressHydrationWarning>
              {savedToday > 0 ? `${savedToday.toLocaleString()} saved today` : 'Live'}
            </span>
          </span>
        }
        links={[
          { href: '/leaderboard', label: 'Leaderboard →' },
          { href: '/', label: 'Watch as theater →' },
        ]}
      />

      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap gap-2 px-4 pb-1 pt-4 sm:px-6">
          {FILTERS.map((f) => {
            const active = f.id === filter
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => selectFilter(f.id)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-150',
                  active
                    ? 'bg-white text-black'
                    : 'border border-white/15 bg-white/[0.04] text-white/60 hover:text-white',
                )}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {visible.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center px-4">
            <p className="text-center text-[15px] text-white/40">
              <span>Nothing happening yet</span>
            </p>
          </div>
        ) : (
          <ol className="mt-2">
            {visible.map((item, i) => (
              <li key={trendingItemKey(item)}>
                <TrendingRankedRow
                  item={item}
                  rank={i + 1}
                  fresh={freshKeys.has(trendingItemKey(item))}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
