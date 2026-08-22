'use client'

/**
 * The signed-in theater — what `/` renders once you're logged in (owner: "most
 * people, when logged in, will want to keep the live view of the theater on, so
 * that should be the default route").
 *
 * The Live ⇄ My Collection switch is a pair of ROUTES rather than local state:
 *
 *   `/`            Live — the community's last 24 hours (the default)
 *   `/collection`  My Collection — your own unread queue, as a playlist
 *   `/library`     the grid (filters, search, views) — `AuthedHome`
 *
 * Making each side a real URL means it's linkable, back/forward works, and a
 * reload keeps you where you were. The switch still flips the shell's tab
 * locally first so it responds on tap, then navigates.
 *
 * `TheaterShell` snapshots `personalItems` at mount (a collection session is a fixed
 * queue), so the collection queue has to be in hand BEFORE the shell mounts —
 * hence the fetch-then-render on the `/collection` route only. Live never waits
 * on it: switching tabs is a navigation, so the collection queue is always
 * loaded by the route that needs it.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { FeedItem } from '@/components/feed/types'
import type { TheaterFeedSeed, PersonalTab } from '@/components/theater/types'

/** Which route each side of the switch lives on. */
export const TAB_ROUTES: Record<PersonalTab, string> = {
  live: '/',
  collection: '/collection',
}

export interface AuthedTheaterProps {
  /** Server-rendered live seed — present on BOTH routes so flipping to Live has something to show before the navigation lands. */
  seed: TheaterFeedSeed
  tab: PersonalTab
}

export default function AuthedTheater({ seed, tab }: AuthedTheaterProps) {
  const router = useRouter()
  const needsCollection = tab === 'collection'
  const [collectionItems, setCollectionItems] = useState<FeedItem[] | null>(
    needsCollection ? null : [],
  )

  useEffect(() => {
    if (!needsCollection) return
    let cancelled = false
    // Same query the grid's default view uses: unread first, newest-added
    // first (`sort=added` is the API default — see /api/feed).
    const params = new URLSearchParams({ filter: 'all', hideArchived: 'true', limit: '50' })
    fetch(`/api/feed?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setCollectionItems(data.items ?? [])
      })
      // A failed fetch still opens the theater — on an empty collection queue
      // it shows "all clear" rather than hanging on a spinner.
      .catch(() => {
        if (!cancelled) setCollectionItems([])
      })
    return () => {
      cancelled = true
    }
  }, [needsCollection])

  const onPersonalTabChange = useCallback(
    (next: PersonalTab) => {
      if (next === tab) return
      router.push(TAB_ROUTES[next])
    },
    [router, tab],
  )

  // The theater's close affordance leaves for the grid — there's no page
  // "behind" it to go back to on a dedicated route.
  const onClose = useCallback(() => router.push('/library'), [router])

  if (collectionItems === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08070a]">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    )
  }

  return (
    <ErrorBoundary componentName="TheaterShell">
      <TheaterShell
        mode="personal"
        seed={seed}
        authed
        personalItems={collectionItems}
        initialPersonalTab={tab}
        onPersonalTabChange={onPersonalTabChange}
        onClose={onClose}
      />
    </ErrorBoundary>
  )
}
