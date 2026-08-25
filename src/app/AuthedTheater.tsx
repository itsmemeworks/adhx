'use client'

/**
 * The signed-in theater. Default landing is Live (`/live`) — leftover
 * community posts. Saved (`/saved`) is the unread pile you come back to.
 *
 * The Live ⇄ Saved switch is a pair of ROUTES rather than local state:
 *
 *   `/live`     Live — the community's last 24 hours (signed-in home)
 *   `/saved`    Saved — your own active queue
 *   `/library`  the grid (filters, search, views) — `AuthedHome`
 *
 * Making each side a real URL means it's linkable, back/forward works, and a
 * reload keeps you where you were. The switch still flips the shell's tab
 * locally first so it responds on tap, then navigates.
 *
 * `TheaterShell` snapshots `personalItems` at mount (a Saved session is a
 * fixed queue), so the queue has to be in hand BEFORE the shell mounts —
 * hence the fetch-then-render on the `/saved` route only. Live never waits
 * on it: switching tabs is a navigation, so the queue is always loaded by
 * the route that needs it.
 *
 * There is no second personal theater. The library navigates here
 * (`/saved?open=&platform=`) instead of overlaying TheaterShell.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { FeedItem } from '@/components/feed/types'
import type { TheaterFeedSeed, PersonalTab } from '@/components/theater/types'
import { COLLECTION_QUEUE_LIMIT, SAVED_PATH, sameBookmark } from '@/lib/theater/collection-href'
import { readSavedPlayingKey, savedPlayingIndex } from '@/lib/theater/saved-playing'
import { theaterTabNavRestore } from '@/components/theater/theater-math'

/** Which route each side of the switch lives on. */
export const TAB_ROUTES: Record<PersonalTab, '/live' | typeof SAVED_PATH> = {
  live: '/live',
  collection: SAVED_PATH,
}

export interface AuthedTheaterProps {
  /** Server-rendered live seed — present on BOTH routes so flipping to Live has something to show before the navigation lands. */
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
  openId?: string,
  openPlatform?: string,
): Promise<{ items: FeedItem[]; start: number }> {
  const params = new URLSearchParams({
    filter: 'all',
    hideArchived: 'true',
    limit: String(COLLECTION_QUEUE_LIMIT),
  })
  const res = await fetch(`/api/feed?${params}`)
  if (!res.ok) throw new Error('feed failed')
  const data = await res.json()
  const queue: FeedItem[] = data.items ?? []
  if (!openId) {
    return { items: queue, start: savedPlayingIndex(queue, readSavedPlayingKey()) }
  }

  const start = openPlatform
    ? queue.findIndex((i) => sameBookmark(i, openId, openPlatform))
    : queue.findIndex((i) => i.id === openId)
  if (start !== -1) return { items: queue, start }

  // Archived, or outside the first 100 — fetch that one row and put it first
  // so a card tap / `?open=` always lands on the post the viewer asked for.
  const oneParams = new URLSearchParams({
    hideArchived: 'false',
    filter: 'all',
    limit: '1',
  })
  oneParams.append('id', openId)
  if (openPlatform) oneParams.append('idPlatform', openPlatform)
  const one = await fetch(`/api/feed?${oneParams}`)
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
    let cancelled = false
    setLoad({ status: 'loading' })
    loadCollectionQueue(openId, openPlatform)
      .then((result) => {
        if (!cancelled) setLoad({ status: 'ready', ...result })
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [needsCollection, openId, openPlatform, retryKey])

  const onPersonalTabChange = useCallback(
    (next: PersonalTab) => {
      const dest = TAB_ROUTES[next]
      // Live replaceState can leave `/{user}/status/{id}` in the bar while
      // this page is still `/saved`. Restore dest even when the route tab
      // did not change — otherwise Saved keeps the last Live post URL.
      if (typeof window !== 'undefined') {
        const restore = theaterTabNavRestore(window.location.pathname, dest)
        if (restore) {
          try {
            window.history.replaceState(null, '', restore)
          } catch {
            // Sandboxed / embedded contexts can block history writes.
          }
        }
      }
      if (next === tab) return
      router.push(dest)
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
          <span>Couldn&apos;t load Saved.</span>
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
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
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
        initialPersonalTab={tab}
        onPersonalTabChange={onPersonalTabChange}
        onClose={onClose}
      />
    </ErrorBoundary>
  )
}
