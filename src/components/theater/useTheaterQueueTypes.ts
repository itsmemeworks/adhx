'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ContentType } from '@/components/matter'
import {
  isTheaterQueueFilterActive,
  parseTheaterQueueTypes,
  serializeTheaterQueueTypes,
  toggleTheaterQueueType,
} from './theater-math'
import {
  THEATER_QUEUE_TYPES_LEGACY_VISUAL,
  THEATER_QUEUE_TYPES_STORAGE_KEY,
} from './theater-storage'

export function useTheaterQueueTypes(queueFilterAvailable: boolean) {
  const [queueTypes, setQueueTypes] = useState<ContentType[]>([])
  const [queuePrefReady, setQueuePrefReady] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEATER_QUEUE_TYPES_STORAGE_KEY)
      if (stored != null) {
        setQueueTypes(parseTheaterQueueTypes(stored))
      } else if (localStorage.getItem(THEATER_QUEUE_TYPES_LEGACY_VISUAL) === '1') {
        setQueueTypes(['video', 'photo'])
      }
    } catch {
      // Storage unavailable — keep All.
    }
    setQueuePrefReady(true)
  }, [])

  useEffect(() => {
    if (!queuePrefReady || !queueFilterAvailable) return
    try {
      const serialized = serializeTheaterQueueTypes(queueTypes)
      if (serialized) localStorage.setItem(THEATER_QUEUE_TYPES_STORAGE_KEY, serialized)
      else localStorage.removeItem(THEATER_QUEUE_TYPES_STORAGE_KEY)
      localStorage.removeItem(THEATER_QUEUE_TYPES_LEGACY_VISUAL)
    } catch {
      // Never let a storage failure break playback.
    }
  }, [queueTypes, queuePrefReady, queueFilterAvailable])

  const typeFilterActive = queueFilterAvailable && isTheaterQueueFilterActive(queueTypes)
  const toggleQueueType = useCallback(
    (type: ContentType) => {
      if (!queueFilterAvailable) return
      setQueueTypes((cur) => toggleTheaterQueueType(cur, type))
    },
    [queueFilterAvailable],
  )
  const clearQueueTypes = useCallback(() => {
    if (!queueFilterAvailable) return
    setQueueTypes([])
  }, [queueFilterAvailable])

  return {
    queueTypes,
    setQueueTypes,
    queuePrefReady,
    typeFilterActive,
    toggleQueueType,
    clearQueueTypes,
  }
}
