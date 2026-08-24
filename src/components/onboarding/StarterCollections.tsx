'use client'

import { useEffect, useState } from 'react'
import { notifyCollectionChanged } from '@/lib/client-events'
import { useAuthMe } from '@/components/auth'
import { CollectionPosterCard, type PosterTile } from '@/components/tags'
import { cn } from '@/lib/utils'

const MAX_STARTERS = 3

/** Mirrors `LeaderboardEntry` (`src/lib/discovery/rank.ts`) — the shape
 * `/api/collections/trending` returns. Not imported directly since that
 * module pulls in the server-only rank/db stack. */
interface StarterEntry {
  username: string
  tag: string
  rank: number
  viewCount: number
  cloneCount: number
  itemCount: number
  tiles: PosterTile[]
}

type CloneState = 'idle' | 'cloning' | 'done' | 'error'

export interface StarterCollectionsProps {
  /** Tighter heading/spacing for embedding inside another onboarding surface
   * (`EmptyAccountOnboarding`) rather than standing alone (the welcome flow). */
  compact?: boolean
  className?: string
}

/**
 * Offers the top public playlists (by all-time views+clones) as a one-tap
 * "start with a full playlist" option, so a brand-new account isn't
 * staring at an empty feed. Reuses the existing Discovery leaderboard
 * (`/api/collections/trending`) and clone endpoint
 * (`/api/share/tag/by-name/[username]/[tag]/clone`) — no new backend.
 *
 * Collapses to `null` (renders nothing) when there's nothing to offer: the
 * leaderboard is empty, the fetch fails, or every top playlist turns out
 * to be the viewer's own (self-clone is rejected server-side anyway).
 * Callers must tolerate that — this is never the only thing on the page.
 */
export function StarterCollections({
  compact = false,
  className,
}: StarterCollectionsProps): React.ReactElement | null {
  const { me } = useAuthMe()
  const [entries, setEntries] = useState<StarterEntry[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/collections/trending?window=all-time&limit=12')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: StarterEntry[] } | null) => {
        if (!cancelled) setEntries(data?.items ?? [])
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (entries === null) return null // still loading — collapse rather than flash a skeleton

  const ownUsername = me?.user?.username
  const starters = entries.filter((entry) => entry.username !== ownUsername).slice(0, MAX_STARTERS)

  if (starters.length === 0) return null

  const gridColsClass =
    starters.length === 1
      ? 'grid-cols-1'
      : starters.length === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-3'

  return (
    <div className={cn('w-full', className)}>
      <h3
        className={cn(
          'font-serif font-semibold text-ink',
          compact ? 'mb-2 text-base' : 'mb-3 text-xl',
        )}
      >
        Start with a full playlist
      </h3>
      <div className={cn('grid gap-3', gridColsClass)}>
        {starters.map((entry) => (
          <StarterCard key={`${entry.username}:${entry.tag}`} entry={entry} />
        ))}
      </div>
    </div>
  )
}

const SURFACE_BUTTON =
  'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-hairline bg-inset px-3 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-paper disabled:opacity-60'

function StarterCard({ entry }: { entry: StarterEntry }) {
  const [state, setState] = useState<CloneState>('idle')
  const [clonedTotal, setClonedTotal] = useState<number>(entry.itemCount)
  const href = `/t/${entry.username}/${entry.tag}`

  async function handleClone() {
    setState('cloning')
    try {
      const res = await fetch(
        `/api/share/tag/by-name/${encodeURIComponent(entry.username)}/${encodeURIComponent(entry.tag)}/clone`,
        { method: 'POST' },
      )
      if (!res.ok) throw new Error(`clone failed: ${res.status}`)
      const data: { taggedCount?: number } = await res.json()
      setClonedTotal(data.taggedCount ?? entry.itemCount)
      setState('done')
      // Same signal the theater's own save flow fires (TheaterShell.tsx) —
      // AuthedHome's useSyncListener refetches the feed/tags on this event.
      // Harmless where nothing is listening (e.g. the /welcome flow, which
      // lands on a fresh `/` after this page anyway).
      notifyCollectionChanged({ tagsChanged: true })
    } catch {
      setState('error')
    }
  }

  return (
    <CollectionPosterCard
      tag={entry.tag}
      count={entry.itemCount}
      tiles={entry.tiles}
      href={href}
      curator={entry.username}
      rank={entry.rank}
      stats={{ viewCount: entry.viewCount, cloneCount: entry.cloneCount }}
      heightClass="h-[200px]"
    >
      {state === 'done' ? (
        <a href={href} className={SURFACE_BUTTON}>
          Added · {clonedTotal} post{clonedTotal === 1 ? '' : 's'}
        </a>
      ) : (
        <>
          <button
            type="button"
            onClick={handleClone}
            disabled={state === 'cloning'}
            className={SURFACE_BUTTON}
          >
            {state === 'cloning' ? 'Adding…' : 'Add to my collection'}
          </button>
          {state === 'error' && (
            <span className="text-[10.5px] text-red-600 dark:text-red-400">
              Couldn&apos;t add — try again
            </span>
          )}
        </>
      )}
    </CollectionPosterCard>
  )
}
