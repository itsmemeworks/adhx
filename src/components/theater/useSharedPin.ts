'use client'

import { useCallback, useEffect, useState } from 'react'
import { theaterItemKey, type TheaterItem, type TheaterMode } from './types'

/**
 * Shared-post-repeat pin. Separate from `pinnedKey` (display order): this
 * one decides whether the shared post REPEATS instead of auto-advancing
 * into the live pulse. Starts on in shared mode for signed-out visitors
 * (unless the lead is unavailable). Signed-in previews skip the pin —
 * the opened post leads the unseen Live run.
 * Only a deliberate next/prev/select clears it when it is on.
 */
export function useSharedPin(
  mode: TheaterMode,
  sharedItem: TheaterItem | undefined,
  sharedUnavailable?: boolean,
  signedIn?: boolean,
) {
  const [sharedPinned, setSharedPinned] = useState(
    mode === 'shared' && !sharedUnavailable && !signedIn,
  )
  useEffect(() => {
    if (sharedUnavailable || signedIn) setSharedPinned(false)
  }, [sharedUnavailable, signedIn])
  const clearSharedPin = useCallback(() => setSharedPinned(false), [])
  const sharedItemKey = mode === 'shared' && sharedItem ? theaterItemKey(sharedItem) : null
  return { sharedPinned, clearSharedPin, sharedItemKey }
}
