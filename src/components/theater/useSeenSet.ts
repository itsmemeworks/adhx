'use client'

/**
 * localStorage seen model (spec §5). Key `adhx-seen-v1` holds a JSON array of
 * item keys (`theaterItemKey` format), most-recent-last, capped at 500 (oldest
 * dropped first). `adhx-last-visit` is a ms-epoch timestamp written only on
 * `pagehide`/tab-hide — read once on mount as `lastVisitAt` so a mid-session
 * refresh still counts as "still visiting" for the caught-up divider.
 *
 * The core list logic (parse/append/cap/membership) is exported as pure
 * functions so it's unit-testable without jsdom; the hook is a thin stateful
 * wrapper that also guards every `window`/`localStorage` touch (SSR-safe,
 * private-mode-safe — corrupt or inaccessible storage degrades to empty,
 * never throws).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export const SEEN_STORAGE_KEY = 'adhx-seen-v1'
export const LAST_VISIT_STORAGE_KEY = 'adhx-last-visit'
const SEEN_CAP = 500

export interface SeenSet {
  /** False until the localStorage state has been read (post-hydration). */
  ready: boolean
  isSeen(key: string): boolean
  /** Idempotent; persists to localStorage. */
  markSeen(key: string): void
  /** Previous visit timestamp (ms epoch), null on first ever visit. */
  lastVisitAt: number | null
  /**
   * The seen list as it was the moment this session read storage — what the
   * viewer had ALREADY watched when they arrived. Unlike `isSeen`, it does not
   * grow as they watch. Queue ORDERING uses this plus live `isSeen`: the
   * playing row stays in New / Up next so dwell does not yank it, then it
   * slides into Watched once it is no longer current. Use `isSeen` for "is
   * it seen NOW" (the ✓ and that slide), this for "was it already seen when
   * the session started".
   */
  seenOnEntry: readonly string[]
}

/** Parse the persisted seen-list. Missing/corrupt/wrong-shaped storage → `[]`, never throws. */
export function parseSeenList(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((k): k is string => typeof k === 'string')
  } catch {
    return []
  }
}

/** Membership check. Pure. */
export function isSeenKey(list: readonly string[], key: string): boolean {
  return list.includes(key)
}

/**
 * Append `key` to the list (moving it to the most-recent-last position if it
 * was already present), capped at `cap` by dropping the oldest entries. Pure —
 * calling it repeatedly with the same key converges to the same final state,
 * which is what makes `markSeen` idempotent.
 */
export function appendSeenKey(list: readonly string[], key: string, cap = SEEN_CAP): string[] {
  const withoutKey = list.filter((k) => k !== key)
  const next = [...withoutKey, key]
  return next.length > cap ? next.slice(next.length - cap) : next
}

/** Parse a stored `adhx-last-visit` value. Corrupt/missing → null. */
function parseLastVisit(raw: string | null | undefined): number | null {
  if (!raw) return null
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function useSeenSet(): SeenSet {
  const [ready, setReady] = useState(false)
  const [seen, setSeen] = useState<string[]>([])
  const [lastVisitAt, setLastVisitAt] = useState<number | null>(null)

  // Guards against writing adhx-last-visit more than once per hide/unload.
  const visitRecordedRef = useRef(false)
  // Frozen copy of what storage held on arrival — see `seenOnEntry`.
  const [seenOnEntry, setSeenOnEntry] = useState<readonly string[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      setLastVisitAt(parseLastVisit(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)))
      const stored = parseSeenList(window.localStorage.getItem(SEEN_STORAGE_KEY))
      setSeen(stored)
      setSeenOnEntry(stored)
    } catch {
      // localStorage inaccessible (private mode, disabled storage, etc.) —
      // degrade to "nothing seen yet" rather than crash.
    }
    setReady(true)

    const recordVisit = () => {
      if (visitRecordedRef.current) return
      visitRecordedRef.current = true
      try {
        window.localStorage.setItem(LAST_VISIT_STORAGE_KEY, String(Date.now()))
      } catch {
        // ignore — a failed write just means next visit's divider is off
      }
    }
    const onVisibilityChange = () => {
      if (document.hidden) recordVisit()
    }

    window.addEventListener('pagehide', recordVisit)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', recordVisit)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const isSeen = useCallback((key: string) => isSeenKey(seen, key), [seen])

  const markSeen = useCallback((key: string) => {
    setSeen((prev) => {
      if (isSeenKey(prev, key)) return prev
      const next = appendSeenKey(prev, key)
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(next))
        } catch {
          // ignore — a failed write just means this item re-shows next visit
        }
      }
      return next
    })
  }, [])

  return { ready, isSeen, markSeen, lastVisitAt, seenOnEntry }
}
