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
import { Loader2, CheckCircle2, MessageSquare } from 'lucide-react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import type { TriageTab } from '@/components/theater/types'
import { PasteToPreview } from '@/components/PasteToPreview'
import { useTheme } from '@/lib/theme/context'
import { ConnectWithX } from '@/components/matter'
import { parseSyncErrorEvent, type SyncErrorCode } from '@/lib/sync/messages'

/**
 * Seed for triage's Live sub-tab (unified-theater-triage.md §2) — the same
 * live community pulse home mode uses, but AuthedHome has no server-rendered
 * trending items of its own to seed it with. `useTheaterFeed` polls
 * `/api/activity` immediately when seeded empty (see its 2026-08-20 change),
 * so this only costs a brief "Loading…" the first time a triage session's
 * Live tab is opened — module-level so it's a stable reference across
 * re-renders/re-opens.
 */
const TRIAGE_LIVE_SEED = { items: [], savedToday: 0, recentActivity: 0 }

export default function AuthedHome(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-paper flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-ink-3" />
        </div>
      }
    >
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
  const [filter, setFilter] = useState<FilterType>(
    (searchParams.get('filter') as FilterType) || 'all',
  )
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>(
    (searchParams.get('platform') as PlatformFilter) || 'all',
  )
  const [sort, setSort] = useState<SortType>((searchParams.get('sort') as SortType) || 'added')
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    (searchParams.get('sortDir') as SortDirection) || 'desc',
  )
  const [unreadOnly, setUnreadOnly] = useState(searchParams.get('unreadOnly') !== 'false')
  const [view, setView] = useState<'grid' | 'list' | 'bento'>('grid')
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [triageQueue, setTriageQueue] = useState<FeedItem[]>([])
  const [triageStart, setTriageStart] = useState(0)
  const [triageInitialTab, setTriageInitialTab] = useState<TriageTab>('collection')
  // Tag-select plumbing (unified-theater-triage.md §4, built by a parallel
  // agent) — FilterBar owns entering/exiting select mode; FeedGrid reads it
  // to render the tap-to-toggle-membership grid.
  const [tagSelectTag, setTagSelectTag] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [stats, setStats] = useState({ total: 0, unread: 0 })
  const [triageOpen, setTriageOpen] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<TagItem[]>([])
  const [syncProgress, setSyncProgress] = useState<{
    current: number
    total: number
    message?: string
  } | null>(null)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [syncErrorCode, setSyncErrorCode] = useState<SyncErrorCode | null>(null)
  const [streamedItems, setStreamedItems] = useState<FeedItem[]>([])
  const syncTriggeredRef = useRef(false)
  const syncTerminalRef = useRef(false)
  const [pendingNavigation, setPendingNavigation] = useState<{
    id: string
    fallbackUrl?: string
  } | null>(null)
  // Set when arriving via `?triage=1` (e.g. the Triage pill pressed on /discover);
  // opens the focus queue once the feed has loaded.
  const [pendingTriage, setPendingTriage] = useState(false)
  // Set when arriving via `?live=1` (e.g. the Header's Live nav pressed from
  // a page other than `/`, which has no `open-theater` listener of its own);
  // opens the theater on the Live tab once authenticated.
  const [pendingLive, setPendingLive] = useState(false)
  const prevLoadingRef = useRef(false)
  // Track seen item IDs for O(1) duplicate detection during sync streaming
  const seenItemIdsRef = useRef<Set<string>>(new Set())
  // Track EventSource for cleanup on unmount to prevent memory leaks
  const eventSourceRef = useRef<EventSource | null>(null)
  // Ref to access current items without adding to useCallback deps
  const itemsRef = useRef(items)
  itemsRef.current = items
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)

  // Feed layout (grid / list / bento), remembered per device.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('adhx-feed-view')
      if (saved === 'grid' || saved === 'list' || saved === 'bento') setView(saved)
    } catch {
      /* localStorage unavailable */
    }
  }, [])
  const changeView = useCallback((v: 'grid' | 'list' | 'bento') => {
    setView(v)
    try {
      localStorage.setItem('adhx-feed-view', v)
    } catch {
      /* ignore */
    }
  }, [])

  // Open the unified triage viewer on a snapshot of the queue at a given index.
  const openTriage = useCallback(
    (queue: FeedItem[], start: number, tab: TriageTab = 'collection') => {
      setTriageQueue(queue)
      setTriageStart(Math.max(0, start))
      setTriageInitialTab(tab)
      setTriageOpen(true)
    },
    [],
  )

  // PRODUCT DECISION REVERSAL — do not "fix" this back to reading current
  // view state. A previous iteration (#342) seeded the triage queue from the
  // CURRENT filter/platform/tag/search state, so the theater's Collection tab
  // always matched whatever the grid happened to be showing. The owner
  // reversed that: "Triage is just about marking a post as read or not read."
  // Triage is now strictly the full unread backlog, every time, regardless of
  // what's active in the grid behind it — a consistent queue instead of a
  // filtered snapshot. So the query below is fixed (unreadOnly=true, no
  // filter/platform/tag/search) rather than derived from component state.
  // The feed API caps at 100/request, which covers a typical backlog.
  const buildUnreadTriageQuery = useCallback(
    () => new URLSearchParams({ filter: 'all', unreadOnly: 'true', limit: '100' }),
    [],
  )

  const fetchUnreadQueue = useCallback(async (): Promise<FeedItem[]> => {
    let queue: FeedItem[] = items.filter((i) => !i.isRead)
    try {
      const res = await fetch(`/api/feed?${buildUnreadTriageQuery()}`)
      if (res.ok) {
        const data = await res.json()
        const fetched: FeedItem[] = (data.items || []).filter((i: FeedItem) => !i.isRead)
        if (fetched.length) queue = fetched
      }
    } catch {
      /* fall back to the loaded items, filtered to unread */
    }
    return queue
  }, [items, buildUnreadTriageQuery])

  const startTriageAll = useCallback(
    async (tab: TriageTab = 'collection') => {
      const queue = await fetchUnreadQueue()
      openTriage(queue, 0, tab)
    },
    [fetchUnreadQueue, openTriage],
  )

  // Open triage from a tapped gallery item: always the full unread backlog
  // (see the decision-reversal note above), starting on the item the user
  // tapped — which may live outside that backlog (e.g. it's already read, or
  // the grid is showing a tag/category view that mixes read + unread). Of the
  // two reasonable fallbacks (prepend it, or just open at the front of the
  // unread queue and ignore the tap), prepending is the least surprising:
  // tapping a specific card should always open ON that card, with the rest of
  // the unread backlog queued up right behind it.
  const openTriageFromItem = useCallback(
    async (idx: number) => {
      const clicked = items[idx]
      let queue = await fetchUnreadQueue()
      const plat = (i: FeedItem) => i.platform ?? 'twitter'
      let start = clicked
        ? queue.findIndex((i) => i.id === clicked.id && plat(i) === plat(clicked))
        : 0
      if (start === -1 && clicked) {
        queue = [clicked, ...queue]
        start = 0
      }
      openTriage(queue, Math.max(0, start))
    },
    [items, fetchUnreadQueue, openTriage],
  )

  const startSync = useCallback(
    async (firstLogin = false) => {
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
        setSyncErrorCode(null)
        syncTerminalRef.current = false
        setSyncProgress({ current: 0, total: 0, message: 'Starting sync...' })
        // Allow gallery to render streamed items immediately (fixes skeleton showing forever)
        setLoading(false)
        // Initialize seen IDs Set with current items for O(1) duplicate detection
        seenItemIdsRef.current = new Set(itemsRef.current.map((i) => i.id))

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
          setSyncProgress({
            current: 0,
            total: data.tweetsFound,
            message: `Found ${data.tweetsFound} bookmarks...`,
          })
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
              setStreamedItems((prev) => [feedItem, ...prev])
              // Add to main items array for immediate gallery update
              setItems((prev) => [feedItem, ...prev])
            }
          }
        })

        eventSource.addEventListener('complete', (e) => {
          syncTerminalRef.current = true
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
          syncTerminalRef.current = true
          const parsed = parseSyncErrorEvent(e)
          setSyncProgress({ current: 0, total: 0, message: parsed.message })
          setSyncErrorCode(parsed.code)
          eventSource.close()
          eventSourceRef.current = null
          setIsSyncing(false)
          if (firstLogin) {
            setShowSyncModal(true)
            // Drop ?firstLogin= so a refresh doesn't re-fire sync into a loop.
            router.replace('/', { scroll: false })
          } else {
            setTimeout(() => {
              setSyncProgress(null)
              setSyncErrorCode(null)
            }, 8000)
          }
        })

        eventSource.onerror = () => {
          if (!syncTerminalRef.current) {
            setSyncProgress({
              current: 0,
              total: 0,
              message: 'Connection lost. Check your network and try again.',
            })
            setSyncErrorCode('generic')
            setIsSyncing(false)
          }
          eventSource.close()
          eventSourceRef.current = null
          if (!firstLogin) setShowSyncModal(false)
        }
      } catch (error) {
        console.error('Failed to start sync:', error)
        setIsSyncing(false)
        setShowSyncModal(false)
        setSyncProgress(null)
      }
    },
    [isSyncing, router],
  )

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
        // /api/auth/me (not the X-only /api/auth/twitter/status) so email-only
        // accounts are treated as fully signed in here too.
        const response = await fetch('/api/auth/me')
        const data = await response.json()
        setIsAuthenticated(data.authenticated)

        if (
          data.authenticated &&
          searchParams.get('firstLogin') === 'true' &&
          !syncTriggeredRef.current
        ) {
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
        // Add-posts mode browses the WHOLE collection: drop the tag filter
        // (else the grid only shows posts already carrying the tag — nothing
        // left to add) and the unread-only gate (already-read posts are prime
        // tagging candidates). The FilterBar's selected-tag UI state is
        // untouched. VIEWING a tag also ignores unread: a tag is a deliberate
        // collection the user curated — read state is irrelevant there, and
        // the default unread-only filter otherwise greets a fully-read tag
        // with a misleading "All caught up" empty state.
        const addingToTag = tagSelectTag !== null
        const tagActive = addingToTag || selectedTags.length > 0
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: '50',
          filter,
          unreadOnly: (tagActive ? false : unreadOnly).toString(),
        })
        if (platformFilter !== 'all') params.set('platform', platformFilter)
        if (sort !== 'added') params.set('sort', sort)
        if (sortDirection !== 'desc') params.set('sortDir', sortDirection)
        if (search) params.set('search', search)
        if (!addingToTag) selectedTags.forEach((tag) => params.append('tag', tag))

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
    [
      filter,
      platformFilter,
      sort,
      sortDirection,
      unreadOnly,
      search,
      page,
      selectedTags,
      tagSelectTag,
    ],
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
  }, [
    filter,
    platformFilter,
    sort,
    sortDirection,
    unreadOnly,
    search,
    selectedTags,
    tagSelectTag,
    isSyncing,
    isAuthenticated,
  ])

  // Any surface that changes a post's tags (grid Add-posts toggles, the
  // triage TagQuickPicker) announces it — refetch tag counts so the toolbar
  // "{n} posts" and the Tags dropdown never go stale.
  useEffect(() => {
    if (!isAuthenticated) return
    const handler = () => fetchTags()
    window.addEventListener('bookmark-tags-changed', handler)
    return () => window.removeEventListener('bookmark-tags-changed', handler)
  }, [isAuthenticated])

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
        window.open(pendingNavigation.fallbackUrl, '_blank')
      }
      // Clear pending navigation regardless of outcome
      setPendingNavigation(null)
    }
  }, [pendingNavigation, items, loading])

  // Rebuild the URL from the CURRENT URL (searchParams), not from scratch. `search`
  // is written to the URL by Header's own debounced push (Header.tsx), and this
  // component's `search` state only catches up to it a render later (via the sync
  // effect above). Reconstructing the whole query string from local state here —
  // including `search` — raced with Header's write: this effect could fire with a
  // stale (pre-sync) `search` and strip a freshly-typed term back out of the URL.
  // Only the filters this component owns are written here; `search` is left
  // exactly as found in the URL.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (filter !== 'all') params.set('filter', filter)
    else params.delete('filter')
    if (platformFilter !== 'all') params.set('platform', platformFilter)
    else params.delete('platform')
    if (sort !== 'added') params.set('sort', sort)
    else params.delete('sort')
    if (sortDirection !== 'desc') params.set('sortDir', sortDirection)
    else params.delete('sortDir')
    if (!unreadOnly) params.set('unreadOnly', 'false')
    else params.delete('unreadOnly')
    const queryString = params.toString()
    router.replace(queryString ? `?${queryString}` : '/', { scroll: false })
  }, [filter, platformFilter, sort, sortDirection, unreadOnly, router, searchParams])

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

    // Not in the loaded feed — e.g. an already-saved tweet that's already read,
    // or one on a later page. Fetch that specific bookmark by id (read state and
    // pagination ignored) and open it directly in triage.
    let alive = true
    fetch(`/api/feed?id=${encodeURIComponent(openId)}&unreadOnly=false&limit=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return
        const item = data?.items?.[0]
        if (item) openTriage([item], 0)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
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

    // Refresh the feed to include the newly added tweet. Rather than reading
    // `items` from this closure after the refresh resolves (which is always a
    // stale pre-fetch snapshot — this effect only depends on [searchParams],
    // so `items` here never reflects the fetchFeed below), set the pending
    // navigation up front and let the dedicated reconciliation effect (which
    // depends on [pendingNavigation, items, loading]) open it deterministically
    // once loading actually transitions back to false with the refreshed items.
    setPendingNavigation({ id: tweetId })
    fetchFeed(true)
  }, [searchParams]) // Only run when searchParams changes

  // Preselect a tag from `?tag=` — the `/tags` screen's "View" action
  // (unified-theater-triage.md §4). Applied once on arrival via a ref guard:
  // unlike filter/sort/etc above, `selectedTags` has no URL round-trip (the
  // writer effect below never sets/clears `tag`), so continuously re-reading
  // it on every searchParams change would silently undo an explicit "clear
  // tag filter" click made afterward.
  const tagParamAppliedRef = useRef(false)
  useEffect(() => {
    if (tagParamAppliedRef.current) return
    const urlTag = searchParams.get('tag')
    if (!urlTag) return
    tagParamAppliedRef.current = true
    setSelectedTags([urlTag])
  }, [searchParams])

  // Header's Collection/Live nav (unified-theater-triage.md §1) dispatches
  // `open-theater` with `{ tab: 'triage' | 'live' }` for both the Triage
  // pill and the Live nav item — open the triage overlay on the matching
  // sub-tab, seeded from the current unread queue either way (so switching
  // tabs mid-session always has a Collection queue to fall back to).
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ tab?: 'triage' | 'live' }>).detail
      void startTriageAll(detail?.tab === 'live' ? 'live' : 'collection')
    }
    window.addEventListener('open-theater', handler)
    return () => window.removeEventListener('open-theater', handler)
  }, [startTriageAll])

  // `?triage=1` — the Triage pill was pressed from another route (e.g. Discover),
  // so we navigated here to open triage. Flag it, then clear the param.
  useEffect(() => {
    if (searchParams.get('triage') !== '1') return
    setPendingTriage(true)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('triage')
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '/', { scroll: false })
  }, [searchParams, router])

  // Arrived via ?triage=1 — open the full unread queue once authenticated.
  useEffect(() => {
    if (!pendingTriage || isAuthenticated !== true) return
    setPendingTriage(false)
    startTriageAll()
  }, [pendingTriage, isAuthenticated, startTriageAll])

  // `?live=1` — the Live nav item was pressed from a route other than `/`
  // (Header's `open-theater` event has no listener outside the feed page),
  // so we navigated here to open the theater's Live tab. Flag it, then clear
  // the param — mirrors the ?triage=1 handling above.
  useEffect(() => {
    if (searchParams.get('live') !== '1') return
    setPendingLive(true)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('live')
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '/', { scroll: false })
  }, [searchParams, router])

  // Arrived via ?live=1 — open the theater on the Live tab once authenticated.
  useEffect(() => {
    if (!pendingLive || isAuthenticated !== true) return
    setPendingLive(false)
    startTriageAll('live')
  }, [pendingLive, isAuthenticated, startTriageAll])

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
    setItems(
      (prev) =>
        prev.some((i) => i.id === item.id)
          ? prev.map((i) => (i.id === item.id ? { ...i, isRead: false } : i))
          : [{ ...item, isRead: false }, ...prev], // was dropped under unreadOnly — re-add it
    )
    setStats((prev) => ({ ...prev, unread: prev.unread + 1 }))
  }, [])

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
        case '/':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('focus-search'))
          break
        case '?':
          e.preventDefault()
          setShowShortcutsModal(true)
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
          // Focus mode - open first item (full unread backlog)
          e.preventDefault()
          if (items.length > 0) {
            openTriageFromItem(0)
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
  }, [
    triageOpen,
    isAuthenticated,
    router,
    showShortcutsModal,
    items.length,
    resolvedTheme,
    setTheme,
  ])

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
                {isSyncing
                  ? 'Syncing Your Bookmarks'
                  : syncErrorCode
                    ? syncErrorCode === 'reauth'
                      ? 'Reconnect your X account'
                      : "Couldn't sync bookmarks"
                    : 'Sync Complete!'}
              </h2>
              <p className="text-sm text-ink-3 mt-1">
                {isSyncing
                  ? 'Your bookmarks are being imported. Watch them appear in real-time!'
                  : syncErrorCode
                    ? syncProgress?.message
                    : `Successfully imported ${syncProgress?.current || 0} bookmarks.`}
              </p>
            </div>

            {/* Progress Section */}
            {!syncErrorCode && (
              <div className="px-6 py-4 bg-inset">
                <div className="flex items-center gap-3">
                  {isSyncing ? (
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  ) : syncErrorCode ? null : (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  )}
                  <span className="text-sm font-medium text-ink-2">{syncProgress?.message}</span>
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
            )}

            {/* Streaming Preview */}
            {!(syncErrorCode && streamedItems.length === 0) && (
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
                          <MessageSquare className="w-6 h-6 text-ink-3" />
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
                        <p className="text-sm text-ink-2 line-clamp-2">{item.text}</p>
                      </div>
                    </div>
                  ))}
                  {streamedItems.length > 10 && (
                    <p className="text-center text-sm text-ink-3">
                      +{streamedItems.length - 10} more bookmarks...
                    </p>
                  )}
                  {streamedItems.length === 0 && isSyncing && (
                    <p className="text-center text-sm text-ink-3 py-8">Waiting for bookmarks...</p>
                  )}
                </div>
              </div>
            )}
            {syncErrorCode && !isSyncing && (
              <div className="px-6 py-4 border-t border-hairline flex gap-2">
                <button
                  onClick={() => {
                    setShowSyncModal(false)
                    setSyncProgress(null)
                    setSyncErrorCode(null)
                  }}
                  className="flex-1 px-4 py-2 rounded-md bg-inset text-ink-2 hover:bg-hairline transition-colors"
                >
                  Close
                </button>
                {syncErrorCode === 'reauth' ? (
                  <button
                    onClick={() => {
                      window.location.href = '/api/auth/twitter'
                    }}
                    className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-md bg-ink text-surface font-semibold hover:opacity-90"
                  >
                    <ConnectWithX size={14} />
                  </button>
                ) : (
                  <button
                    onClick={() => startSync(true)}
                    className="flex-1 px-4 py-2 rounded-md bg-clay-grad text-white font-semibold"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
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
          {syncErrorCode === 'reauth' && !isSyncing && (
            <button
              onClick={() => {
                window.location.href = '/api/auth/twitter'
              }}
              className="text-xs font-semibold underline underline-offset-2"
            >
              Reconnect
            </button>
          )}
        </div>
      )}

      {/* Paste-first add (unified-theater-triage.md §1): no more `+` Add
          button/modal — pasting a platform URL anywhere outside an
          input/textarea routes straight to its preview page. No UI of its
          own. */}
      <PasteToPreview />

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
          view={view}
          onViewChange={changeView}
          selectedTags={selectedTags}
          onSelectedTagsChange={setSelectedTags}
          availableTags={availableTags}
          stats={stats}
          onTagUpdated={(tag, isPublic, shareUrl) => {
            // Update the local availableTags state with the new share info
            setAvailableTags((prev) =>
              prev.map((t) => (t.tag === tag ? { ...t, isPublic, shareUrl } : t)),
            )
          }}
          tagSelect={tagSelectTag}
          onTagSelectChange={setTagSelectTag}
        />
      </ErrorBoundary>

      {/* Collection/Live now live in the top bar (Matter); Live opens the
          theater via `open-theater`, which we listen for below. */}
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
            view={view}
            onExpand={openTriageFromItem}
            onLoadMore={loadMore}
            onShowAll={() => setUnreadOnly(false)}
            tagSelectTag={tagSelectTag}
          />
        </ErrorBoundary>
      </div>

      {triageOpen && (
        <ErrorBoundary componentName="TheaterShell">
          <TheaterShell
            mode="triage"
            seed={TRIAGE_LIVE_SEED}
            triageItems={triageQueue}
            initialTriageIndex={triageStart}
            initialTriageTab={triageInitialTab}
            onTriageResolved={handleTriageResolved}
            onTriageRestored={handleTriageRestored}
            onClose={() => {
              setTriageOpen(false)
              // Refresh the top-bar streak + counts after a triage session.
              window.dispatchEvent(new CustomEvent('stats-updated'))
            }}
          />
        </ErrorBoundary>
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
        inFocusMode={triageOpen}
      />
    </div>
  )
}
