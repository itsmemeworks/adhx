import type { ContentType } from '@/components/matter'
import { parseTheaterQueueTypes } from '@/components/theater/theater-math'

export type FilterDestination = 'discover' | 'saved' | 'shared'
export type WatchFilter = 'all' | 'unwatched'
export interface TheaterFilters {
  types: ContentType[]
  watch: WatchFilter
}

export const FILTER_STORAGE_KEYS = {
  discover: 'adhx-theater-filters-discover-v1',
  saved: 'adhx-theater-filters-saved-v1',
} as const

export function defaultTheaterFilters(destination: FilterDestination): TheaterFilters {
  return destination === 'discover'
    ? { types: ['video'], watch: 'unwatched' }
    : { types: [], watch: 'all' }
}

/** An explicit empty type list means All; missing preferences use the destination default. */
export function readTheaterFilters(
  destination: FilterDestination,
  storage: Pick<Storage, 'getItem'>,
): TheaterFilters {
  const defaults = defaultTheaterFilters(destination)
  if (destination === 'shared') return defaults
  try {
    const raw = storage.getItem(FILTER_STORAGE_KEYS[destination])
    if (raw !== null) {
      const data: unknown = JSON.parse(raw)
      if (data && typeof data === 'object' && 'types' in data && 'watch' in data) {
        const { types, watch } = data
        if (Array.isArray(types) && (watch === 'all' || watch === 'unwatched')) {
          const parsed = parseTheaterQueueTypes(JSON.stringify(types))
          if (types.length > 0 && parsed.length === 0) return defaults
          return { types: parsed, watch }
        }
      }
      return defaults
    }
    const legacy = storage.getItem('adhx-theater-types')
    if (legacy !== null) {
      const data: unknown = JSON.parse(legacy)
      const types = parseTheaterQueueTypes(legacy)
      if (Array.isArray(data) && (data.length === 0 || types.length > 0))
        return { ...defaults, types }
      return defaults
    }
    if (storage.getItem('adhx-theater-visual') === '1') {
      return { ...defaults, types: ['video', 'photo'] }
    }
  } catch {
    // Restricted storage and malformed data must never block playback.
  }
  return defaults
}
