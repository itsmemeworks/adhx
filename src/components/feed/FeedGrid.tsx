'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Image, Loader2 } from 'lucide-react'
import { FeedCard } from './FeedCard'
import { FeedListRow } from './FeedListRow'
import { FeedBentoTile, BENTO_SPANS } from './FeedBentoTile'
import { EmptyAccountOnboarding } from './EmptyAccountOnboarding'
import type { FeedItem } from './types'
import { notifyTagsChanged } from '@/lib/client-events'

export type FeedView = 'grid' | 'list' | 'bento'

interface FeedGridProps {
  items: FeedItem[]
  loading: boolean
  hasMore: boolean
  lastSyncAt: string | null
  sortField: 'processedAt' | 'createdAt'
  unreadOnly: boolean
  stats: { total: number; unread: number }
  view?: FeedView
  onExpand: (index: number) => void
  onLoadMore: () => void
  onShowAll: () => void
  // Tags: "Add posts" selection mode (unified-theater-collection §4). Non-null
  // puts the grid view into selection mode for that tag; FilterBar owns the
  // toggle/exit (Escape + the toolbar's "Done adding" button) — this prop is
  // display + membership-toggling only.
  tagSelectTag?: string | null
  /**
   * `platform:id` of a post to highlight briefly — what the library shows
   * after a paste instead of a transient banner, which pushed the whole grid
   * down (owner: "just something subtle").
   */
  justAddedKey?: string | null
}

/** `platform:id` key for the optimistic tag-membership overlay below. */
function tagOverlayKey(item: FeedItem): string {
  return `${item.platform || 'twitter'}:${item.id}`
}

/**
 * React key AND highlight key. Deliberately not the bare `item.id`: ids are
 * only unique per platform (a TikTok video id and a tweet id can both be 19
 * digits), so two platforms sharing one id rendered duplicate React keys.
 */
function cardKey(item: FeedItem): string {
  return tagOverlayKey(item)
}

// Calm Matter grid: mobile 1 col → tablet 2 col (≥640) → 3 col (≥820) →
// desktop 4 col (≥1024). 20px gap, ~26px page gutters (applied by the page
// container). Masonry via CSS columns so cards flow by natural height.
const GRID_CLASS =
  'columns-1 [@media(min-width:640px)]:columns-2 [@media(min-width:820px)]:columns-3 lg:columns-4 gap-5'

export function FeedGrid({
  items,
  loading,
  hasMore,
  lastSyncAt,
  sortField,
  unreadOnly,
  stats,
  view = 'grid',
  onExpand,
  onLoadMore,
  onShowAll,
  tagSelectTag = null,
  justAddedKey = null,
}: FeedGridProps): React.ReactElement {
  // Optimistic overlay for tag-membership toggles, keyed by `platform:id` —
  // items arrive via props, so membership changes are tracked here rather
  // than mutating them. Cleared whenever selection mode starts/stops/switches
  // tags so a stale overlay from a previous tag can't leak in.
  const [tagOverlay, setTagOverlay] = useState<Map<string, boolean>>(new Map())
  useEffect(() => {
    setTagOverlay(new Map())
  }, [tagSelectTag])

  const toggleTagMembership = useCallback(
    (item: FeedItem) => {
      if (!tagSelectTag) return
      const key = tagOverlayKey(item)
      const current = tagOverlay.get(key) ?? item.tags.includes(tagSelectTag)
      const next = !current
      setTagOverlay((prev) => new Map(prev).set(key, next))
      const platform = item.platform || 'twitter'
      fetch(
        `/api/bookmarks/${encodeURIComponent(item.id)}/tags?platform=${encodeURIComponent(platform)}`,
        {
          method: next ? 'POST' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag: tagSelectTag }),
        },
      )
        .then((res) => {
          if (!res.ok) throw new Error(`tag toggle failed: ${res.status}`)
          // Same event TagQuickPicker dispatches — AuthedHome refetches tag
          // counts so the toolbar "{n} posts" / Tags dropdown never go stale.
          const tags = next
            ? [...item.tags.filter((t) => t !== tagSelectTag), tagSelectTag]
            : item.tags.filter((t) => t !== tagSelectTag)
          notifyTagsChanged({ platform, bookmarkId: item.id, tags })
        })
        .catch(() => {
          // Revert on failure — best-effort, no toast (mirrors the
          // "Share as theater" fetch's fire-and-forget error handling).
          setTagOverlay((prev) => new Map(prev).set(key, current))
        })
    },
    [tagSelectTag, tagOverlay],
  )

  const selectedCount = tagSelectTag
    ? items.filter(
        (item) => tagOverlay.get(tagOverlayKey(item)) ?? item.tags.includes(tagSelectTag),
      ).length
    : 0

  // Infinite scroll: a sentinel below the grid triggers onLoadMore when it
  // scrolls into view. Latest loading/hasMore/onLoadMore are read through a
  // ref so the observer doesn't need re-creating on every render.
  const loadStateRef = useRef({ loading, hasMore, onLoadMore })
  loadStateRef.current = { loading, hasMore, onLoadMore }

  const observerRef = useRef<IntersectionObserver | null>(null)
  // Callback ref instead of a plain ref + effect: the sentinel only exists in
  // the DOM once items have loaded past the initial skeleton, so an effect
  // with an empty dep array would fire once (while the ref is still null)
  // and never run again — the observer was never created. A callback ref
  // re-invokes whenever the sentinel node mounts/unmounts, so the observer
  // attaches the moment it appears (and reattaches if it's removed and
  // re-added, e.g. hasMore toggling).
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        const { loading: isLoading, hasMore: more, onLoadMore: load } = loadStateRef.current
        if (entries[0]?.isIntersecting && more && !isLoading) {
          load()
        }
      },
      // Start loading before the sentinel is fully visible so content is
      // ready by the time the user reaches the bottom.
      { rootMargin: '600px 0px' },
    )
    observer.observe(node)
    observerRef.current = observer
  }, [])

  if (loading && items.length === 0) {
    return <LoadingSkeleton />
  }

  if (items.length === 0) {
    // stats.total is the GLOBAL bookmark count (unfiltered — see /api/feed's
    // early-return branch), so this is true only for a genuinely empty
    // account, never "no results for the current filter/search".
    if (stats.total === 0) {
      return <EmptyAccountOnboarding />
    }
    return <EmptyState unreadOnly={unreadOnly} stats={stats} onShowAll={onShowAll} />
  }

  return (
    <>
      {view === 'grid' && (
        <div className={GRID_CLASS}>
          {items.map((item, index) => {
            const selected = tagSelectTag
              ? (tagOverlay.get(tagOverlayKey(item)) ?? item.tags.includes(tagSelectTag))
              : false
            return (
              <FeedCard
                key={cardKey(item)}
                item={item}
                lastSyncAt={lastSyncAt}
                sortField={sortField}
                onExpand={() => onExpand(index)}
                selectionMode={!!tagSelectTag}
                selected={selected}
                onToggleSelect={() => toggleTagMembership(item)}
                justAdded={cardKey(item) === justAddedKey}
              />
            )
          })}
        </div>
      )}

      {view === 'list' && (
        // List / Inbox — dense rows in a bordered surface.
        <div className="rounded-card border border-hairline bg-surface shadow-m-sm overflow-hidden [&>*:last-child]:border-b-0">
          {items.map((item, index) => {
            const selected = tagSelectTag
              ? (tagOverlay.get(tagOverlayKey(item)) ?? item.tags.includes(tagSelectTag))
              : false
            return (
              <FeedListRow
                key={cardKey(item)}
                item={item}
                onClick={() => onExpand(index)}
                selectionMode={!!tagSelectTag}
                selected={selected}
                onToggleSelect={() => toggleTagMembership(item)}
                justAdded={cardKey(item) === justAddedKey}
              />
            )
          })}
        </div>
      )}

      {view === 'bento' && (
        // Bento mosaic — mixed-size tiles; 2-col mobile → 4-col desktop.
        <div className="grid grid-cols-2 [@media(min-width:820px)]:grid-cols-4 gap-3 sm:gap-4 [grid-auto-rows:108px] sm:[grid-auto-rows:168px]">
          {items.map((item, index) => {
            const [cs, rs] = BENTO_SPANS[index % BENTO_SPANS.length]
            const selected = tagSelectTag
              ? (tagOverlay.get(tagOverlayKey(item)) ?? item.tags.includes(tagSelectTag))
              : false
            return (
              <FeedBentoTile
                key={cardKey(item)}
                item={item}
                cs={cs}
                rs={rs}
                onClick={() => onExpand(index)}
                selectionMode={!!tagSelectTag}
                selected={selected}
                onToggleSelect={() => toggleTagMembership(item)}
                justAdded={cardKey(item) === justAddedKey}
              />
            )
          })}
        </div>
      )}

      {hasMore && (
        <>
          {/* Sentinel — when this scrolls into view, the next page auto-loads */}
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />
          <div className="mt-8 flex flex-col items-center gap-3">
            {loading ? (
              <div className="flex items-center gap-2 text-ink-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading more…</span>
              </div>
            ) : (
              // Fallback for keyboard users / when the observer can't fire
              // (e.g. very tall viewport, reduced-motion auto-scroll off).
              <button
                onClick={onLoadMore}
                className="px-8 py-3 rounded-full font-semibold bg-clay-grad text-white shadow-glow transition-opacity hover:opacity-90"
              >
                Load more
              </button>
            )}
          </div>
        </>
      )}

      {tagSelectTag && (
        // Display-only: count + hint. Exiting selection mode is owned by
        // FilterBar (Escape listener + the toolbar's "Done adding" button) —
        // this component has no onTagSelectChange callback to call.
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-3 border-t border-hairline bg-surface/95 px-4 py-3 shadow-m-sm backdrop-blur-sm">
          <span className="text-[13.5px] font-semibold text-ink">
            Adding to <span className="text-clay">#{tagSelectTag}</span> · {selectedCount} post
            {selectedCount === 1 ? '' : 's'}
          </span>
          <span className="text-[12px] text-ink-3">Esc to finish</span>
        </div>
      )}
    </>
  )
}

function LoadingSkeleton(): React.ReactElement {
  return (
    <div className={GRID_CLASS}>
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="mb-4 break-inside-avoid"
          style={{ height: `${180 + (i % 3) * 80}px` }}
        >
          <div className="w-full h-full bg-inset rounded-card animate-pulse" />
        </div>
      ))}
    </div>
  )
}

interface EmptyStateProps {
  unreadOnly: boolean
  stats: { total: number; unread: number }
  onShowAll: () => void
}

function EmptyState({ unreadOnly, stats, onShowAll }: EmptyStateProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 mb-4 rounded-full bg-inset flex items-center justify-center">
        <Image className="w-10 h-10 text-ink-3" />
      </div>
      <h3 className="font-serif text-xl font-semibold text-ink mb-2">
        {unreadOnly ? 'All caught up!' : 'No items found'}
      </h3>
      <p className="text-ink-2">
        {unreadOnly ? 'You have no unread bookmarks' : 'Try adjusting your filters'}
      </p>
      {unreadOnly && stats.total > 0 && (
        <button
          onClick={onShowAll}
          className="mt-4 px-6 py-2 rounded-full font-medium bg-clay-grad text-white shadow-glow transition-opacity hover:opacity-90"
        >
          Show all {stats.total} bookmarks
        </button>
      )}
    </div>
  )
}
