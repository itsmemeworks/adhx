'use client'

import { useCallback, useEffect, useState, type SetStateAction } from 'react'
import type { ContentType } from '@/components/matter'
import { isTheaterQueueFilterActive } from './theater-math'
import {
  defaultTheaterFilters,
  readTheaterFilters,
  FILTER_STORAGE_KEYS,
  type FilterDestination,
  type TheaterFilters,
  type WatchFilter,
} from '@/lib/theater/filter-preferences'

type FilterState = Record<FilterDestination, TheaterFilters>

/** Each destination owns its filters; shared links start unfiltered and never rewrite them. */
export function useTheaterQueueTypes(
  queueFilterAvailable: boolean,
  destination: FilterDestination = 'discover',
) {
  const [filters, setFilters] = useState<FilterState>(() => ({
    discover: defaultTheaterFilters('discover'),
    saved: defaultTheaterFilters('saved'),
    shared: defaultTheaterFilters('shared'),
  }))
  const [queuePrefReady, setQueuePrefReady] = useState(false)

  useEffect(() => {
    try {
      setFilters({
        discover: readTheaterFilters('discover', localStorage),
        saved: readTheaterFilters('saved', localStorage),
        shared: defaultTheaterFilters('shared'),
      })
    } catch {
      // Accessing localStorage itself can throw in restricted browsers.
    }
    setQueuePrefReady(true)
  }, [])

  useEffect(() => {
    if (!queuePrefReady || !queueFilterAvailable || destination === 'shared') return
    try {
      localStorage.setItem(FILTER_STORAGE_KEYS[destination], JSON.stringify(filters[destination]))
    } catch {
      // Never let a storage failure break playback.
    }
  }, [filters, queuePrefReady, queueFilterAvailable, destination])

  const setQueueTypes = useCallback(
    (next: SetStateAction<ContentType[]>) => {
      setFilters((current) => ({
        ...current,
        [destination]: {
          ...current[destination],
          types: typeof next === 'function' ? next(current[destination].types) : next,
        },
      }))
    },
    [destination],
  )
  const setWatchFilter = useCallback(
    (watch: WatchFilter) => {
      setFilters((current) => ({ ...current, [destination]: { ...current[destination], watch } }))
    },
    [destination],
  )
  const toggleQueueType = useCallback(
    (type: ContentType) => {
      if (!queueFilterAvailable) return
      setQueueTypes(type === 'text' || type === 'article' ? ['text', 'article'] : [type])
    },
    [queueFilterAvailable, setQueueTypes],
  )
  const clearQueueTypes = useCallback(() => {
    if (queueFilterAvailable) setQueueTypes([])
  }, [queueFilterAvailable, setQueueTypes])

  const { types: queueTypes, watch: watchFilter } = filters[destination]
  return {
    queueTypes,
    setQueueTypes,
    queuePrefReady,
    typeFilterActive: queueFilterAvailable && isTheaterQueueFilterActive(queueTypes),
    toggleQueueType,
    clearQueueTypes,
    watchFilter,
    setWatchFilter,
  }
}
