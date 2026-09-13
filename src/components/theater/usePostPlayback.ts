'use client'

import { useCallback, useRef } from 'react'
import { pingAnalytic } from '@/lib/analytics/client'
import type { TheaterItem } from './types'

/** Call only from a confirmed media-playing event, never from a play request. */
export function usePostPlayback(item: TheaterItem) {
  const lastPlayed = useRef<string | null>(null)
  return useCallback(() => {
    if (!item.bookmarkId) return
    const key = `${item.platform}:${item.bookmarkId}`
    if (lastPlayed.current === key) return
    lastPlayed.current = key
    pingAnalytic('post.play', { platform: item.platform, id: item.bookmarkId })
  }, [item.platform, item.bookmarkId])
}
