'use client'

/**
 * STUB — implemented by the theater-rail agent (spec §3/§5).
 * Rail feed rows + seen divider ("N new since your last visit" / caught-up
 * line), dimmed seen rows, "next ↓" highlight on the row after current.
 */

import type { TheaterItem } from './types'

export interface UpNextListProps {
  items: TheaterItem[]
  currentKey: string | null
  isSeen: (key: string) => boolean
  /** Ready flag from useSeenSet — render everything unseen until true (SSR parity). */
  seenReady: boolean
  /** Keys that arrived via polling after mount (accent treatment). */
  freshKeys: ReadonlySet<string>
  /** Items newer than last visit and unseen. 0 = show "you're all caught up". */
  newCount: number
  onSelect: (key: string) => void
}

export function UpNextList(_props: UpNextListProps) {
  return null
}
