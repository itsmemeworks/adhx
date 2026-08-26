'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
    mode === 'shared' && !!sharedItem && !sharedUnavailable && !signedIn,
  )
  const [sharedLeadReleased, setSharedLeadReleased] = useState(false)
  const sharedLeadReleasedRef = useRef(false)
  const sharedPinDisqualifiedRef = useRef(Boolean(sharedUnavailable))
  useEffect(() => {
    if (sharedUnavailable) sharedPinDisqualifiedRef.current = true
    const shouldPin =
      mode === 'shared' &&
      !!sharedItem &&
      !signedIn &&
      !sharedPinDisqualifiedRef.current &&
      !sharedLeadReleasedRef.current
    setSharedPinned(shouldPin)
  }, [mode, sharedItem, sharedUnavailable, signedIn])
  const clearSharedPin = useCallback(() => setSharedPinned(false), [])
  const releaseSharedLead = useCallback(() => {
    if (sharedLeadReleasedRef.current) return
    sharedLeadReleasedRef.current = true
    sharedPinDisqualifiedRef.current = true
    setSharedLeadReleased(true)
    setSharedPinned(false)
  }, [])
  const sharedItemKey = mode === 'shared' && sharedItem ? theaterItemKey(sharedItem) : null
  const sharedPlayableKey = sharedLeadReleased ? null : sharedItemKey
  return {
    sharedPinned,
    clearSharedPin,
    releaseSharedLead,
    sharedItemKey,
    sharedPlayableKey,
    sharedLeadReleased,
  }
}
