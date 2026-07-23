'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LiveDot } from '@/components/matter'
import { PublicNav } from '@/components/PublicNav'
import { DiscoverCard } from './DiscoverCard'
import { DiscoverCtaCard } from './DiscoverCtaCard'
import type { TrendingItem } from '@/lib/trending/query'
import { type FilterId, FILTERS, applyFilter, filterToPath } from '@/lib/trending/filter'
import { shouldInsertCtaAfter } from '@/lib/discover/interleave-cta'

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
      // Build a new object rather than mutating `prev` in place — `items` is
      // React state and this runs during render, so mutating a live object
      // held in state is a render-phase side effect (and can double-apply
      // under StrictMode's double-invoke).
      byPost.set(k, {
        ...prev,
        saveCount: Math.max(prev.saveCount ?? 0, it.saveCount ?? 0),
        trendCount: Math.max(prev.trendCount ?? 0, it.trendCount ?? 0),
        contentType: prev.contentType ?? it.contentType,
        thumbnailUrl: prev.thumbnailUrl ?? it.thumbnailUrl,
        authorAvatarUrl: prev.authorAvatarUrl ?? it.authorAvatarUrl,
      })
    }
  }
  return [...byPost.values()]
}

const POLL_MS = 12_000

/**
 * Merge a freshly-fetched batch into the accumulated item list without
 * duplicating posts (de-duped again at render by `dedupeByPost`, but the raw
 * state array must not grow unbounded across polls/pages).
 *
 * - `'front'` (the 12s live poll, always offset 0): refreshes existing items
 *   in place with the latest data (save counts, etc.) and prepends genuinely
 *   new posts — so already-scrolled-in older pages stay put underneath.
 * - `'back'` (infinite scroll, growing offset): appends only posts not
 *   already loaded. Because pagination pages a live, insert-ordered feed, an
 *   offset can drift slightly if new activity lands between page fetches —
 *   this can drop or (harmlessly, since it's filtered here) re-fetch a post.
 *   Acceptable for a best-effort public pulse.
 */
function mergeIncoming(
  existing: ActivityItem[],
  incoming: ActivityItem[],
  place: 'front' | 'back',
): ActivityItem[] {
  const existingKeys = new Set(existing.map(keyOf))
  if (place === 'front') {
    const incomingByKey = new Map(incoming.map((it) => [keyOf(it), it]))
    const refreshed = existing.map((it) => incomingByKey.get(keyOf(it)) ?? it)
    const brandNew = incoming.filter((it) => !existingKeys.has(keyOf(it)))
    return [...brandNew, ...refreshed]
  }
  const olderNew = incoming.filter((it) => !existingKeys.has(keyOf(it)))
  return [...existing, ...olderNew]
}

/** Remembers the user's last-used lens so the bare /trending hub restores it. */
const FILTER_STORAGE_KEY = 'adhx-trending-filter'

/** Persists dismissal of the in-grid "Connect with X" CTA (all instances, for the session/future visits). */
const CTA_DISMISS_KEY = 'adhx-trending-cta-dismissed'

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
  // Real rolling-24h engagement count (saves + previews, from /api/activity) —
  // drives the live activity pill. 0 until the first fetch resolves.
  const [recentActivity, setRecentActivity] = useState(0)
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set())
  // null while unknown; once known, signed-out gets the public shell (the global
  // header is hidden when signed out) and Preview (not Save) actions.
  const [authed, setAuthed] = useState<boolean | null>(null)
  // Whether the in-grid CTA card has been dismissed. Starts `false` to match
  // the server render (localStorage isn't available there); the real value is
  // read in an effect below, after hydration, so server/client HTML always
  // agree on the first paint. The CTA itself is also gated on `signedOut`,
  // which resolves later (async auth check), so in practice this never flashes.
  const [ctaDismissed, setCtaDismissed] = useState(false)
  // Seed the known set from the server items so the first poll doesn't flash
  // every pre-rendered card as "new".
  const knownKeys = useRef<Set<string>>(new Set((initialItems ?? []).map(keyOf)))
  // Tracks the pending "clear the fresh highlight" timer so it can be
  // cancelled on unmount (otherwise a poll firing just before navigation away
  // schedules a setState that resolves after the component is gone).
  const freshClearTimerRef = useRef<number | null>(null)

  // Infinite-scroll pagination. `offsetRef`/`hasMoreRef` are refs (not state)
  // so the IntersectionObserver callback below always reads their CURRENT
  // value at call time rather than a value closed over when the observer was
  // attached — the observer is only set up once per sentinel mount, so a
  // stale closure here would silently stop paging after the first page.
  // `hasMore` is mirrored into state purely to drive the UI (hide the
  // sentinel/spinner once exhausted).
  const offsetRef = useRef(initialItems?.length ?? 0)
  const hasMoreRef = useRef(true)
  const loadingMoreRef = useRef(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

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

  useEffect(() => {
    try {
      setCtaDismissed(localStorage.getItem(CTA_DISMISS_KEY) === '1')
    } catch {
      /* localStorage unavailable — keep showing the CTA */
    }
  }, [])

  const dismissCta = useCallback(() => {
    setCtaDismissed(true)
    try {
      localStorage.setItem(CTA_DISMISS_KEY, '1')
    } catch {
      /* ignore — dismissal just won't persist */
    }
  }, [])

  const connectWithX = useCallback(() => {
    window.location.href = '/api/auth/twitter'
  }, [])

  // Restore the last-used lens on the bare /trending hub (where the URL didn't
  // pin a specific filter — i.e. initialFilter is the default 'latest'). A
  // /trending/<filter> URL always wins. Runs in an effect (not the initial
  // useState) so server + first client render match — no hydration mismatch.
  useEffect(() => {
    if (initialFilter && initialFilter !== 'latest') return
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
      if (typeof data.recentActivity === 'number') setRecentActivity(data.recentActivity)

      if (initial) {
        // Seed the known set without flashing every card as "new". This is
        // page 1 (offset 0) of the pagination sequence too.
        knownKeys.current = new Set(next.map(keyOf))
        offsetRef.current = next.length
        hasMoreRef.current = data.hasMore !== false
        setHasMore(hasMoreRef.current)
        setItems(next)
      } else {
        const fresh = next.filter((it) => !knownKeys.current.has(keyOf(it))).map(keyOf)
        if (fresh.length > 0) {
          for (const k of fresh) knownKeys.current.add(k)
          setFreshKeys(new Set(fresh))
          // Clear the highlight after the green tint has had a moment. Cancel
          // any previous pending clear so a fast poll can't stack timers.
          if (freshClearTimerRef.current !== null) {
            window.clearTimeout(freshClearTimerRef.current)
          }
          freshClearTimerRef.current = window.setTimeout(() => {
            freshClearTimerRef.current = null
            setFreshKeys(new Set())
          }, 2500)
        }
        // Merge, don't replace — a bare replace would discard any older pages
        // already loaded via infinite scroll. New posts land at the front;
        // already-loaded items get their live data (counts, etc.) refreshed
        // in place.
        setItems((prev) => mergeIncoming(prev, next, 'front'))
      }
    } catch {
      // transient / offline — keep showing what we have
    } finally {
      if (initial) setLoaded(true)
    }
  }, [])

  /** Fetches the next older page for infinite scroll and appends it. */
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/activity?offset=${offsetRef.current}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (!Array.isArray(data.items)) return
      const incoming: ActivityItem[] = data.items
      for (const it of incoming) knownKeys.current.add(keyOf(it))
      offsetRef.current += incoming.length
      hasMoreRef.current = data.hasMore !== false && incoming.length > 0
      setHasMore(hasMoreRef.current)
      if (incoming.length > 0) {
        setItems((prev) => mergeIncoming(prev, incoming, 'back'))
      }
    } catch {
      // transient — the sentinel is still visible, so the next intersection
      // (or a small scroll wiggle) retries automatically.
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [])

  // Sentinel callback ref: fires exactly when the sentinel div mounts/unmounts
  // (unlike a `useEffect(() => {...}, [])`, which — per the FeedGrid infinite
  // scroll gotcha — can run before the sentinel exists behind the loading
  // skeleton and then never re-attach). The observer itself is long-lived and
  // reads `hasMoreRef`/`loadingMoreRef` at call time via `loadMore`, so it
  // never needs to be recreated as state changes.
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) loadMore()
        },
        { rootMargin: '600px 0px' },
      )
      observer.observe(node)
      return () => observer.disconnect()
    },
    [loadMore],
  )

  useEffect(() => {
    // Always reconcile with /api/activity on mount — even when seeded from the
    // server. The SSR seed is a point-in-time snapshot; if it differs from the
    // live pulse (timing/window), reconciling here corrects it instantly rather
    // than letting the grid sit stale until the first poll fires (~POLL_MS),
    // which read as items "popping in" seconds after load. load(true) seeds the
    // known-set so this reconcile doesn't flash the delta as "new".
    load(true)
    const t = window.setInterval(() => load(false), POLL_MS)
    return () => {
      window.clearInterval(t)
      if (freshClearTimerRef.current !== null) {
        window.clearTimeout(freshClearTimerRef.current)
        freshClearTimerRef.current = null
      }
    }
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
          <PublicNav active="trending" onConnect={connectWithX} />
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
        {/* Status row — desktop/tablet only (kept off mobile so the filters +
            Play get the width). */}
        <div className="mb-3 hidden items-center gap-3 sm:flex">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-clay/25 bg-clay/[0.09] px-4 py-2">
            <LiveDot />
            {/* Real saves + previews in the last 24h (from /api/activity). It's 0
                on the server render (client-fetched), so it legitimately differs
                at hydration — suppress the warning rather than regenerate the tree. */}
            <span className="text-[14px] font-bold text-ink" suppressHydrationWarning>
              {recentActivity > 0
                ? `${recentActivity.toLocaleString()} saved & previewed today`
                : 'Live'}
            </span>
          </span>
          <span className="ml-auto font-mono text-[12.5px] text-ink-3">updates live</span>
        </div>

        {/* Toolbar row: filters take the remaining width (wrapping), Play stays
            anchored to the right so it never floats onto its own line. */}
        <div className="flex items-center gap-3">
          <div className="flex flex-1 flex-wrap gap-2">
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

          {/* Play the trending videos as a full-bleed autoplay reel. */}
          <Link
            href="/trending/play"
            className="flex-none inline-flex items-center gap-1.5 self-start rounded-full bg-clay-grad px-4 py-2 text-[13.5px] font-semibold text-white shadow-glow transition-opacity duration-150 hover:opacity-90"
          >
            <Play size={14} fill="currentColor" />
            Play
          </Link>
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
        ) : visible.length === 0 && !hasMore ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-card bg-inset">
            <p className="text-center text-[15px] text-ink-2">Nothing happening yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
            {/* The CTA is interleaved here, at render time, from `visible` — it
                never touches `items` state, so polling/dedupe/pagination above
                are entirely unaware of it. Signed-in visitors never see it. */}
            {visible.flatMap((item, i) => {
              const nodes = [
                <DiscoverCard
                  key={keyOf(item)}
                  item={item}
                  fresh={freshKeys.has(keyOf(item))}
                  pub={signedOut}
                />,
              ]
              if (signedOut && !ctaDismissed && shouldInsertCtaAfter(i + 1)) {
                nodes.push(
                  <DiscoverCtaCard
                    key={`cta-${i}`}
                    onConnect={connectWithX}
                    onDismiss={dismissCta}
                  />,
                )
              }
              return nodes
            })}
          </div>
        )}

        {/* Infinite-scroll sentinel: an IntersectionObserver on this div fires
            `loadMore()` as it nears the viewport (600px rootMargin, so the
            next page arrives before the user hits bottom). Rendered whenever
            more pages might exist — even if the CURRENT filter has zero
            visible matches yet (e.g. "Articles" with none in the loaded
            pages) — so scrolling keeps fetching until a match turns up or the
            pulse is exhausted. Disappears once `hasMore` is false. */}
        {loaded && hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-8">
            {loadingMore && <Loader2 className="h-5 w-5 animate-spin text-ink-3" />}
          </div>
        )}
      </div>
    </div>
  )
}
