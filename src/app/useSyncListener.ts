'use client'

import { useEffect } from 'react'
import { clientEventMatchesCurrentAccount } from '@/lib/client-events'

interface UseSyncListenerOptions {
  /** Whether a sync started via this page's own `startSync` is in flight. */
  isSyncing: boolean
  fetchFeed: (resetPage?: boolean) => void
  fetchTags: () => void
}

/**
 * Listens for the cross-component `sync-complete` and `tweet-added` window
 * events and refreshes the feed/tags accordingly.
 *
 * `sync-complete` is needed because Header-triggered syncs don't set
 * `isSyncing` in this component — only a refetch (guarded on `isSyncing` so
 * we don't double-fetch after a sync started via this page's own
 * `startSync`, which already handles the state update) tells us it finished.
 */
export function useSyncListener({ isSyncing, fetchFeed, fetchTags }: UseSyncListenerOptions): void {
  useEffect(() => {
    const handleSyncComplete = () => {
      // Only refetch if we're not currently syncing via our own startSync
      // (which already handles the state update)
      if (!isSyncing) {
        fetchFeed(true)
        fetchTags()
      }
    }

    window.addEventListener('sync-complete', handleSyncComplete)
    return () => window.removeEventListener('sync-complete', handleSyncComplete)
  }, [fetchFeed, fetchTags, isSyncing])

  useEffect(() => {
    const handleTweetAdded = (event: Event) => {
      if (clientEventMatchesCurrentAccount(event)) fetchFeed(true)
    }
    window.addEventListener('tweet-added', handleTweetAdded)
    return () => window.removeEventListener('tweet-added', handleTweetAdded)
  }, [fetchFeed])
}
