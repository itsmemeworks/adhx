'use client'

/**
 * STUB — implemented by the theater-hooks agent (spec §5).
 * localStorage seen model: key `adhx-seen-v1` (array of item keys, capped 500),
 * `adhx-last-visit` timestamp. Client-only; `ready` stays false until hydrated.
 */

export interface SeenSet {
  /** False until the localStorage state has been read (post-hydration). */
  ready: boolean
  isSeen(key: string): boolean
  /** Idempotent; persists to localStorage. */
  markSeen(key: string): void
  /** Previous visit timestamp (ms epoch), null on first ever visit. */
  lastVisitAt: number | null
}

export function useSeenSet(): SeenSet {
  return { ready: false, isSeen: () => false, markSeen: () => {}, lastVisitAt: null }
}
