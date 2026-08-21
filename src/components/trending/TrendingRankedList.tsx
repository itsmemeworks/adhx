'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MatterLogo,
  LiveDot,
  PlatformGlyph,
  TYPE_META,
  type ContentType,
} from '@/components/matter'
import { formatCompactRelativeTime } from '@/lib/utils/format'
import { previewPath } from '@/lib/activity/preview-path'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import { theaterItemKey } from '@/components/theater/types'
import { useTheaterFeed } from '@/components/theater/useTheaterFeed'
import { type FilterId, FILTERS, applyFilter, filterToPath, inferType } from '@/lib/trending/filter'

/**
 * /trending's visual surface — Phase 3 of theater-first.md (§1, §3): the
 * "Browse as list" escape hatch from the theater, restyled dark/Digg-style.
 * ROUTES and SEO are unchanged (the pages still server-render
 * `TrendingStaticList` + JSON-LD identically); only what mounts on top of
 * that crawlable HTML changes, from the light card grid (`DiscoverFeed`) to
 * this dark ranked list.
 *
 * "Ranked" here means "Top today" semantics: sort by `trendCount` desc,
 * newest as the tiebreak (see `rankItems` below) — distinct from the
 * theater's Up-next rail, which is pure recency. The Latest/Popular/Videos/
 * etc. filter pills still apply on top of that base ranking (mirrors
 * `applyFilter` from src/lib/trending/filter.ts so crawlable HTML and the
 * hydrated list never disagree on what a lens shows).
 */

/** Same identity used everywhere else in the pulse: platform + source id (URL fallback). */
function keyOf(item: TheaterItem): string {
  return theaterItemKey(item)
}

/**
 * On-ADHX preview path for an item — deliberately re-implemented from the
 * dependency-free `previewPath()` rather than importing `itemHref` from
 * `TrendingStaticList.tsx`: that module also imports from
 * `@/lib/activity/record` (server-only, drags in better-sqlite3), which is
 * fine for a server component but breaks the client bundle for this one.
 */
function itemHref(item: TheaterItem): string {
  if (item.bookmarkId) return previewPath(item.platform, item.author, item.bookmarkId)
  return item.url
}

function dedupeByPost(items: TheaterItem[]): TheaterItem[] {
  const byKey = new Map<string, TheaterItem>()
  for (const it of items) {
    const k = keyOf(it)
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

/**
 * Pure ranking rule for the list ("Top today"): highest `trendCount` first,
 * ties broken by newest `createdAt`. Exported so it's unit-testable without
 * mounting the component or a fetch/timer harness.
 */
export function rankItems(items: TheaterItem[]): TheaterItem[] {
  return [...items].sort((a, b) => {
    const d = (b.trendCount ?? 0) - (a.trendCount ?? 0)
    if (d !== 0) return d
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

const PLATFORM_LABEL: Record<string, string> = {
  twitter: 'X',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
}

function RankedRow({ item, rank, fresh }: { item: TheaterItem; rank: number; fresh: boolean }) {
  const type = inferType(item) as ContentType
  const meta = TYPE_META[type]
  const title = item.text || item.authorName || (item.author ? `@${item.author}` : 'Saved post')
  const trend = item.trendCount ?? 0

  return (
    <Link
      href={itemHref(item)}
      className={cn(
        'group flex items-start gap-4 border-b border-white/[0.06] px-4 py-4 transition-colors sm:px-5',
        'hover:bg-white/[0.03]',
        fresh && 'bg-clay/[0.08]',
      )}
    >
      <span className="w-7 flex-none pt-0.5 text-right font-mono text-[15px] tabular-nums text-white/35 sm:w-9 sm:text-[17px]">
        {rank}
      </span>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[14.5px] font-medium leading-snug text-white/90 sm:text-[15.5px]">
          {title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-white/45">
          <span className="inline-flex items-center gap-1">
            <PlatformGlyph platform={item.platform} size={12} className="text-white/50" />
            {PLATFORM_LABEL[item.platform] ?? item.platform}
          </span>
          <span aria-hidden>·</span>
          <span suppressHydrationWarning>{formatCompactRelativeTime(item.createdAt)}</span>
          {meta ? (
            <>
              <span aria-hidden>·</span>
              <span>{meta.label}</span>
            </>
          ) : null}
          {trend >= 2 ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 text-flame">
                <Flame size={12} fill="currentColor" />
                {trend}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="h-14 w-14 flex-none overflow-hidden rounded-md bg-white/[0.06] sm:h-16 sm:w-16">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className={cn('flex h-full w-full items-center justify-center', meta?.dot)}>
            <PlatformGlyph platform={item.platform} size={18} className="text-white/70" />
          </div>
        )}
      </div>
    </Link>
  )
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
      <header className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-6">
        <Link href="/" aria-label="ADHX home" className="[&_span]:text-white">
          <MatterLogo size={19} />
        </Link>
        <span className="ml-2 inline-flex items-center gap-2">
          <LiveDot />
          <span className="text-[12.5px] font-semibold text-white/60" suppressHydrationWarning>
            {savedToday > 0 ? `${savedToday.toLocaleString()} saved today` : 'Live'}
          </span>
        </span>
        <Link
          href="/leaderboard"
          className="ml-auto text-[13px] font-semibold text-white/60 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white"
        >
          Leaderboard →
        </Link>
        <Link
          href="/"
          className="text-[13px] font-semibold text-white/60 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white"
        >
          Watch as theater →
        </Link>
      </header>

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
            <p className="text-center text-[15px] text-white/40">Nothing happening yet</p>
          </div>
        ) : (
          <ol className="mt-2">
            {visible.map((item, i) => (
              <li key={keyOf(item)}>
                <RankedRow item={item} rank={i + 1} fresh={freshKeys.has(keyOf(item))} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
