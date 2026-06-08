'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { LiveDot, MatterLogo, ConnectWithX } from '@/components/matter'
import { ThemeToggle } from '@/components/ThemeToggle'
import { DiscoverCard } from './DiscoverCard'
import type { TrendingItem } from '@/lib/trending/query'
import { type FilterId, FILTERS, applyFilter, filterToPath } from '@/lib/trending/filter'

/**
 * The Discover/Trending item shape — the canonical, anonymity-safe public item
 * from the trending query module (carries NO `userId`). Re-exported under the
 * historical `ActivityItem` name so `DiscoverCard` (and existing call sites)
 * keep importing it from here unchanged.
 */
export type ActivityItem = TrendingItem

/**
 * The true identity of a post — platform + source id. Keys off this (not the
 * URL) so the same post recorded under slightly different URLs (e.g. an old
 * `/@@handle` vs the fixed `/@handle`) still collapses to one card.
 */
function postKey(item: ActivityItem): string {
  return item.bookmarkId ? `${item.platform}:${item.bookmarkId}` : item.url
}

/**
 * One card per post. The API can return several events for the same post
 * (previewed then saved, or differing URLs), so collapse by identity — keeping
 * the first (newest) event but the best save count / type / thumbnail seen.
 */
function dedupeByPost(items: ActivityItem[]): ActivityItem[] {
  const byPost = new Map<string, ActivityItem>()
  for (const it of items) {
    const k = postKey(it)
    const prev = byPost.get(k)
    if (!prev) {
      byPost.set(k, it)
    } else {
      prev.saveCount = Math.max(prev.saveCount ?? 0, it.saveCount ?? 0)
      prev.trendCount = Math.max(prev.trendCount ?? 0, it.trendCount ?? 0)
      prev.contentType = prev.contentType ?? it.contentType
      prev.thumbnailUrl = prev.thumbnailUrl ?? it.thumbnailUrl
      prev.authorAvatarUrl = prev.authorAvatarUrl ?? it.authorAvatarUrl
    }
  }
  return [...byPost.values()]
}

const POLL_MS = 12_000

/** Remembers the user's last-used lens so the bare /trending hub restores it. */
const FILTER_STORAGE_KEY = 'adhx-trending-filter'

/** Stable React key / identity for an activity item. */
function keyOf(item: ActivityItem): string {
  return postKey(item)
}

export function DiscoverFeed({
  initialItems,
  initialFilter,
}: {
  /**
   * Server-rendered items to seed from (e.g. the /trending hub's data). When
   * provided, the grid paints immediately with no skeleton flash; the client
   * still reconciles with /api/activity on mount (and polls every 12s) so a
   * point-in-time seed can't leave the grid stale.
   */
  initialItems?: ActivityItem[]
  /** Initial filter pill selection (defaults to "latest"). */
  initialFilter?: FilterId
} = {}) {
  const seeded = (initialItems?.length ?? 0) > 0
  const [items, setItems] = useState<ActivityItem[]>(initialItems ?? [])
  const [filter, setFilter] = useState<FilterId>(initialFilter ?? 'latest')
  const [loaded, setLoaded] = useState(seeded)
  // Real count of save events since UTC midnight (from /api/activity) — drives
  // the "saved today" pill. 0 until the first fetch resolves.
  const [savedToday, setSavedToday] = useState(0)
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set())
  // null while unknown; once known, signed-out gets the public shell (the global
  // header is hidden when signed out) and Preview (not Save) actions.
  const [authed, setAuthed] = useState<boolean | null>(null)
  // Seed the known set from the server items so the first poll doesn't flash
  // every pre-rendered card as "new".
  const knownKeys = useRef<Set<string>>(new Set((initialItems ?? []).map(keyOf)))

  useEffect(() => {
    let alive = true
    fetch('/api/auth/twitter/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setAuthed(!!d?.authenticated))
      .catch(() => alive && setAuthed(false))
    return () => {
      alive = false
    }
  }, [])
  const signedOut = authed === false

  // Restore the last-used lens on the bare /trending hub (where the URL didn't
  // pin a specific filter — i.e. initialFilter is the default 'trending'). A
  // /trending/<filter> URL always wins. Runs in an effect (not the initial
  // useState) so server + first client render match — no hydration mismatch.
  useEffect(() => {
    if (initialFilter && initialFilter !== 'trending') return
    try {
      const saved = localStorage.getItem(FILTER_STORAGE_KEY)
      if (saved && FILTERS.some((f) => f.id === saved)) setFilter(saved as FilterId)
    } catch {
      /* localStorage unavailable — keep the default */
    }
  }, [initialFilter])

  const load = useCallback(async (initial: boolean) => {
    try {
      const res = await fetch('/api/activity', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (!Array.isArray(data.items)) return
      const next: ActivityItem[] = data.items
      if (typeof data.savedToday === 'number') setSavedToday(data.savedToday)

      if (initial) {
        // Seed the known set without flashing every card as "new".
        knownKeys.current = new Set(next.map(keyOf))
      } else {
        const fresh = next.filter((it) => !knownKeys.current.has(keyOf(it))).map(keyOf)
        if (fresh.length > 0) {
          for (const k of fresh) knownKeys.current.add(k)
          setFreshKeys(new Set(fresh))
          // Clear the highlight after the green tint has had a moment.
          window.setTimeout(() => setFreshKeys(new Set()), 2500)
        }
      }
      setItems(next)
    } catch {
      // transient / offline — keep showing what we have
    } finally {
      if (initial) setLoaded(true)
    }
  }, [])

  useEffect(() => {
    // Always reconcile with /api/activity on mount — even when seeded from the
    // server. The SSR seed is a point-in-time snapshot; if it differs from the
    // live pulse (timing/window), reconciling here corrects it instantly rather
    // than letting the grid sit stale until the first poll fires (~POLL_MS),
    // which read as items "popping in" seconds after load. load(true) seeds the
    // known-set so this reconcile doesn't flash the delta as "new".
    load(true)
    const t = window.setInterval(() => load(false), POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  // Select a lens AND reflect it in the address bar (tidy path) so the current
  // view is shareable + crawlable, without a full navigation — the grid already
  // holds the data and filters live. A fresh load of /trending/<filter> seeds
  // the matching filter server-side (see the [filter] route).
  const selectFilter = useCallback((id: FilterId) => {
    setFilter(id)
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, id)
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', filterToPath(id))
    }
  }, [])

  const visible = applyFilter(dedupeByPost(items), filter)

  return (
    <div className="min-h-screen bg-paper">
      {/* Signed-out: a public top nav + hero (the global header is hidden when
          signed out). Signed-in: the global header already provides Collection/
          Discover nav, so we go straight to the live banner. */}
      {signedOut && (
        <>
          <nav className="flex items-center border-b border-hairline px-5 py-4 sm:px-11">
            <Link href="/" aria-label="ADHX home">
              <MatterLogo size={20} />
            </Link>
            <div className="ml-auto flex items-center gap-5 sm:gap-[22px]">
              <Link
                href="/"
                className="hidden sm:inline text-sm font-medium text-ink-2 hover:text-ink"
              >
                How it works
              </Link>
              <span className="hidden sm:inline text-sm font-semibold text-clay">Trending</span>
              <ThemeToggle className="-mr-1 sm:mr-0" />
              <a
                href="/api/auth/twitter"
                className="inline-flex items-center gap-2 rounded-[10px] bg-ink px-4 py-2 text-[13.5px] font-semibold text-surface"
              >
                <ConnectWithX size={14} />
              </a>
            </div>
          </nav>
          <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
            <div className="flex items-center gap-2 mb-2">
              <LiveDot />
              <span className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-clay">
                Live · public
              </span>
            </div>
            <h1 className="font-serif font-semibold text-[27px] sm:text-[34px] leading-tight tracking-[-0.01em] text-ink mb-2">
              What the internet is saving, right now
            </h1>
            <p className="text-[15px] sm:text-[15.5px] text-ink-2 max-w-[640px] mb-2">
              See what&apos;s trending across X, TikTok, Instagram and YouTube — a live, anonymous
              feed of what people are saving on ADHX. Tap any post to preview it, then save your
              own.
            </p>
          </div>
        </>
      )}

      {/* Live status + filters */}
      <div className="mx-auto max-w-7xl px-4 pb-2 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-clay/25 bg-clay/[0.09] px-4 py-2">
            <LiveDot />
            {/* Real count of saves since midnight (from /api/activity). It's 0 on
                the server render (client-fetched), so it legitimately differs at
                hydration — suppress the warning rather than regenerate the tree. */}
            <span className="text-[14px] font-bold text-ink" suppressHydrationWarning>
              {savedToday > 0 ? `${savedToday} saved today` : 'Live'}
            </span>
          </span>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = f.id === filter
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => selectFilter(f.id)}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors duration-150',
                    active
                      ? 'bg-ink text-paper'
                      : 'border border-hairline bg-surface text-ink-2 hover:text-ink',
                  )}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          <span className="ml-auto font-mono text-[12.5px] text-ink-3">updates live</span>
        </div>
      </div>

      {/* Grid */}
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-3 sm:px-6">
        {!loaded ? (
          <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-card border border-hairline bg-inset"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-card bg-inset">
            <p className="text-center text-[15px] text-ink-2">Nothing happening yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
            {visible.map((item) => (
              <DiscoverCard
                key={keyOf(item)}
                item={item}
                fresh={freshKeys.has(keyOf(item))}
                pub={signedOut}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
