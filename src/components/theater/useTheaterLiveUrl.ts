'use client'

import { useEffect, type RefObject } from 'react'
import { isSavedPath, SAVED_PATH } from '@/lib/theater/collection-href'
import { theaterItemKey, type TheaterItem, type TheaterMode } from './types'
import { theaterUrlSyncPath } from './theater-math'

/**
 * Keep the address bar on the staged post for Live / shared / signed-in
 * Live. Playlist stays on `/t/…`; Saved stays on `/saved` — and writes
 * that back if Live left a preview path in the bar.
 * replaceState only — never push. Reads `itemsRef` so a poll does not
 * re-run the effect.
 */
export function useTheaterLiveUrl(opts: {
  mode: TheaterMode
  isCollectionTab: boolean
  currentKey: string | null
  itemsRef: RefObject<TheaterItem[]>
}): void {
  const { mode, isCollectionTab, currentKey, itemsRef } = opts
  useEffect(() => {
    if (typeof window === 'undefined' || mode === 'playlist') return
    if (isCollectionTab) {
      if (!isSavedPath(window.location.pathname)) {
        try {
          window.history.replaceState(null, '', SAVED_PATH)
        } catch {
          // Blocked in some embedded/sandboxed contexts — never worth breaking playback over.
        }
      }
      return
    }
    const item = itemsRef.current.find((it) => theaterItemKey(it) === currentKey) ?? null
    const path = theaterUrlSyncPath(item)
    if (!path || window.location.pathname === path) return
    try {
      window.history.replaceState(null, '', path)
    } catch {
      // Blocked in some embedded/sandboxed contexts — never worth breaking playback over.
    }
  }, [currentKey, mode, isCollectionTab, itemsRef])
}
