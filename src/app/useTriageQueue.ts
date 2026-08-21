'use client'

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { FeedItem } from '@/components/feed'

interface UseTriageQueueOptions {
  unreadOnly: boolean
  setItems: Dispatch<SetStateAction<FeedItem[]>>
  setStats: Dispatch<SetStateAction<{ total: number; unread: number }>>
}

interface UseTriageQueueReturn {
  /** Drop/mark an item the triage mode resolved, keeping the feed in sync. */
  handleTriageResolved: (id: string, action: 'archive' | 'delete') => void
  /** Undo of a triage archive: restore the item to unread + bump the count back. */
  handleTriageRestored: (item: FeedItem) => void
}

/**
 * Reconciles the main feed's `items`/`stats` state with actions taken inside
 * the triage theater (archive/delete an item, or undo an archive).
 */
export function useTriageQueue({
  unreadOnly,
  setItems,
  setStats,
}: UseTriageQueueOptions): UseTriageQueueReturn {
  const handleTriageResolved = useCallback(
    (id: string, action: 'archive' | 'delete') => {
      if (action === 'delete' || unreadOnly) {
        setItems((prev) => prev.filter((i) => i.id !== id))
      } else {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isRead: true } : i)))
      }
      // Triage queue items are always unread, so both archiving and deleting
      // one drops the unread count.
      setStats((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }))
    },
    [unreadOnly, setItems, setStats],
  )

  const handleTriageRestored = useCallback(
    (item: FeedItem) => {
      setItems(
        (prev) =>
          prev.some((i) => i.id === item.id)
            ? prev.map((i) => (i.id === item.id ? { ...i, isRead: false } : i))
            : [{ ...item, isRead: false }, ...prev], // was dropped under unreadOnly — re-add it
      )
      setStats((prev) => ({ ...prev, unread: prev.unread + 1 }))
    },
    [setItems, setStats],
  )

  return { handleTriageResolved, handleTriageRestored }
}
