'use client'

/** Prefetch at most one item ahead — extracted verbatim from TheaterShell.tsx. */

import { useEffect } from 'react'
import { prefetchPlayback } from './usePlaybackSource'
import type { TheaterItem } from './types'

export function useTheaterPrefetch(currentIndex: number, displayItems: TheaterItem[]): void {
  useEffect(() => {
    if (currentIndex === -1) return
    const next = displayItems[currentIndex + 1]
    if (next) prefetchPlayback(next)
  }, [currentIndex, displayItems])
}
