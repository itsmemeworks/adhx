'use client'

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { FeedItem } from '@/components/feed'
import { sameBookmark } from '@/lib/theater/collection-href'

interface UsePersonalQueueOptions {
  hideArchived: boolean
  setItems: Dispatch<SetStateAction<FeedItem[]>>
  setStats: Dispatch<SetStateAction<{ total: number; active: number }>>
}

interface UsePersonalQueueReturn {
  /** Drop/mark an item the collection mode resolved, keeping the feed in sync. */
  handlePostResolved: (item: FeedItem, action: 'archive' | 'delete') => void
  /** Undo of an archive: put the post back and bump the active count. */
  handlePostRestored: (item: FeedItem) => void
}

/**
 * Reconciles the main feed's `items`/`stats` state with actions taken inside
 * the collection theater (archive/delete an item, or undo an archive).
 *
 * Identity is `(platform, id)` — the same numeric id exists on X and TikTok.
 */
export function usePersonalQueue({
  hideArchived,
  setItems,
  setStats,
}: UsePersonalQueueOptions): UsePersonalQueueReturn {
  const handlePostResolved = useCallback(
    (item: FeedItem, action: 'archive' | 'delete') => {
      if (action === 'delete' || hideArchived) {
        setItems((prev) => prev.filter((i) => !sameBookmark(i, item.id, item.platform)))
      } else {
        setItems((prev) =>
          prev.map((i) =>
            sameBookmark(i, item.id, item.platform) ? { ...i, isArchived: true } : i,
          ),
        )
      }
      // Everything in this queue is active by definition, so archiving or
      // deleting one drops the active count either way.
      setStats((prev) => ({ ...prev, active: Math.max(0, prev.active - 1) }))
    },
    [hideArchived, setItems, setStats],
  )

  const handlePostRestored = useCallback(
    (item: FeedItem) => {
      setItems(
        (prev) =>
          prev.some((i) => sameBookmark(i, item.id, item.platform))
            ? prev.map((i) =>
                sameBookmark(i, item.id, item.platform) ? { ...i, isArchived: false } : i,
              )
            : [{ ...item, isArchived: false }, ...prev], // was dropped under hideArchived — re-add it
      )
      setStats((prev) => ({ ...prev, active: prev.active + 1 }))
    },
    [setItems, setStats],
  )

  return { handlePostResolved, handlePostRestored }
}
