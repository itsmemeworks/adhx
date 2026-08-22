'use client'

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { FeedItem } from '@/components/feed'

interface UsePersonalQueueOptions {
  hideArchived: boolean
  setItems: Dispatch<SetStateAction<FeedItem[]>>
  setStats: Dispatch<SetStateAction<{ total: number; active: number }>>
}

interface UsePersonalQueueReturn {
  /** Drop/mark an item the collection mode resolved, keeping the feed in sync. */
  handlePostResolved: (id: string, action: 'archive' | 'delete') => void
  /** Undo of an archive: put the post back and bump the active count. */
  handlePostRestored: (item: FeedItem) => void
}

/**
 * Reconciles the main feed's `items`/`stats` state with actions taken inside
 * the collection theater (archive/delete an item, or undo an archive).
 */
export function usePersonalQueue({
  hideArchived,
  setItems,
  setStats,
}: UsePersonalQueueOptions): UsePersonalQueueReturn {
  const handlePostResolved = useCallback(
    (id: string, action: 'archive' | 'delete') => {
      if (action === 'delete' || hideArchived) {
        setItems((prev) => prev.filter((i) => i.id !== id))
      } else {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isArchived: true } : i)))
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
          prev.some((i) => i.id === item.id)
            ? prev.map((i) => (i.id === item.id ? { ...i, isArchived: false } : i))
            : [{ ...item, isArchived: false }, ...prev], // was dropped under hideArchived — re-add it
      )
      setStats((prev) => ({ ...prev, active: prev.active + 1 }))
    },
    [setItems, setStats],
  )

  return { handlePostResolved, handlePostRestored }
}
