'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * Whether the app is working on something people are waiting for (a post
 * loading, a search, a paste being grabbed, an X sync). The header's Gob
 * looks around while it is.
 */
const busy = new Set<string>()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function setLogoBusy(key: string, on: boolean): void {
  const had = busy.has(key)
  if (on && !had) busy.add(key)
  else if (!on && had) busy.delete(key)
  else return
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLogoBusy(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => busy.size > 0,
    () => false,
  )
}

/** Mark `key` busy while `on` is true (cleared on unmount). */
export function useBusyLogo(key: string, on: boolean): void {
  useEffect(() => {
    setLogoBusy(key, on)
    return () => setLogoBusy(key, false)
  }, [key, on])
}
