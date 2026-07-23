'use client'

import { useCallback, useRef } from 'react'
import { Image, Loader2 } from 'lucide-react'
import { FeedCard } from './FeedCard'
import { FeedListRow } from './FeedListRow'
import { FeedBentoTile, BENTO_SPANS } from './FeedBentoTile'
import type { FeedItem } from './types'

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
}: FeedGridProps): React.ReactElement {
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
    return <EmptyState unreadOnly={unreadOnly} stats={stats} onShowAll={onShowAll} />
  }

  return (
    <>
      {view === 'grid' && (
        <div className={GRID_CLASS}>
          {items.map((item, index) => (
            <FeedCard
              key={item.id}
              item={item}
              lastSyncAt={lastSyncAt}
              sortField={sortField}
              onExpand={() => onExpand(index)}
            />
          ))}
        </div>
      )}

      {view === 'list' && (
        // List / Inbox — dense rows in a bordered surface.
        <div className="rounded-card border border-hairline bg-surface shadow-m-sm overflow-hidden [&>*:last-child]:border-b-0">
          {items.map((item, index) => (
            <FeedListRow key={item.id} item={item} onClick={() => onExpand(index)} />
          ))}
        </div>
      )}

      {view === 'bento' && (
        // Bento mosaic — mixed-size tiles; 2-col mobile → 4-col desktop.
        <div className="grid grid-cols-2 [@media(min-width:820px)]:grid-cols-4 gap-3 sm:gap-4 [grid-auto-rows:108px] sm:[grid-auto-rows:168px]">
          {items.map((item, index) => {
            const [cs, rs] = BENTO_SPANS[index % BENTO_SPANS.length]
            return (
              <FeedBentoTile
                key={item.id}
                item={item}
                cs={cs}
                rs={rs}
                onClick={() => onExpand(index)}
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
