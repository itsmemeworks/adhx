'use client'

import { useEffect, useState, useCallback, Suspense, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
  parseFilterType,
} from '@/components/feed'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Loader2, CheckCircle2, MessageSquare } from 'lucide-react'
import { PasteToPreview } from '@/components/PasteToPreview'
import { PasteLinkButton } from '@/components/PasteLinkButton'
import { cn } from '@/lib/utils'
import { ConnectWithX } from '@/components/matter'
import { parseSyncErrorEvent, type SyncErrorCode } from '@/lib/sync/messages'
import { useSyncListener } from './useSyncListener'
import { collectionPath } from '@/lib/theater/collection-href'
import { notifyCollectionChanged } from '@/lib/client-events'

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
  // The grid lives at `/library` (the theater took `/`), and every URL sync
  // below is a query-string update on WHATEVER route it's mounted at — so the
  // "no query string left" case has to fall back to this pathname, not to a
  // hardcoded '/'. It used to be '/' and that silently navigated the grid home.
  const pathname = usePathname()

  const [items, setItems] = useState<FeedItem[]>([])
  /** Monotonic id of the newest feed request — older responses are dropped. */
  const feedRequestRef = useRef(0)
  const [loading, setLoading] = useState(true)
  /**
   * Paste-to-add status. Success is NOT announced in words — the post appears
   * at the top with a brief glow (`justAddedKey` below), because a banner
   * saying "Added" pushed the entire grid down to state what the new card
   * already shows (owner: "just something subtle"). Only the WAIT and a
   * FAILURE get text, and it's positioned so it can't move the grid either.
   */
  const [pasteAdd, setPasteAdd] = useState<{
    status: 'adding' | 'error'
    message?: string
  } | null>(null)
  /** `platform:id` of the just-pasted post, held long enough to be noticed. */
  const [justAddedKey, setJustAddedKey] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>(parseFilterType(searchParams.get('filter')))
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>(
    (searchParams.get('platform') as PlatformFilter) || 'all',
  )
  const [sort, setSort] = useState<SortType>((searchParams.get('sort') as SortType) || 'added')
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    (searchParams.get('sortDir') as SortDirection) || 'desc',
  )
  const [hideArchived, setHideArchived] = useState(searchParams.get('hideArchived') !== 'false')
  const [view, setView] = useState<'grid' | 'list' | 'bento'>('grid')
  const [search, setSearch] = useState(searchParams.get('search') || '')
  // Tag-select plumbing (unified-theater-collection.md §4, built by a parallel
  // agent) — FilterBar owns entering/exiting select mode; FeedGrid reads it
  // to render the tap-to-toggle-membership grid.
  const [tagSelectTag, setTagSelectTag] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [stats, setStats] = useState({ total: 0, active: 0 })
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<TagItem[]>([])

  // "Add posts" mode is meaningless without its tag active as the filter —
  // clearing the tag (the toolbar ×, or deselecting via the Tags dropdown)
  // must also exit selection mode, or the grid keeps offering "Adding to
  // #tag" for a tag that's no longer on screen.
  useEffect(() => {
    if (tagSelectTag && selectedTags[0] !== tagSelectTag) setTagSelectTag(null)
  }, [tagSelectTag, selectedTags])
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
  // Track seen item IDs for O(1) duplicate detection during sync streaming
  const seenItemIdsRef = useRef<Set<string>>(new Set())
  // Track EventSource for cleanup on unmount to prevent memory leaks
  const eventSourceRef = useRef<EventSource | null>(null)
  // Ref to access current items without adding to useCallback deps
  const itemsRef = useRef(items)
  itemsRef.current = items

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

  /**
   * Place a just-added post at the top of the grid. Shared by paste-to-add and
   * the theater's Live-tab Save, and deduped so re-adding something already
   * listed moves that card up instead of rendering it twice.
   */
  const placeAddedItem = useCallback((added: FeedItem) => {
    const platform = added.platform ?? 'twitter'
    setItems((prev) => [
      added,
      ...prev.filter((f) => !((f.platform ?? 'twitter') === platform && f.id === added.id)),
    ])
    setJustAddedKey(`${platform}:${added.id}`)
  }, [])

  /**
   * Paste a post link while on the library → add it and put it at the top,
   * without leaving the page (owner). The card is pulled from `/api/feed?id=`
   * rather than built from the add endpoint's raw DB row, so it renders
   * identically to every other card (media, links, tags, read state) — the
   * same trick `handlePersonalLiveSave` uses to pull a save into an open queue.
   */
  const addPastedPost = useCallback(
    async (url: string) => {
      setPasteAdd({ status: 'adding' })
      try {
        const res = await fetch('/api/bookmarks/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, source: 'manual' }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setPasteAdd({
            status: 'error',
            message: typeof data?.error === 'string' ? data.error : "Couldn't add that link",
          })
          return
        }

        const platform: string = data?.platform ?? 'twitter'
        const id: string | undefined = data?.bookmark?.id

        let added: FeedItem | undefined
        if (id) {
          const q = new URLSearchParams({ hideArchived: 'false', filter: 'all', limit: '5' })
          q.append('id', id)
          q.append('idPlatform', platform)
          const fres = await fetch(`/api/feed?${q}`)
          if (fres.ok) {
            const feed = await fres.json()
            added = (feed.items ?? []).find(
              (f: FeedItem) => (f.platform ?? 'twitter') === platform && f.id === id,
            )
            if (added) placeAddedItem(added)
          }
        }

        // No success text: the glowing card at the top IS the confirmation —
        // for a fresh add, and for a re-paste that moved an existing card up.
        setPasteAdd(null)
        // Same-tab tweet-added would make useSyncListener refetch and undo
        // the prepend. Other Saved windows still hear `{ added }` over
        // BroadcastChannel.
        notifyCollectionChanged(added ? { refetchFeed: false, added } : {})
      } catch {
        setPasteAdd({ status: 'error', message: "Couldn't add that link" })
      }
    },
    [placeAddedItem],
  )

  // One personal theater: a card tap leaves the grid for `/saved`.
  // AuthedTheater fetches the full active queue (API cap 100) and starts on
  // this post — prepends it when it's archived or outside the first page.
  const goToCollectionFromItem = useCallback(
    (idx: number) => {
      const item = items[idx]
      if (!item) return
      router.push(collectionPath({ open: item.id, platform: item.platform }))
    },
    [items, router],
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
          router.replace(pathname, { scroll: false })
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
            router.replace(pathname, { scroll: false })
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
      // Request token: a filter change and an in-flight `loadMore` used to be
      // able to interleave, appending the OLD filter's page 2 onto the new
      // filter's freshly reset list (state review). Only the newest request
      // may write to `items`.
      const requestId = ++feedRequestRef.current

      try {
        setLoading(true)
        // Add-posts mode browses the WHOLE collection: drop the tag filter
        // (else the grid only shows posts already carrying the tag — nothing
        // left to add) and the archive gate (archived posts are prime
        // tagging candidates). The FilterBar's selected-tag UI state is
        // untouched. VIEWING a tag also ignores archive state: a tag is a deliberate
        // collection the user curated — read state is irrelevant there, and
        // the default hide-archived filter otherwise greets a fully-archived tag
        // with a misleading "All caught up" empty state.
        // Library "Show archived" is archived-only (`archivedOnly`), not
        // `hideArchived=false` (that still means include everything).
        const addingToTag = tagSelectTag !== null
        const tagActive = addingToTag || selectedTags.length > 0
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: '50',
          filter,
        })
        if (tagActive) {
          params.set('hideArchived', 'false')
        } else if (!hideArchived) {
          params.set('archivedOnly', 'true')
        }
        if (platformFilter !== 'all') params.set('platform', platformFilter)
        if (sort !== 'added') params.set('sort', sort)
        if (sortDirection !== 'desc') params.set('sortDir', sortDirection)
        if (search) params.set('search', search)
        if (!addingToTag) selectedTags.forEach((tag) => params.append('tag', tag))

        const response = await fetch(`/api/feed?${params}`)
        const data = await response.json()
        // A superseded response must touch NOTHING — including `loading`.
        if (requestId !== feedRequestRef.current) return

        if (resetPage) {
          setItems(data.items || [])
        } else {
          // Dedupe on append. The server pages by OFFSET, so every item this
          // session removed locally (an archive while hiding archived, a delete)
          // shifts the boundary and page N+1 re-sends a row already on
          // screen — React then renders two cards with the same key (state
          // review). Filtering by (platform, id) is the cheap correct fix.
          setItems((prev) => {
            const seen = new Set(prev.map((f) => `${f.platform ?? 'twitter'}:${f.id}`))
            const fresh = ((data.items || []) as FeedItem[]).filter(
              (f) => !seen.has(`${f.platform ?? 'twitter'}:${f.id}`),
            )
            return fresh.length ? [...prev, ...fresh] : prev
          })
        }

        setHasMore(data.pagination?.page < data.pagination?.totalPages)
        setStats({ total: data.stats?.total || 0, active: data.stats?.active || 0 })
        if (data.lastSyncAt) setLastSyncAt(data.lastSyncAt)
      } catch (error) {
        console.error('Failed to fetch feed:', error)
      } finally {
        // Only the newest request owns the spinner.
        if (requestId === feedRequestRef.current) setLoading(false)
      }
    },
    [
      filter,
      platformFilter,
      sort,
      sortDirection,
      hideArchived,
      search,
      page,
      selectedTags,
      tagSelectTag,
    ],
  )

  useEffect(() => {
    const urlFilter = parseFilterType(searchParams.get('filter'))
    const urlSort = (searchParams.get('sort') as SortType) || 'added'
    const urlSortDir = (searchParams.get('sortDir') as SortDirection) || 'desc'
    const urlHideArchived = searchParams.get('hideArchived') !== 'false'
    const urlSearch = searchParams.get('search') || ''

    if (urlFilter !== filter) setFilter(urlFilter)
    if (urlSort !== sort) setSort(urlSort)
    if (urlSortDir !== sortDirection) setSortDirection(urlSortDir)
    if (urlHideArchived !== hideArchived) setHideArchived(urlHideArchived)
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
    hideArchived,
    search,
    selectedTags,
    tagSelectTag,
    isSyncing,
    isAuthenticated,
  ])

  // Any surface that changes a post's tags (grid Add-posts toggles, the
  // collection TagQuickPicker) announces it — refetch tag counts so the toolbar
  // "{n} posts" and the Tags dropdown never go stale, AND patch the affected
  // card's own tags.
  //
  // The patch is the fix for a real staleness bug (state review, 2026-08-22):
  // the event has always carried the post's complete new tag list in `detail`,
  // and this listener ignored it, refetching only the tag COUNTS. So a tag
  // added in the theater showed there (the theater patches its own snapshot)
  // and then vanished the moment the overlay closed and the grid's untouched
  // `items` re-rendered — the tag was saved, but the UI said otherwise until a
  // filter change or reload.
  useEffect(() => {
    if (!isAuthenticated) return
    const handler = (e: Event) => {
      void fetchTags()
      const detail = (e as CustomEvent).detail as
        { platform?: string; bookmarkId?: string; tags?: string[] } | undefined
      if (!detail?.bookmarkId || !Array.isArray(detail.tags)) return
      const platform = detail.platform ?? 'twitter'
      const tags = detail.tags
      setItems((prev) => {
        let changed = false
        const next = prev.map((item) => {
          if (item.id !== detail.bookmarkId || (item.platform ?? 'twitter') !== platform) {
            return item
          }
          changed = true
          return { ...item, tags }
        })
        return changed ? next : prev
      })
    }
    window.addEventListener('bookmark-tags-changed', handler)
    return () => window.removeEventListener('bookmark-tags-changed', handler)
  }, [isAuthenticated, fetchTags])

  useEffect(() => {
    if (isAuthenticated) {
      fetchTags()
    }
  }, [isAuthenticated, fetchTags])

  useEffect(() => {
    if (page > 1) fetchFeed(false)
  }, [page])

  // The paste pill is an acknowledgement, not a permanent state — clear it.
  // Errors linger longer than successes: the card appearing at the top of the
  // grid is its own confirmation, but a failure is the only signal there is.
  useEffect(() => {
    if (!pasteAdd) return
    // 'adding' is cleared by the request finishing; the long timeout is only a
    // backstop so a hung request can't leave a spinner up forever.
    const ms = pasteAdd.status === 'error' ? 6_000 : 30_000
    const timer = setTimeout(() => setPasteAdd(null), ms)
    return () => clearTimeout(timer)
  }, [pasteAdd])

  // Hold the glow long enough to catch the eye, then let the card settle in.
  useEffect(() => {
    if (!justAddedKey) return
    const timer = setTimeout(() => setJustAddedKey(null), 2_600)
    return () => clearTimeout(timer)
  }, [justAddedKey])

  // Listen for sync-complete (Header's SyncProgress component) and
  // tweet-added (URL-prefix add flow) events and refresh the feed/tags.
  useSyncListener({ isSyncing, fetchFeed, fetchTags })

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
    if (!hideArchived) params.set('hideArchived', 'false')
    else params.delete('hideArchived')
    // One-way cleanup of the superseded query name.
    params.delete('unreadOnly')
    const queryString = params.toString()
    router.replace(queryString ? `?${queryString}` : pathname, { scroll: false })
  }, [filter, platformFilter, sort, sortDirection, hideArchived, router, searchParams, pathname])

  // Leftover overlay deep links — there is one personal theater, at `/saved`.
  useEffect(() => {
    const openId = searchParams.get('open')
    if (openId) {
      const fromGrid = items.find((i) => i.id === openId)
      router.replace(
        collectionPath({
          open: openId,
          platform: fromGrid?.platform ?? searchParams.get('platform'),
        }),
      )
      return
    }
    const added = searchParams.get('added')
    const addedId = searchParams.get('id') ?? searchParams.get('tweetId')
    if ((added === 'success' || added === 'duplicate') && addedId) {
      router.replace(collectionPath({ open: addedId, platform: searchParams.get('platform') }))
      return
    }
    if (searchParams.get('collection') === '1') {
      router.replace('/saved')
      return
    }
    if (searchParams.get('live') === '1') {
      router.replace('/live')
    }
  }, [searchParams, router, items])

  // Preselect a tag from `?tag=` — the `/tags` screen's "View" action
  // (unified-theater-collection.md §4). Applied once on arrival via a ref guard:
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

  // Leftover `open-theater` from older chrome — navigate, don't overlay.
  useEffect(() => {
    function handler(e: Event) {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab
      router.push(tab === 'live' ? '/live' : '/saved')
    }
    window.addEventListener('open-theater', handler)
    return () => window.removeEventListener('open-theater', handler)
  }, [router])

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

      {/* Paste-first add (unified-theater-collection.md §1): no more `+` Add
          button/modal. On the LIBRARY a paste adds the post in place and puts
          it at the top (owner) rather than navigating to its preview page —
          you're already looking at the collection you're adding to. Everywhere
          else PasteToPreview still routes to the preview page. */}
      <PasteToPreview onPastePost={addPastedPost} />

      {/* Fixed, not in flow: this used to sit above the grid and shove every
          card down the moment you pasted (owner). Only the wait and a failure
          are worth words at all — a successful add is announced by the new
          card's glow, not by text. */}
      {pasteAdd && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
        >
          <span
            className={cn(
              // Opacity modifiers are deliberately absent: `clay` and
              // `surface` are hex CSS vars, and `/NN` on those compiles to
              // nothing in this setup — the pill was rendering with no
              // background or border at all.
              'inline-flex items-center gap-1.5 rounded-full border bg-surface px-3 py-1.5 text-[12.5px] shadow-m-sm',
              pasteAdd.status === 'error' ? 'border-clay text-ink-2' : 'border-hairline text-ink-3',
            )}
          >
            {pasteAdd.status === 'adding' && <Loader2 size={13} className="animate-spin" />}
            <span>
              {pasteAdd.status === 'adding'
                ? 'Adding\u2026'
                : (pasteAdd.message ?? "Couldn't add that link")}
            </span>
          </span>
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
          hideArchived={hideArchived}
          onHideArchivedChange={setHideArchived}
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

      {/* Mobile one-tap save (Tier 1): touch Safari/Chrome have no paste
          gesture, so ⌘V's `PasteToPreview` above is desktop-only in
          practice — this is the mobile equivalent, "Copy Link" in any share
          sheet → open ADHX → tap here. Hidden at `sm`+, where the header's
          own affordances (and ⌘V) cover it; kept out of the FilterBar's
          pill row so it doesn't scroll out of view as just another chip. */}
      <div className="px-4 pt-3 sm:hidden">
        <PasteLinkButton className="w-full justify-center" />
      </div>

      <div className="px-4 sm:px-[26px] py-4">
        <ErrorBoundary componentName="FeedGrid">
          <FeedGrid
            items={items}
            loading={loading}
            hasMore={hasMore}
            lastSyncAt={lastSyncAt}
            sortField={sort === 'posted' ? 'createdAt' : 'processedAt'}
            hideArchived={hideArchived}
            stats={stats}
            view={view}
            onExpand={goToCollectionFromItem}
            onLoadMore={loadMore}
            onShowAll={() => setHideArchived(false)}
            tagSelectTag={tagSelectTag}
            justAddedKey={justAddedKey}
          />
        </ErrorBoundary>
      </div>
    </div>
  )
}
