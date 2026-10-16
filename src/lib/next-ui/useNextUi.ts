'use client'

import { useEffect, useSyncExternalStore } from 'react'
import {
  NEXT_UI_COOKIE,
  NEXT_UI_COOKIE_MAX_AGE,
  NEXT_UI_PARAM,
  NEXT_UI_STORAGE_KEY,
  envNextUiDefault,
  parseFlagValue,
  resolveNextUi,
} from './flag'

const CHANGE_EVENT = 'adhx:next-ui-change'

function readQuery(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(NEXT_UI_PARAM)
  } catch {
    return null
  }
}

/** The persisted per-browser override, or null. Storage can throw (Safari private mode, blocked site data). */
export function readNextUiOverride(): boolean | null {
  try {
    return parseFlagValue(window.localStorage.getItem(NEXT_UI_STORAGE_KEY))
  } catch {
    return null
  }
}

/**
 * Persist (true / false) or clear (null) this browser's override. Mirrored to
 * a cookie so server components resolve the same way on the next request.
 */
export function setNextUiOverride(value: boolean | null): void {
  try {
    if (value === null) window.localStorage.removeItem(NEXT_UI_STORAGE_KEY)
    else window.localStorage.setItem(NEXT_UI_STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Storage unavailable: the URL param still works for this page view.
  }
  try {
    document.cookie =
      value === null
        ? `${NEXT_UI_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
        : `${NEXT_UI_COOKIE}=${value ? '1' : '0'}; Path=/; Max-Age=${NEXT_UI_COOKIE_MAX_AGE}; SameSite=Lax`
  } catch {
    // Cookies disabled — the client hook still reads localStorage.
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // No window (should not happen in a client component).
  }
}

function getSnapshot(): boolean {
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(NEXT_UI_STORAGE_KEY)
  } catch {
    stored = null
  }
  return resolveNextUi({ query: readQuery(), stored })
}

function getServerSnapshot(): boolean {
  return envNextUiDefault()
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('popstate', onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('popstate', onChange)
  }
}

/**
 * Whether this browser sees the redesigned UI. Renders the env default during
 * SSR/hydration, then the resolved value. A `?next_ui=1|0` on the URL is
 * persisted so the choice sticks after navigating away.
 */
export function useNextUi(): boolean {
  useEffect(() => {
    const fromQuery = parseFlagValue(readQuery())
    if (fromQuery !== null && fromQuery !== readNextUiOverride()) {
      setNextUiOverride(fromQuery)
    }
  }, [])
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
