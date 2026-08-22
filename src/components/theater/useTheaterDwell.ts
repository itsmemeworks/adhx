'use client'

/**
 * Mark seen + fire the preview pulse once the current post has been staged
 * for SEEN_DWELL_MS — extracted verbatim from TheaterShell.tsx. Resets only
 * when `currentKey` changes. Collection mode is a curated surface, not the
 * public pulse — it marks seen locally (so a loop doesn't visually
 * re-highlight already-viewed cards as "fresh") but never records a
 * `preview` activity event, matching the pre-theater `/t/{username}/{tag}`
 * page's behavior.
 *
 * Only the collection theater's COLLECTION tab opts out: read state there is explicit (Archive
 * / Later / Delete), and it isn't even displaying `currentKey`'s item (see
 * `CollectionStage`). Its LIVE tab is the same community feed the signed-out home
 * theater shows, so it dwells exactly like home — this used to say `isPersonal`,
 * which silently disabled seen-marking for every signed-in viewer the moment
 * authed `/` became a collection mount. The queue then never learned that anything
 * had been watched, so it could never reach the caught-up stage and looped
 * back into posts the viewer had just finished (found by the caught-up
 * permutation matrix, and consistent with the owner's stall report).
 */

import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { theaterItemKey } from './types'
import type { TheaterItem } from './types'
import type { SeenSet } from './useSeenSet'

/** How long a post must stay staged before it counts as "seen" (spec §4/§5). */
const SEEN_DWELL_MS = 2_000

export interface UseTheaterDwellArgs {
  currentKey: string | null
  /** The personal theater's Collection tab only — NOT the Live tab, which dwells like home. */
  isCollectionTab: boolean
  loop: boolean
  /** Fresh-item lookup — a ref so this effect only resets on `currentKey` changes, not on every unrelated re-render. */
  itemsRef: MutableRefObject<TheaterItem[]>
  seenSet: SeenSet
}

export function useTheaterDwell({
  currentKey,
  isCollectionTab,
  loop,
  itemsRef,
  seenSet,
}: UseTheaterDwellArgs): void {
  const seenSetRef = useRef(seenSet)
  seenSetRef.current = seenSet

  useEffect(() => {
    if (!currentKey || isCollectionTab) return
    const timer = window.setTimeout(() => {
      const item = itemsRef.current.find((it) => theaterItemKey(it) === currentKey)
      if (!item) return
      seenSetRef.current.markSeen(currentKey)
      if (item.bookmarkId && !loop) {
        fetch('/api/activity/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: item.platform, id: item.bookmarkId }),
        }).catch(() => {})
      }
    }, SEEN_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [currentKey, loop, isCollectionTab])
}
