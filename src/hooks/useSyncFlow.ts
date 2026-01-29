'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { streamedBookmarkToFeedItem } from '@/components/feed'
import type { FeedItem, StreamedBookmark } from '@/components/feed'

interface SyncProgress {
  current: number
  total: number
  message?: string
}

interface UseSyncFlowOptions {
  onItemStreamed: (item: FeedItem) => void
  getExistingItemIds: () => string[]
}

interface UseSyncFlowReturn {
  isSyncing: boolean
  syncProgress: SyncProgress | null
  streamedItems: FeedItem[]
  showSyncModal: boolean
  startSync: (firstLogin?: boolean) => Promise<void>
}

/**
 * Hook to manage the sync flow with SSE streaming
 * Extracts sync logic from the main page component for better separation of concerns
 */
export function useSyncFlow({
  onItemStreamed,
  getExistingItemIds,
}: UseSyncFlowOptions): UseSyncFlowReturn {
  const router = useRouter()
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [streamedItems, setStreamedItems] = useState<FeedItem[]>([])
  const [showSyncModal, setShowSyncModal] = useState(false)

  // Track seen item IDs for O(1) duplicate detection during sync streaming
  const seenItemIdsRef = useRef<Set<string>>(new Set())
  // Track EventSource for cleanup on unmount to prevent memory leaks
  const eventSourceRef = useRef<EventSource | null>(null)

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  const startSync = useCallback(async (firstLogin = false) => {
    if (isSyncing) return

    try {
      // Check cooldown before starting sync
      const cooldownRes = await fetch('/api/sync/cooldown')
      const cooldownData = await cooldownRes.json()
      if (!cooldownData.canSync) {
        // On cooldown - don't show modal, just skip sync silently on first login
        return
      }

      // Cooldown passed - now start sync
      setIsSyncing(true)
      setSyncProgress({ current: 0, total: 0, message: 'Starting sync...' })
      // Initialize seen IDs Set with current items for O(1) duplicate detection
      seenItemIdsRef.current = new Set(getExistingItemIds())

      // Show modal for first login, clear streamed items
      if (firstLogin) {
        setShowSyncModal(true)
        setStreamedItems([])
      }

      const eventSource = new EventSource('/api/sync')
      eventSourceRef.current = eventSource

      eventSource.addEventListener('start', () => {
        setSyncProgress({ current: 0, total: 0, message: 'Fetching bookmarks...' })
      })

      eventSource.addEventListener('page', (e) => {
        const data = JSON.parse(e.data)
        setSyncProgress({ current: 0, total: data.tweetsFound, message: `Found ${data.tweetsFound} bookmarks...` })
      })

      eventSource.addEventListener('processing', (e) => {
        const data = JSON.parse(e.data)
        setSyncProgress({
          current: data.current,
          total: data.total,
          message: `Saving bookmark ${data.current}/${data.total}...`,
        })

        // Add streamed bookmark to gallery in real-time
        if (data.bookmark) {
          const feedItem = streamedBookmarkToFeedItem(data.bookmark as StreamedBookmark)
          // O(1) duplicate check using Set
          if (!seenItemIdsRef.current.has(feedItem.id)) {
            seenItemIdsRef.current.add(feedItem.id)
            // Add to streamed items for modal view
            setStreamedItems(prev => [feedItem, ...prev])
            // Notify parent to add to main items array
            onItemStreamed(feedItem)
          }
        }
      })

      eventSource.addEventListener('complete', (e) => {
        const data = JSON.parse(e.data)
        setSyncProgress({
          current: data.stats.total,
          total: data.stats.total,
          message: `Synced ${data.stats.new} new bookmarks!`,
        })
        eventSource.close()
        eventSourceRef.current = null
        setIsSyncing(false)
        router.replace('/', { scroll: false })
        window.dispatchEvent(new CustomEvent('sync-complete'))

        // Keep modal open for 2s after completion so user can see final state
        if (firstLogin) {
          setTimeout(() => {
            setShowSyncModal(false)
            setSyncProgress(null)
          }, 2000)
        } else {
          setTimeout(() => setSyncProgress(null), 3000)
        }
      })

      eventSource.addEventListener('error', (e) => {
        console.error('Sync error:', e)
        setSyncProgress({ current: 0, total: 0, message: 'Sync failed' })
        eventSource.close()
        eventSourceRef.current = null
        setIsSyncing(false)
        setShowSyncModal(false)
        setTimeout(() => setSyncProgress(null), 3000)
      })

      eventSource.onerror = () => {
        eventSource.close()
        eventSourceRef.current = null
        setIsSyncing(false)
        setShowSyncModal(false)
      }
    } catch (error) {
      console.error('Failed to start sync:', error)
      setIsSyncing(false)
      setShowSyncModal(false)
      setSyncProgress(null)
    }
  }, [isSyncing, router, getExistingItemIds, onItemStreamed])

  return {
    isSyncing,
    syncProgress,
    streamedItems,
    showSyncModal,
    startSync,
  }
}
