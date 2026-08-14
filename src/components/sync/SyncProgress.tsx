'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, CheckCircle, AlertCircle, RefreshCw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConnectWithX } from '@/components/matter'
import { parseSyncErrorEvent, type SyncErrorCode } from '@/lib/sync/messages'

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
  /** Run the sync without showing the modal unless it fails. */
  silent?: boolean
}

type SyncState = 'idle' | 'connecting' | 'fetching' | 'processing' | 'complete' | 'error'

export function SyncProgress({
  isOpen,
  onClose,
  fetchAll = false,
  onComplete,
  silent = false,
}: SyncProgressProps) {
  const [state, setState] = useState<SyncState>('idle')
  const [progress, setProgress] = useState(0)
  const [totalTweets, setTotalTweets] = useState(0)
  const [processedTweets, setProcessedTweets] = useState(0)
  const [duplicates, setDuplicates] = useState(0)
  const [newBookmarks, setNewBookmarks] = useState(0)
  const [currentTweet, setCurrentTweet] = useState<CurrentTweet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<SyncErrorCode | null>(null)
  const [pageNumber, setPageNumber] = useState(0)
  const [stats, setStats] = useState<SyncStats | null>(null)
  // Set once a terminal event (complete/error) is handled, so the built-in
  // EventSource `onerror` (which fires when the stream closes — including a
  // clean close right after a server `error` event) doesn't clobber the real
  // error message with a generic "Connection lost". A ref avoids the stale
  // closure that made the old `state`-based guard unreliable.
  const terminalRef = useRef(false)
  const silentRef = useRef(silent)
  silentRef.current = silent
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const startSync = useCallback(async () => {
    terminalRef.current = false
    setState('connecting')
    setProgress(0)
    setTotalTweets(0)
    setProcessedTweets(0)
    setDuplicates(0)
    setNewBookmarks(0)
    setCurrentTweet(null)
    setError(null)
    setErrorCode(null)
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
        terminalRef.current = true
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
        if (silentRef.current) onCloseRef.current()
      })

      eventSource.addEventListener('error', (e) => {
        terminalRef.current = true
        const parsed = parseSyncErrorEvent(e)
        setError(parsed.message)
        setErrorCode(parsed.code)
        setState('error')
        eventSource.close()
      })

      eventSource.onerror = () => {
        // Only a real connection drop — a terminal `error`/`complete` already
        // set a meaningful message, so don't overwrite it with "Connection lost".
        if (!terminalRef.current) {
          setError('Connection lost. Check your network and try again.')
          setErrorCode('generic')
          setState('error')
        }
        eventSource.close()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync')
      setErrorCode('generic')
      setState('error')
    }
  }, [fetchAll, onComplete])

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
  // Background/resume sync: stay invisible unless we need the user (reconnect).
  if (silent && state !== 'error') return null

  const failedBeforeAnyWork = state === 'error' && totalTweets === 0 && processedTweets === 0
  const needsReconnect = errorCode === 'reauth'
  const reconnect = () => {
    window.location.href = '/api/auth/twitter'
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg border shadow-lg w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {state === 'complete'
              ? 'Sync Complete!'
              : state === 'error'
                ? needsReconnect
                  ? 'Reconnect your X account'
                  : "Couldn't sync bookmarks"
                : 'Syncing Bookmarks'}
          </h2>
          {(state === 'complete' || state === 'error') && (
            <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {!failedBeforeAnyWork && (
            <>
              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">
                    {state === 'connecting' && 'Connecting...'}
                    {state === 'fetching' && `Fetching page ${pageNumber}...`}
                    {state === 'processing' && `Processing ${processedTweets} of ${totalTweets}`}
                    {state === 'complete' && 'Complete!'}
                    {state === 'error' && 'Stopped'}
                  </span>
                  <span className="text-sm font-medium">{progress}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all duration-300',
                      state === 'error'
                        ? 'bg-red-500'
                        : state === 'complete'
                          ? 'bg-green-500'
                          : 'bg-primary',
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-3 bg-secondary/50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{newBookmarks}</div>
                  <div className="text-xs text-muted-foreground">New</div>
                </div>
                <div className="text-center p-3 bg-secondary/50 rounded-lg">
                  <div className="text-2xl font-bold text-muted-foreground">{duplicates}</div>
                  <div className="text-xs text-muted-foreground">Duplicates</div>
                </div>
                <div className="text-center p-3 bg-secondary/50 rounded-lg">
                  <div className="text-2xl font-bold">{totalTweets}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
              </div>
            </>
          )}

          {/* Current Tweet Preview */}
          {currentTweet && state === 'processing' && (
            <div className="bg-secondary/30 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                <span className="text-sm font-medium">@{currentTweet.author}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{currentTweet.text}</p>
            </div>
          )}

          {/* Status Icons */}
          {state === 'complete' && (
            <div className="flex items-center justify-center gap-2 text-green-600 mb-4">
              <CheckCircle className="w-8 h-8" />
              <span className="font-medium">{stats?.new || newBookmarks} new bookmarks added!</span>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center text-center gap-3 mb-2">
              <AlertCircle className="w-8 h-8 text-red-600" />
              <p className="text-[15px] leading-relaxed text-ink">{error}</p>
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
              {needsReconnect ? (
                <button
                  onClick={reconnect}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-ink text-surface rounded-md hover:opacity-90 transition-opacity font-semibold"
                >
                  <ConnectWithX size={14} />
                </button>
              ) : (
                <button
                  onClick={() => {
                    setState('idle')
                    startSync()
                  }}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Retry
                </button>
              )}
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
