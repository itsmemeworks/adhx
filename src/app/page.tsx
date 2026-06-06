'use client'

import { useEffect, useState, useCallback, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LandingPage } from '@/components/LandingPage'
import {
  FeedGrid,
  FilterBar,
  type FeedItem,
  type FilterType,
  type PlatformFilter,
  type SortType,
  type SortDirection,
  type TagItem,
  type StreamedBookmark,
  streamedBookmarkToFeedItem,
} from '@/components/feed'
import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { TriageMode } from '@/components/feed/TriageMode'
import { useTheme } from '@/lib/theme/context'

export default function FeedPage(): React.ReactElement {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ink-3" />
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
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>((searchParams.get('platform') as PlatformFilter) || 'all')
  const [sort, setSort] = useState<SortType>((searchParams.get('sort') as SortType) || 'added')
  const [sortDirection, setSortDirection] = useState<SortDirection>((searchParams.get('sortDir') as SortDirection) || 'desc')
  const [unreadOnly, setUnreadOnly] = useState(searchParams.get('unreadOnly') !== 'false')
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [triageQueue, setTriageQueue] = useState<FeedItem[]>([])
  const [triageStart, setTriageStart] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [stats, setStats] = useState({ total: 0, unread: 0 })
  const [triageOpen, setTriageOpen] = useState(false)
  const [markingRead, setMarkingRead] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<TagItem[]>([])
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; message?: string } | null>(null)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [streamedItems, setStreamedItems] = useState<FeedItem[]>([])
  const syncTriggeredRef = useRef(false)
  const [pendingNavigation, setPendingNavigation] = useState<{ id: string; fallbackUrl?: string } | null>(null)
  const prevLoadingRef = useRef(false)
  // Track seen item IDs for O(1) duplicate detection during sync streaming
  const seenItemIdsRef = useRef<Set<string>>(new Set())
  // Track EventSource for cleanup on unmount to prevent memory leaks
  const eventSourceRef = useRef<EventSource | null>(null)
  // Ref to access current items without adding to useCallback deps
  const itemsRef = useRef(items)
  itemsRef.current = items
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)

  // Open the unified triage viewer on a snapshot of the queue at a given index.
  const openTriage = useCallback((queue: FeedItem[], start: number) => {
    setTriageQueue(queue)
    setTriageStart(Math.max(0, start))
    setTriageOpen(true)
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
      // Allow gallery to render streamed items immediately (fixes skeleton showing forever)
      setLoading(false)
      // Initialize seen IDs Set with current items for O(1) duplicate detection
      seenItemIdsRef.current = new Set(itemsRef.current.map(i => i.id))

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
            // Add to main items array for immediate gallery update
            setItems(prev => [feedItem, ...prev])
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
  }, [isSyncing, router])

  // Cleanup EventSource on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    async function checkAuth(): Promise<void> {
      try {
        const response = await fetch('/api/auth/twitter/status')
        const data = await response.json()
        setIsAuthenticated(data.authenticated)

        if (data.authenticated && searchParams.get('firstLogin') === 'true' && !syncTriggeredRef.current) {
          syncTriggeredRef.current = true
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
        if (platformFilter !== 'all') params.set('platform', platformFilter)
        if (sort !== 'added') params.set('sort', sort)
        if (sortDirection !== 'desc') params.set('sortDir', sortDirection)
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
    [filter, platformFilter, sort, sortDirection, unreadOnly, search, page, selectedTags]
  )

  useEffect(() => {
    const urlFilter = (searchParams.get('filter') as FilterType) || 'all'
    const urlSort = (searchParams.get('sort') as SortType) || 'added'
    const urlSortDir = (searchParams.get('sortDir') as SortDirection) || 'desc'
    const urlUnreadOnly = searchParams.get('unreadOnly') !== 'false'
    const urlSearch = searchParams.get('search') || ''

    if (urlFilter !== filter) setFilter(urlFilter)
    if (urlSort !== sort) setSort(urlSort)
    if (urlSortDir !== sortDirection) setSortDirection(urlSortDir)
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
  }, [filter, platformFilter, sort, sortDirection, unreadOnly, search, selectedTags, isSyncing, isAuthenticated])

  useEffect(() => {
    if (isAuthenticated) {
      fetchTags()
    }
  }, [isAuthenticated, fetchTags])

  useEffect(() => {
    if (page > 1) fetchFeed(false)
  }, [page])

  // Listen for sync-complete events from Header's SyncProgress component
  // This is needed because Header-triggered syncs don't set isSyncing in this component
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
    if (pendingNavigation && wasLoading && !loading && items.length > 0) {
      const targetIndex = items.findIndex((i) => i.id === pendingNavigation.id)
      if (targetIndex !== -1) {
        openTriage(items, targetIndex)
      } else if (pendingNavigation.fallbackUrl) {
        // Parent tweet not in user's collection - open externally as fallback
        window.open(pendingNavigation.fallbackUrl, "_blank")
      }
      // Clear pending navigation regardless of outcome
      setPendingNavigation(null)
    }
  }, [pendingNavigation, items, loading])

  useEffect(() => {
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('filter', filter)
    if (platformFilter !== 'all') params.set('platform', platformFilter)
    if (sort !== 'added') params.set('sort', sort)
    if (sortDirection !== 'desc') params.set('sortDir', sortDirection)
    if (!unreadOnly) params.set('unreadOnly', 'false')
    if (search) params.set('search', search)
    const queryString = params.toString()
    router.replace(queryString ? `?${queryString}` : '/', { scroll: false })
  }, [filter, platformFilter, sort, sortDirection, unreadOnly, search, router])

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
      openTriage(items, currentIndex)
      return
    }

    // If not found, switch to 'all' filter with no search/tag constraints
    // and use pendingNavigationId to open once loaded
    setFilter('all')
    setUnreadOnly(true)
    setSearch('')
    setSelectedTags([])
    setPendingNavigation({ id: openId })
  }, [searchParams]) // Only run when searchParams changes

  // Handle ?added=success URL parameter after adding tweet via URL prefix
  useEffect(() => {
    const added = searchParams.get('added')
    const tweetId = searchParams.get('tweetId')

    if (!added || !tweetId) return

    // Clear the added params from URL immediately
    const params = new URLSearchParams(searchParams.toString())
    params.delete('added')
    params.delete('tweetId')
    params.delete('author')
    params.delete('text')
    params.delete('error')
    const queryString = params.toString()
    router.replace(queryString ? `?${queryString}` : '/', { scroll: false })

    // Refresh the feed to include the newly added tweet
    fetchFeed(true).then(() => {
      // After feed loads, find and open the new tweet
      // Use a small delay to ensure items state is updated
      setTimeout(() => {
        const newIndex = items.findIndex((i) => i.id === tweetId)
        if (newIndex !== -1) {
          openTriage(items, newIndex)
        } else {
          // If not found in current view, use pending navigation
          setPendingNavigation({ id: tweetId })
        }
      }, 100)
    })
  }, [searchParams]) // Only run when searchParams changes

  // The Matter top-bar Triage pill dispatches `open-triage`; open the focus
  // queue on the current unread items.
  useEffect(() => {
    const handler = () => openTriage(items.filter((i) => !i.isRead), 0)
    window.addEventListener('open-triage', handler)
    return () => window.removeEventListener('open-triage', handler)
  }, [items, openTriage])

  // Drop/mark items the triage mode resolved, keeping the feed in sync.
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
    [unreadOnly],
  )

  // Undo of a triage archive: restore the item to unread + bump the count back.
  const handleTriageRestored = useCallback((item: FeedItem) => {
    setItems((prev) =>
      prev.some((i) => i.id === item.id)
        ? prev.map((i) => (i.id === item.id ? { ...i, isRead: false } : i))
        : [{ ...item, isRead: false }, ...prev], // was dropped under unreadOnly — re-add it
    )
    setStats((prev) => ({ ...prev, unread: prev.unread + 1 }))
  }, [])

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


  // Global keyboard shortcuts (when lightbox is NOT open)
  useEffect(() => {
    // Skip if lightbox is open (those shortcuts are handled above) or shortcuts modal is open
    if (triageOpen || showShortcutsModal) return
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
      '7': 'manual',
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
            openTriage(items, 0)
          }
          break
        case 't':
        case 'T':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('toggle-tag-filter'))
          break
        case 'o':
        case 'O':
          e.preventDefault()
          setSort((prev) => (prev === 'added' ? 'posted' : 'added'))
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
  }, [triageOpen, isAuthenticated, router, showShortcutsModal, items.length, resolvedTheme, setTheme])

  function loadMore(): void {
    if (!loading && hasMore) {
      setPage((p) => p + 1)
    }
  }

  if (isAuthenticated === null) {
    // Show minimal loading state while checking auth
    // This prevents flash of skeleton loaders on the landing page
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ink-3" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LandingPage />
  }

  return (
    <div className="min-h-screen bg-paper">
      {/* Full Sync Modal (for first login) */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-hairline">
              <h2 className="text-xl font-semibold text-ink">
                {isSyncing ? 'Syncing Your Bookmarks' : 'Sync Complete!'}
              </h2>
              <p className="text-sm text-ink-3 mt-1">
                {isSyncing
                  ? 'Your bookmarks are being imported. Watch them appear in real-time!'
                  : `Successfully imported ${syncProgress?.current || 0} bookmarks.`}
              </p>
            </div>

            {/* Progress Section */}
            <div className="px-6 py-4 bg-inset">
              <div className="flex items-center gap-3">
                {isSyncing ? (
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                )}
                <span className="text-sm font-medium text-ink-2">
                  {syncProgress?.message}
                </span>
                {syncProgress && syncProgress.total > 0 && (
                  <span className="ml-auto text-xs font-medium bg-inset px-2 py-1 rounded">
                    {syncProgress.current}/{syncProgress.total}
                  </span>
                )}
              </div>
              {syncProgress && syncProgress.total > 0 && (
                <div className="mt-3 h-2 bg-inset rounded-full overflow-hidden">
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
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-inset">
                        <img
                          src={item.media[0].thumbnailUrl || item.media[0].url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : item.articlePreview?.imageUrl ? (
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-inset">
                        <img
                          src={item.articlePreview.imageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-lg flex-shrink-0 bg-inset flex items-center justify-center">
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
                        <span className="text-sm font-medium text-ink truncate">
                          @{item.author}
                        </span>
                        {item.category && item.category !== 'tweet' && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                            {item.category}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-ink-2 line-clamp-2">
                        {item.text}
                      </p>
                    </div>
                  </div>
                ))}
                {streamedItems.length > 10 && (
                  <p className="text-center text-sm text-ink-3">
                    +{streamedItems.length - 10} more bookmarks...
                  </p>
                )}
                {streamedItems.length === 0 && isSyncing && (
                  <p className="text-center text-sm text-ink-3 py-8">
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

      <ErrorBoundary componentName="FilterBar">
        <FilterBar
          filter={filter}
          onFilterChange={setFilter}
          platform={platformFilter}
          onPlatformChange={setPlatformFilter}
          sort={sort}
          onSortChange={setSort}
          sortDirection={sortDirection}
          onSortDirectionChange={setSortDirection}
          unreadOnly={unreadOnly}
          onUnreadOnlyChange={setUnreadOnly}
          selectedTags={selectedTags}
          onSelectedTagsChange={setSelectedTags}
          availableTags={availableTags}
          stats={stats}
          onTagUpdated={(tag, isPublic, shareUrl) => {
            // Update the local availableTags state with the new share info
            setAvailableTags((prev) =>
              prev.map((t) => (t.tag === tag ? { ...t, isPublic, shareUrl } : t))
            )
          }}
        />
      </ErrorBoundary>

      {/* Triage now lives in the top bar (Matter); it dispatches `open-triage`,
          which we listen for below. Live activity moved to the Discover view. */}
      <div className="px-4 sm:px-[26px] py-4">
        <ErrorBoundary componentName="FeedGrid">
          <FeedGrid
            items={items}
            loading={loading}
            hasMore={hasMore}
            lastSyncAt={lastSyncAt}
            sortField={sort === 'posted' ? 'createdAt' : 'processedAt'}
            unreadOnly={unreadOnly}
            stats={stats}
            onExpand={(idx) => openTriage(items, idx)}
            onMarkRead={handleMarkAsRead}
            onRemove={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
            onLoadMore={loadMore}
            onShowAll={() => setUnreadOnly(false)}
          />
        </ErrorBoundary>
      </div>

      <ErrorBoundary componentName="TriageMode">
        <TriageMode
          isOpen={triageOpen}
          onClose={() => {
            setTriageOpen(false)
            // Refresh the top-bar streak + counts after a triage session.
            window.dispatchEvent(new CustomEvent('stats-updated'))
          }}
          initialQueue={triageQueue}
          startIndex={triageStart}
          availableTags={availableTags}
          onItemResolved={handleTriageResolved}
          onItemRestored={handleTriageRestored}
          onTagAdd={(id, tag) => handleAddTag(id, tag)}
          onTagRemove={(id, tag) => handleRemoveTag(id, tag)}
        />
      </ErrorBoundary>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
        inFocusMode={triageOpen}
      />
    </div>
  )
}
