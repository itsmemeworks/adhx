'use client'

/**
 * STUB — implemented by the theater-rail agent (spec §3).
 * ~400px right rail: brand row + Connect, now-playing (author, text, trend
 * count, actions), UpNextList, footer ("Browse as list" → /trending).
 */

import type { TheaterItem, TheaterMode } from './types'

export interface RailProps {
  mode: TheaterMode
  items: TheaterItem[]
  current: TheaterItem | null
  currentKey: string | null
  isSeen: (key: string) => boolean
  seenReady: boolean
  freshKeys: ReadonlySet<string>
  newCount: number
  savedToday: number
  onSelect: (key: string) => void
}

export function Rail(_props: RailProps) {
  return null
}
