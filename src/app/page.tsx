'use client'

import { useEffect, useState, useCallback, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LandingPage } from '@/components/LandingPage'
import {
  FeedGrid,
  FilterBar,
  Lightbox,
  type FeedItem,
  type FilterType,
  type TagItem,
  type StreamedBookmark,
  streamedBookmarkToFeedItem,
} from '@/components/feed'
import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { useTheme } from '@/lib/theme/context'

function _FeedLoadingSkeleton(): React.ReactElement {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 w-20 bg-gray-200 dark:bg-gray-800 rounded-full animate-pulse" />
          ))}
        </div>
        <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="mb-4 break-inside-avoid">
              <div
                className={`bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse ${
                  i % 3 === 0 ? 'h-80' : i % 3 === 1 ? 'h-48' : 'h-64'
                }`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function FeedPage(): React.ReactElement {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    }>
      <FeedPageContent />
    </Suspense>
  )
}

function FeedPageContent(): React.ReactElement {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { resolvedTheme, setTheme } = useTheme()

  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>((searchParams.get('filter') as FilterType) || 'all')
  const [unreadOnly, setUnreadOnly] = useState(searchParams.get('unreadOnly') !== 'false')
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [stats, setStats] = useState({ total: 0, unread: 0 })
  const [markingRead, setMarkingRead] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<TagItem[]>([])
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; message?: string } | null>(null)
  const [_isFirstLogin, setIsFirstLogin] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [streamedItems, setStreamedItems] = useState<FeedItem[]>([])
  const syncTriggeredRef = useRef(false)
  const [pendingNavigationId, setPendingNavigationId] = useState<string | null>(null)
  const prevLoadingRef = useRef(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)

  const selectedItem = selectedIndex !== null ? items[selectedIndex] : null

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

      // Show modal for first login, clear streamed items
      if (firstLogin) {
        setShowSyncModal(true)
        setStreamedItems([])
      }

      const eventSource = new EventSource('/api/sync')

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
          // Add to streamed items for modal view
          setStreamedItems(prev => [feedItem, ...prev])
          // Also add to main items array for immediate gallery update
          setItems(prev => {
            // Avoid duplicates
            if (prev.some(i => i.id === feedItem.id)) return prev
            return [feedItem, ...prev]
          })
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
        setIsSyncing(false)
        router.replace('/', { scroll: false })
        window.dispatchEvent(new CustomEvent('sync-complete'))

        // Keep modal open for 2s after completion so user can see final state
        if (firstLogin) {
          setTimeout(() => {
            setShowSyncModal(false)
            setIsFirstLogin(false)
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
        setIsSyncing(false)
        setShowSyncModal(false)
        setTimeout(() => setSyncProgress(null), 3000)
      })

      eventSource.onerror = () => {
        eventSource.close()
        setIsSyncing(false)
        setShowSyncModal(false)
      }
    } catch (error) {
      console.error('Failed to start sync:', error)
      setIsSyncing(false)
      setShowSyncModal(false)
      setSyncProgress(null)
    }
  }, [isSyncing, router])

  useEffect(() => {
    async function checkAuth(): Promise<void> {
      try {
        const response = await fetch('/api/auth/twitter/status')
        const data = await response.json()
        setIsAuthenticated(data.authenticated)

        if (data.authenticated && searchParams.get('firstLogin') === 'true' && !syncTriggeredRef.current) {
          syncTriggeredRef.current = true
          setIsFirstLogin(true)
          // Start sync with firstLogin=true to show full modal
          setTimeout(() => startSync(true), 500)
        }
      } catch (error) {
        console.error('Failed to check auth status:', error)
        setIsAuthenticated(false)
      }
    }
    checkAuth()
  }, [searchParams, startSync])

  const fetchTags = useCallback(async () => {
    try {
      const response = await fetch('/api/tags')
      const data = await response.json()
      setAvailableTags(data.tags || [])
    } catch (error) {
      console.error('Failed to fetch tags:', error)
    }
  }, [])

  const fetchFeed = useCallback(
    async (resetPage = false) => {
      const currentPage = resetPage ? 1 : page
      if (resetPage) setPage(1)

      try {
        setLoading(true)
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: '50',
          filter,
          unreadOnly: unreadOnly.toString(),
        })
        if (search) params.set('search', search)
        selectedTags.forEach((tag) => params.append('tag', tag))

        const response = await fetch(`/api/feed?${params}`)
        const data = await response.json()

        if (resetPage) {
          setItems(data.items || [])
        } else {
          setItems((prev) => [...prev, ...(data.items || [])])
        }

        setHasMore(data.pagination?.page < data.pagination?.totalPages)
        setStats({ total: data.stats?.total || 0, unread: data.stats?.unread || 0 })
        if (data.lastSyncAt) setLastSyncAt(data.lastSyncAt)
      } catch (error) {
        console.error('Failed to fetch feed:', error)
      } finally {
        setLoading(false)
      }
    },
    [filter, unreadOnly, search, page, selectedTags]
  )

  useEffect(() => {
    const urlFilter = (searchParams.get('filter') as FilterType) || 'all'
    const urlUnreadOnly = searchParams.get('unreadOnly') !== 'false'
    const urlSearch = searchParams.get('search') || ''

    if (urlFilter !== filter) setFilter(urlFilter)
    if (urlUnreadOnly !== unreadOnly) setUnreadOnly(urlUnreadOnly)
    if (urlSearch !== search) setSearch(urlSearch)
  }, [searchParams])

  useEffect(() => {
    // Skip if not authenticated - landing page will be shown
    if (!isAuthenticated) return
    // Skip fetching during sync - streamed items are being added directly to state
    // and sync-complete will trigger a proper fetch when done
    if (isSyncing) return
    fetchFeed(true)
  }, [filter, unreadOnly, search, selectedTags, isSyncing, isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) {
      fetchTags()
    }
  }, [isAuthenticated, fetchTags])

  useEffect(() => {
    if (page > 1) fetchFeed(false)
  }, [page])

  // Note: sync-complete fetch is now handled by the filter/isSyncing effect above
  // When isSyncing changes to false, that effect triggers fetchFeed(true)

  useEffect(() => {
    const handleTweetAdded = () => fetchFeed(true)
    window.addEventListener('tweet-added', handleTweetAdded)
    return () => window.removeEventListener('tweet-added', handleTweetAdded)
  }, [fetchFeed])

  // Handle pending navigation after filter change and items reload
  // Only navigate when loading transitions from true to false (fetch completed)
  useEffect(() => {
    const wasLoading = prevLoadingRef.current
    prevLoadingRef.current = loading

    // Only proceed if we have a pending navigation AND loading just finished
    if (pendingNavigationId && wasLoading && !loading && items.length > 0) {
      const targetIndex = items.findIndex((i) => i.id === pendingNavigationId)
      if (targetIndex !== -1) {
        setSelectedIndex(targetIndex)
      }
      // Clear pending navigation regardless of whether we found it
      setPendingNavigationId(null)
    }
  }, [pendingNavigationId, items, loading])

  useEffect(() => {
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('filter', filter)
    if (!unreadOnly) params.set('unreadOnly', 'false')
    if (search) params.set('search', search)
    const queryString = params.toString()
    router.replace(queryString ? `?${queryString}` : '/', { scroll: false })
  }, [filter, unreadOnly, search, router])

  // Handle ?open=tweetId URL parameter to open a specific tweet in lightbox
  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId) return

    // Clear the open param from URL immediately
    const params = new URLSearchParams(searchParams.toString())
    params.delete('open')
    const queryString = params.toString()
    router.replace(queryString ? `?${queryString}` : '/', { scroll: false })

    // Try to find it in current items first
    const currentIndex = items.findIndex((i) => i.id === openId)
    if (currentIndex !== -1) {
      setSelectedIndex(currentIndex)
      return
    }

    // If not found, switch to 'all' filter with no search/tag constraints
    // and use pendingNavigationId to open once loaded
    setFilter('all')
    setUnreadOnly(true)
    setSearch('')
    setSelectedTags([])
    setPendingNavigationId(openId)
  }, [searchParams]) // Only run when searchParams changes

  const handleMarkAsRead = useCallback(
    async (id: string) => {
      if (markingRead) return
      setMarkingRead(true)

      try {
        const item = items.find((i) => i.id === id)
        const method = item?.isRead ? 'DELETE' : 'POST'

        await fetch(`/api/bookmarks/${id}/read`, { method })

        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isRead: !i.isRead } : i)))
        setStats((prev) => ({
          ...prev,
          unread: item?.isRead ? prev.unread + 1 : Math.max(0, prev.unread - 1),
        }))
        window.dispatchEvent(new CustomEvent('stats-updated'))
      } catch (error) {
        console.error('Failed to mark as read:', error)
      } finally {
        setMarkingRead(false)
      }
    },
    [markingRead, items]
  )

  const handleAddTag = useCallback(
    async (itemId: string, tag: string) => {
      const response = await fetch(`/api/bookmarks/${itemId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to add tag')
      }
      setItems((prev) =>
        prev.map((i) => (i.id === itemId && !i.tags.includes(tag) ? { ...i, tags: [...i.tags, tag] } : i))
      )
      fetchTags()
    },
    [fetchTags]
  )

  const handleRemoveTag = useCallback(
    async (itemId: string, tag: string) => {
      const response = await fetch(`/api/bookmarks/${itemId}/tags`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      })
      if (!response.ok) {
        throw new Error('Failed to remove tag')
      }
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, tags: i.tags.filter((t) => t !== tag) } : i)))
      fetchTags()
    },
    [fetchTags]
  )

  useEffect(() => {
    if (selectedIndex === null) return

    function handleKeyDown(e: KeyboardEvent): void {
      // Don't trigger shortcuts when typing in input fields
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        // First Escape: blur the input. Second Escape: close lightbox
        if (e.key === 'Escape') {
          ;(document.activeElement as HTMLElement).blur()
          e.preventDefault()
        }
        return
      }

      // Don't capture shortcuts when modifier keys are pressed (allow Cmd+R, Ctrl+R, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case 'Escape':
          setSelectedIndex(null)
          break
        case 'ArrowLeft':
          e.preventDefault()
          setSelectedIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : items.length - 1))
          break
        case 'ArrowRight':
          e.preventDefault()
          setSelectedIndex((prev) => (prev !== null && prev < items.length - 1 ? prev + 1 : 0))
          break
        case 'r':
        case 'R':
          if (selectedItem && !selectedItem.isRead) {
            handleMarkAsRead(selectedItem.id)
            // Auto-advance when in unread-only mode (same behavior as clicking the checkmark)
            if (unreadOnly) {
              setTimeout(() => {
                if (items.length <= 1) {
                  setSelectedIndex(null)
                } else if (selectedIndex !== null && selectedIndex >= items.length - 1) {
                  setSelectedIndex(selectedIndex - 1)
                }
                setItems((prev) => prev.filter((i) => i.id !== selectedItem.id))
              }, 150)
            }
          }
          break
        case 'u':
        case 'U':
          if (selectedItem && selectedItem.isRead) {
            handleMarkAsRead(selectedItem.id)
          }
          break
        case 'q':
        case 'Q':
          // Navigate to quoted tweet
          if (selectedItem?.quotedTweetId) {
            const quotedIndex = items.findIndex((i) => i.id === selectedItem.quotedTweetId)
            if (quotedIndex !== -1) {
              setSelectedIndex(quotedIndex)
            } else {
              // Quoted tweet not in current feed - switch to "all" filter and navigate after reload
              setPendingNavigationId(selectedItem.quotedTweetId)
              setFilter('all')
              setUnreadOnly(false)
              setSearch('')
            }
          }
          break
        case 'p':
        case 'P':
          // Navigate to parent tweet (tweet that quoted this one)
          if (selectedItem?.parentTweets?.[0]) {
            const parentId = selectedItem.parentTweets[0].id
            const parentIndex = items.findIndex((i) => i.id === parentId)
            if (parentIndex !== -1) {
              setSelectedIndex(parentIndex)
            } else {
              // Parent not in current feed - switch to "all" filter and navigate after reload
              setPendingNavigationId(parentId)
              setFilter('all')
              setUnreadOnly(false) // Also clear unread filter to ensure we find it
              setSearch('') // Clear search too
            }
          }
          break
        case 'x':
        case 'X':
          // Open current tweet externally
          if (selectedItem?.tweetUrl) {
            window.open(selectedItem.tweetUrl, '_blank')
          }
          break
        case 'g':
        case 'G':
          // Back to gallery
          setSelectedIndex(null)
          break
        case '?':
          // Show shortcuts help
          e.preventDefault()
          setShowShortcutsModal(true)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIndex, items, selectedItem, handleMarkAsRead, unreadOnly])

  // Global keyboard shortcuts (when lightbox is NOT open)
  useEffect(() => {
    // Skip if lightbox is open (those shortcuts are handled above) or shortcuts modal is open
    if (selectedIndex !== null || showShortcutsModal) return
    // Skip if not authenticated
    if (!isAuthenticated) return

    // Filter key mapping (matches FILTER_OPTIONS order)
    const filterKeyMap: Record<string, FilterType> = {
      '1': 'all',
      '2': 'photos',
      '3': 'videos',
      '4': 'text',
      '5': 'articles',
      '6': 'quoted',
    }

    function handleGlobalKeyDown(e: KeyboardEvent): void {
      // Don't trigger shortcuts when typing in input fields
      const activeEl = document.activeElement
      const isInputFocused = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA'

      if (isInputFocused) {
        // Escape unfocuses the input
        if (e.key === 'Escape') {
          ;(activeEl as HTMLElement).blur()
          e.preventDefault()
        }
        return
      }

      // Don't capture shortcuts when modifier keys are pressed (allow Cmd+R, Ctrl+R, etc.)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          // Close any open modals
          window.dispatchEvent(new CustomEvent('close-add-tweet'))
          break
        case '/':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('focus-search'))
          break
        case '?':
          e.preventDefault()
          setShowShortcutsModal(true)
          break
        case 'a':
        case 'A':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('open-add-tweet'))
          break
        case 'g':
        case 'G':
          e.preventDefault()
          router.push('/')
          break
        case ',':
          e.preventDefault()
          router.push('/settings')
          break
        case 'b':
        case 'B':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('open-sync'))
          break
        case 'u':
        case 'U':
          e.preventDefault()
          setUnreadOnly((prev) => !prev)
          break
        case 'f':
        case 'F':
          // Focus mode - open first item
          e.preventDefault()
          if (items.length > 0) {
            setSelectedIndex(0)
          }
          break
        case 't':
        case 'T':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('toggle-tag-filter'))
          break
        case 'd':
        case 'D':
          e.preventDefault()
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
          break
        default:
          // Check for filter number keys (1-6)
          if (filterKeyMap[e.key]) {
            e.preventDefault()
            setFilter(filterKeyMap[e.key])
          }
          break
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [selectedIndex, isAuthenticated, router, showShortcutsModal, items.length, resolvedTheme, setTheme])

  function loadMore(): void {
    if (!loading && hasMore) {
      setPage((p) => p + 1)
    }
  }

  if (isAuthenticated === null) {
    // Show minimal loading state while checking auth
    // This prevents flash of skeleton loaders on the landing page
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LandingPage />
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Full Sync Modal (for first login) */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isSyncing ? 'Syncing Your Bookmarks' : 'Sync Complete!'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {isSyncing
                  ? 'Your bookmarks are being imported. Watch them appear in real-time!'
                  : `Successfully imported ${syncProgress?.current || 0} bookmarks.`}
              </p>
            </div>

            {/* Progress Section */}
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-3">
                {isSyncing ? (
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {syncProgress?.message}
                </span>
                {syncProgress && syncProgress.total > 0 && (
                  <span className="ml-auto text-xs font-medium bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                    {syncProgress.current}/{syncProgress.total}
                  </span>
                )}
              </div>
              {syncProgress && syncProgress.total > 0 && (
                <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300 ease-out"
                    style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* Streaming Preview */}
            <div className="px-6 py-4 max-h-80 overflow-y-auto">
              <div className="space-y-3">
                {streamedItems.slice(0, 10).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/30 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300"
                  >
                    {/* Thumbnail */}
                    {item.media?.[0] ? (
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                        <img
                          src={item.media[0].thumbnailUrl || item.media[0].url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : item.articlePreview?.imageUrl ? (
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                        <img
                          src={item.articlePreview.imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-lg flex-shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-2xl">💬</span>
                      </div>
                    )}
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {item.authorProfileImageUrl && (
                          <img
                            src={item.authorProfileImageUrl}
                            alt=""
                            className="w-4 h-4 rounded-full"
                          />
                        )}
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          @{item.author}
                        </span>
                        {item.category && item.category !== 'tweet' && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                            {item.category}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {item.text}
                      </p>
                    </div>
                  </div>
                ))}
                {streamedItems.length > 10 && (
                  <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                    +{streamedItems.length - 10} more bookmarks...
                  </p>
                )}
                {streamedItems.length === 0 && isSyncing && (
                  <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
                    Waiting for bookmarks...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sync Progress Banner (for non-first-login syncs) */}
      {syncProgress && !showSyncModal && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-gray-800 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3">
          {isSyncing && (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          <span className="text-sm font-medium">{syncProgress.message}</span>
          {syncProgress.total > 0 && (
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
              {syncProgress.current}/{syncProgress.total}
            </span>
          )}
        </div>
      )}

      <FilterBar
        filter={filter}
        onFilterChange={setFilter}
        unreadOnly={unreadOnly}
        onUnreadOnlyChange={setUnreadOnly}
        selectedTags={selectedTags}
        onSelectedTagsChange={setSelectedTags}
        availableTags={availableTags}
        stats={stats}
      />

      <div className="p-4">
        <FeedGrid
          items={items}
          loading={loading}
          hasMore={hasMore}
          lastSyncAt={lastSyncAt}
          unreadOnly={unreadOnly}
          stats={stats}
          onExpand={setSelectedIndex}
          onMarkRead={handleMarkAsRead}
          onRemove={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
          onLoadMore={loadMore}
          onShowAll={() => setUnreadOnly(false)}
        />
      </div>

      {selectedItem && selectedIndex !== null && (
        <Lightbox
          item={selectedItem}
          index={selectedIndex}
          total={items.length}
          onClose={() => setSelectedIndex(null)}
          onPrev={() => setSelectedIndex(selectedIndex > 0 ? selectedIndex - 1 : items.length - 1)}
          onNext={() => setSelectedIndex(selectedIndex < items.length - 1 ? selectedIndex + 1 : 0)}
          onMarkRead={() => handleMarkAsRead(selectedItem.id)}
          markingRead={markingRead}
          onTagAdd={(tag) => handleAddTag(selectedItem.id, tag)}
          onTagRemove={(tag) => handleRemoveTag(selectedItem.id, tag)}
          availableTags={availableTags}
          unreadOnly={unreadOnly}
          onRemoveItem={() => setItems((prev) => prev.filter((i) => i.id !== selectedItem.id))}
          onNavigateToId={(id) => {
            const targetIndex = items.findIndex((i) => i.id === id)
            if (targetIndex !== -1) {
              setSelectedIndex(targetIndex)
              return true
            }
            return false
          }}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
        inFocusMode={selectedIndex !== null}
      />
    </div>
  )
}
