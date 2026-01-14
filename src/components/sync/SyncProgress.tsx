'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, RefreshCw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SyncStats {
  total: number
  new: number
  duplicates: number
  categorized: number
}

interface CurrentTweet {
  id: string
  author: string
  text: string
}

interface SyncProgressProps {
  isOpen: boolean
  onClose: () => void
  fetchAll?: boolean
  onComplete?: (stats: SyncStats) => void
}

type SyncState = 'idle' | 'connecting' | 'fetching' | 'processing' | 'complete' | 'error'

export function SyncProgress({ isOpen, onClose, fetchAll = false, onComplete }: SyncProgressProps) {
  const [state, setState] = useState<SyncState>('idle')
  const [progress, setProgress] = useState(0)
  const [totalTweets, setTotalTweets] = useState(0)
  const [processedTweets, setProcessedTweets] = useState(0)
  const [duplicates, setDuplicates] = useState(0)
  const [newBookmarks, setNewBookmarks] = useState(0)
  const [currentTweet, setCurrentTweet] = useState<CurrentTweet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pageNumber, setPageNumber] = useState(0)
  const [stats, setStats] = useState<SyncStats | null>(null)

  const startSync = useCallback(async () => {
    setState('connecting')
    setProgress(0)
    setTotalTweets(0)
    setProcessedTweets(0)
    setDuplicates(0)
    setNewBookmarks(0)
    setCurrentTweet(null)
    setError(null)
    setPageNumber(0)
    setStats(null)

    try {
      const url = `/api/sync?all=${fetchAll}&maxPages=20`
      const eventSource = new EventSource(url)

      eventSource.onopen = () => {
        setState('fetching')
      }

      eventSource.addEventListener('start', () => {
        setState('fetching')
      })

      eventSource.addEventListener('page', (e) => {
        const data = JSON.parse(e.data)
        setPageNumber(data.pageNumber)
        setTotalTweets((prev) => prev + data.tweetsFound)
      })

      eventSource.addEventListener('processing', (e) => {
        const data = JSON.parse(e.data)
        setState('processing')
        setProcessedTweets(data.current)
        setTotalTweets(data.total)
        setCurrentTweet(data.tweet)
        setNewBookmarks((prev) => prev + 1)
        setProgress(Math.round((data.current / data.total) * 100))
      })

      eventSource.addEventListener('duplicate', () => {
        setDuplicates((prev) => prev + 1)
        setProcessedTweets((prev) => prev + 1)
      })

      eventSource.addEventListener('complete', (e) => {
        const data = JSON.parse(e.data)
        setStats(data.stats)
        onComplete?.(data.stats)
        eventSource.close()

        // Mark sync as complete (enrichment happens during sync)
        setState('complete')
        setProgress(100)
        // Notify gallery and header to refresh
        window.dispatchEvent(new CustomEvent('sync-complete'))
        window.dispatchEvent(new CustomEvent('stats-updated'))
      })

      eventSource.addEventListener('error', (e) => {
        if (e instanceof MessageEvent) {
          const data = JSON.parse(e.data)
          setError(data.message)
        } else {
          setError('Connection lost')
        }
        setState('error')
        eventSource.close()
      })

      eventSource.onerror = () => {
        if (state !== 'complete' && state !== 'error') {
          setError('Connection lost')
          setState('error')
        }
        eventSource.close()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync')
      setState('error')
    }
  }, [fetchAll, onComplete, state])

  // Start sync when modal opens
  useEffect(() => {
    if (isOpen && state === 'idle') {
      startSync()
    }
  }, [isOpen, state, startSync])

  // Reset when closed
  useEffect(() => {
    if (!isOpen) {
      setState('idle')
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg border shadow-lg w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {state === 'complete' ? 'Sync Complete!' : state === 'error' ? 'Sync Failed' : 'Syncing Bookmarks'}
          </h2>
          {(state === 'complete' || state === 'error') && (
            <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">
                {state === 'connecting' && 'Connecting...'}
                {state === 'fetching' && `Fetching page ${pageNumber}...`}
                {state === 'processing' && `Processing ${processedTweets} of ${totalTweets}`}
                {state === 'complete' && 'Complete!'}
                {state === 'error' && 'Error'}
              </span>
              <span className="text-sm font-medium">{progress}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  state === 'error' ? 'bg-red-500' : state === 'complete' ? 'bg-green-500' : 'bg-primary'
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {newBookmarks}
              </div>
              <div className="text-xs text-muted-foreground">New</div>
            </div>
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className="text-2xl font-bold text-muted-foreground">
                {duplicates}
              </div>
              <div className="text-xs text-muted-foreground">Duplicates</div>
            </div>
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className="text-2xl font-bold">
                {totalTweets}
              </div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
          </div>

          {/* Current Tweet Preview */}
          {currentTweet && state === 'processing' && (
            <div className="bg-secondary/30 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                <span className="text-sm font-medium">@{currentTweet.author}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {currentTweet.text}
              </p>
            </div>
          )}

          {/* Status Icons */}
          {state === 'complete' && (
            <div className="flex items-center justify-center gap-2 text-green-600 mb-4">
              <CheckCircle className="w-8 h-8" />
              <span className="font-medium">
                {stats?.new || newBookmarks} new bookmarks added!
              </span>
            </div>
          )}

          {state === 'error' && (
            <div className="flex items-center justify-center gap-2 text-red-600 mb-4">
              <AlertCircle className="w-8 h-8" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Loading Animation */}
          {(state === 'connecting' || state === 'fetching') && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Fetching from Twitter...</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-muted/30">
          {state === 'complete' ? (
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          ) : state === 'error' ? (
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setState('idle')
                  startSync()
                }}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Please wait while we sync your bookmarks...
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
