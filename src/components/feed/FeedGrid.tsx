'use client'

import { Image } from 'lucide-react'
import { FeedCard } from './FeedCard'
import { ADHX_PURPLE } from '@/lib/gestalt/theme'
import type { FeedItem } from './types'

interface FeedGridProps {
  items: FeedItem[]
  loading: boolean
  hasMore: boolean
  lastSyncAt: string | null
  unreadOnly: boolean
  stats: { total: number; unread: number }
  onExpand: (index: number) => void
  onMarkRead: (id: string) => void
  onRemove: (id: string) => void
  onLoadMore: () => void
  onShowAll: () => void
}

export function FeedGrid({
  items,
  loading,
  hasMore,
  lastSyncAt,
  unreadOnly,
  stats,
  onExpand,
  onMarkRead,
  onRemove,
  onLoadMore,
  onShowAll,
}: FeedGridProps): React.ReactElement {
  if (loading && items.length === 0) {
    return <LoadingSkeleton />
  }

  if (items.length === 0) {
    return <EmptyState unreadOnly={unreadOnly} stats={stats} onShowAll={onShowAll} />
  }

  return (
    <>
      <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4">
        {items.map((item, index) => (
          <FeedCard
            key={item.id}
            item={item}
            lastSyncAt={lastSyncAt}
            onExpand={() => onExpand(index)}
            onMarkRead={() => onMarkRead(item.id)}
            unreadOnly={unreadOnly}
            onRemove={() => onRemove(item.id)}
          />
        ))}
      </div>

      {hasMore && (
        <div className="mt-8 text-center">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="px-8 py-3 rounded-full font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: ADHX_PURPLE }}
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </>
  )
}

function LoadingSkeleton(): React.ReactElement {
  return (
    <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="mb-4 break-inside-avoid" style={{ height: `${180 + (i % 3) * 80}px` }}>
          <div className="w-full h-full bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
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
      <div className="w-20 h-20 mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <Image className="w-10 h-10 text-gray-400" />
      </div>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        {unreadOnly ? 'All caught up!' : 'No items found'}
      </h3>
      <p className="text-gray-500 dark:text-gray-400">
        {unreadOnly ? 'You have no unread bookmarks' : 'Try adjusting your filters'}
      </p>
      {unreadOnly && stats.total > 0 && (
        <button
          onClick={onShowAll}
          className="mt-4 px-6 py-2 rounded-full font-medium text-white"
          style={{ backgroundColor: ADHX_PURPLE }}
        >
          Show all {stats.total} bookmarks
        </button>
      )}
    </div>
  )
}
