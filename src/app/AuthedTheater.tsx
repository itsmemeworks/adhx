'use client'

/**
 * The signed-in theater. Default landing is My videos (`/saved`) — all
 * your active saves, newest first. Discover (`/live`) is community activity.
 *
 * The My videos ⇄ Discover switch is a pair of ROUTES rather than local state:
 *
 *   `/saved`    My videos — your complete active queue (signed-in home)
 *   `/live`     Discover — the community's last 24 hours
 *   `/library`  the grid (filters, search, views) — `AuthedHome`
 *
 * Making each side a real URL means it's linkable, back/forward works, and a
 * reload keeps you where you were. The switch still flips the shell's tab
 * locally first so it responds on tap, then navigates.
 *
 * `TheaterShell` snapshots `personalItems` at mount (a personal session is a
 * fixed queue), so the queue has to be in hand BEFORE the shell mounts —
 * hence the fetch-then-render on the `/saved` route only. Discover never waits
 * on it: switching tabs is a navigation, so the queue is always loaded by
 * the route that needs it.
 *
 * There is no second personal theater. The library navigates here
 * (`/saved?open=&platform=`) instead of overlaying TheaterShell.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PostLoader } from '@/components/PostLoader'
import type { FeedItem } from '@/components/feed/types'
import type { TheaterFeedSeed, PersonalTab } from '@/components/theater/types'
import { COLLECTION_QUEUE_LIMIT, SAVED_PATH, sameBookmark } from '@/lib/theater/collection-href'
import { savedStartIndex } from '@/lib/theater/saved-playing'
import {
  feedItemMatchesQueueTypes,
  parseTheaterQueueTypes,
  sortFeedNewestFirst,
} from '@/components/theater/theater-math'
import { THEATER_QUEUE_TYPES_STORAGE_KEY } from '@/components/theater/theater-storage'
import { theaterTabNavAction } from '@/components/theater/theater-math'

/** Which route each side of the switch lives on. */
export const TAB_ROUTES: Record<PersonalTab, '/live' | typeof SAVED_PATH> = {
  live: '/live',
  collection: SAVED_PATH,
}

export interface AuthedTheaterProps {
  /** Server-rendered live seed — present on BOTH routes so flipping to Discover has something to show before the navigation lands. */
  seed: TheaterFeedSeed
  tab: PersonalTab
  /** Deep-link: start (or prepend) this saved post. From `/saved?open=`. */
  openId?: string
  /** Paired with `openId` — the same numeric id exists on X and TikTok. */
  openPlatform?: string
}

type CollectionLoad =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: FeedItem[]; start: number }

async function loadCollectionQueue(
  signal: AbortSignal,
  openId?: string,
  openPlatform?: string,
): Promise<{ items: FeedItem[]; start: number }> {
  const params = new URLSearchParams({
    filter: 'all',
    hideArchived: 'true',
    limit: String(COLLECTION_QUEUE_LIMIT),
  })
  const items: FeedItem[] = []
  const identities = new Set<string>()
  let total: number | undefined
  let totalPages = 1
  // Each request stays at the API's 100-row cap; the shell mounts only once
  // the complete queue is available. A failed later page must not silently
  // turn the first page into the user's entire collection.
  for (let page = 1; page <= totalPages; page += 1) {
    signal.throwIfAborted()
    params.set('page', String(page))
    const res = await fetch(`/api/feed?${params}`, { signal })
    if (!res.ok) throw new Error('feed failed')
    const data = await res.json()
    signal.throwIfAborted()
    const pagination = data.pagination
    if (
      !Array.isArray(data.items) ||
      !pagination ||
      pagination.page !== page ||
      pagination.limit !== COLLECTION_QUEUE_LIMIT ||
      !Number.isSafeInteger(pagination.total) ||
      pagination.total < 0 ||
      pagination.totalPages !== Math.ceil(pagination.total / COLLECTION_QUEUE_LIMIT) ||
      (total !== undefined && pagination.total !== total)
    ) {
      throw new Error('feed pagination changed or is invalid')
    }
    total = pagination.total
    totalPages = pagination.totalPages
    const expectedLength = Math.min(COLLECTION_QUEUE_LIMIT, total! - items.length)
    if (data.items.length !== expectedLength) throw new Error('feed page incomplete')
    for (const item of data.items as FeedItem[]) {
      const identity = `${item.platform ?? 'twitter'}:${item.id}`
      if (identities.has(identity)) throw new Error('feed pagination repeated a post')
      identities.add(identity)
      items.push(item)
    }
  }
  const queue = sortFeedNewestFirst(items)
  if (!openId) {
    let types: ReturnType<typeof parseTheaterQueueTypes> = []
    try {
      types = parseTheaterQueueTypes(localStorage.getItem(THEATER_QUEUE_TYPES_STORAGE_KEY))
    } catch {
      types = []
    }
    return {
      items: queue,
      start: savedStartIndex(queue.length, {
        playingIndex: 0,
        matches: (i) => feedItemMatchesQueueTypes(queue[i]!, types),
      }),
    }
  }

  const start = openPlatform
    ? queue.findIndex((i) => sameBookmark(i, openId, openPlatform))
    : queue.findIndex((i) => i.id === openId)
  if (start !== -1) return { items: queue, start }

  // Archived — fetch that one row and put it first
  // so a card tap / `?open=` always lands on the post the viewer asked for.
  const oneParams = new URLSearchParams({
    hideArchived: 'false',
    filter: 'all',
    limit: '1',
  })
  oneParams.append('id', openId)
  if (openPlatform) oneParams.append('idPlatform', openPlatform)
  const one = await fetch(`/api/feed?${oneParams}`, { signal })
  if (one.ok) {
    const body = await one.json()
    const item = openPlatform
      ? (body.items ?? []).find((f: FeedItem) => sameBookmark(f, openId, openPlatform))
      : (body.items ?? [])[0]
    if (item) return { items: [item, ...queue], start: 0 }
  }
  return { items: queue, start: 0 }
}

export default function AuthedTheater({ seed, tab, openId, openPlatform }: AuthedTheaterProps) {
  const router = useRouter()
  const needsCollection = tab === 'collection'
  const [retryKey, setRetryKey] = useState(0)
  const [load, setLoad] = useState<CollectionLoad>(
    needsCollection ? { status: 'loading' } : { status: 'idle' },
  )

  useEffect(() => {
    if (!needsCollection) return
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    loadCollectionQueue(controller.signal, openId, openPlatform)
      .then((result) => {
        if (!controller.signal.aborted) setLoad({ status: 'ready', ...result })
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: 'error' })
      })
    return () => {
      controller.abort()
    }
  }, [needsCollection, openId, openPlatform, retryKey])

  const onPersonalTabChange = useCallback(
    (next: PersonalTab) => {
      const path = typeof window !== 'undefined' ? window.location.pathname : TAB_ROUTES[next]
      const { replace, push } = theaterTabNavAction(tab, next, path)
      // Same-tab only: Live may have replaceState'd onto a preview path.
      // Do not rewrite the bar before a cross-tab push — that made `1`/`2`
      // look landed while this page was still mounted, so the next key no-op'd.
      if (replace) {
        try {
          window.history.replaceState(null, '', replace)
        } catch {
          // Sandboxed / embedded contexts can block history writes.
        }
      }
      if (push) router.push(push)
    },
    [router, tab],
  )

  // The theater's close affordance leaves for the grid — there's no page
  // "behind" it to go back to on a dedicated route.
  const onClose = useCallback(() => router.push('/library'), [router])

  if (needsCollection && load.status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#08070a] px-6">
        <p className="text-center text-white/70">
          <span>Couldn&apos;t load My videos.</span>
        </p>
        <button
          type="button"
          onClick={() => setRetryKey((n) => n + 1)}
          className="rounded-full bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
        >
          <span>Retry</span>
        </button>
      </div>
    )
  }

  if (needsCollection && load.status !== 'ready') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08070a]">
        <PostLoader variant="dark" size={72} caption="grabbing it…" label="Loading My videos" />
      </div>
    )
  }

  const collectionItems = load.status === 'ready' ? load.items : []
  const initialPersonalIndex = load.status === 'ready' ? load.start : 0

  return (
    <ErrorBoundary componentName="TheaterShell">
      <TheaterShell
        mode="personal"
        seed={seed}
        authed
        personalItems={collectionItems}
        initialPersonalIndex={initialPersonalIndex}
        preserveSavedStart={Boolean(openId)}
        initialPersonalTab={tab}
        onPersonalTabChange={onPersonalTabChange}
        onClose={onClose}
      />
    </ErrorBoundary>
  )
}
