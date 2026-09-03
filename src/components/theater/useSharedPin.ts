'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { theaterItemKey, type TheaterItem, type TheaterMode } from './types'

/**
 * Shared-post-repeat pin. Separate from `pinnedKey` (display order): this
 * one decides whether the shared post REPEATS instead of auto-advancing
 * into the live pulse. Starts on for every resolvable shared preview,
 * regardless of authentication state.
 * A repeat-button tap or deliberate navigation clears it when it is on.
 */
export function useSharedPin(
  mode: TheaterMode,
  sharedItem: TheaterItem | undefined,
  sharedUnavailable?: boolean,
) {
  const [sharedPinned, setSharedPinned] = useState(
    mode === 'shared' && !!sharedItem && !sharedUnavailable,
  )
  const [sharedLeadReleased, setSharedLeadReleased] = useState(false)
  const sharedLeadReleasedRef = useRef(false)
  const sharedPinDisqualifiedRef = useRef(Boolean(sharedUnavailable))
  useEffect(() => {
    if (sharedUnavailable) sharedPinDisqualifiedRef.current = true
    const shouldPin =
      mode === 'shared' &&
      !!sharedItem &&
      !sharedPinDisqualifiedRef.current &&
      !sharedLeadReleasedRef.current
    setSharedPinned(shouldPin)
  }, [mode, sharedItem, sharedUnavailable])
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
