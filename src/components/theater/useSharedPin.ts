'use client'

import { useCallback, useEffect, useState } from 'react'
import { theaterItemKey, type TheaterItem, type TheaterMode } from './types'

/**
 * Shared-post-repeat pin. Separate from `pinnedKey` (display order): this
 * one decides whether the shared post REPEATS instead of auto-advancing
 * into the live pulse. Starts on in shared mode (unless the lead is
 * unavailable). Only a deliberate next/prev/select clears it.
 */
export function useSharedPin(
  mode: TheaterMode,
  sharedItem: TheaterItem | undefined,
  sharedUnavailable?: boolean,
) {
  const [sharedPinned, setSharedPinned] = useState(mode === 'shared' && !sharedUnavailable)
  useEffect(() => {
    if (sharedUnavailable) setSharedPinned(false)
  }, [sharedUnavailable])
  const clearSharedPin = useCallback(() => setSharedPinned(false), [])
  const sharedItemKey = mode === 'shared' && sharedItem ? theaterItemKey(sharedItem) : null
  return { sharedPinned, clearSharedPin, sharedItemKey }
}
