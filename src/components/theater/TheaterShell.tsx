'use client'

/**
 * STUB — implemented by the theater-shell agent (spec §3).
 * Full-viewport layout: <Stage/> + <Rail/>. Owns current-item state, keyboard
 * (↓/↑ next/prev, m mute, space play/pause), seen-marking (staged ≥2s), the
 * preview pulse (POST /api/activity/preview), and theater.* metrics.
 */

import type { TheaterFeedSeed, TheaterMode } from './types'

export interface TheaterShellProps {
  seed: TheaterFeedSeed
  mode?: TheaterMode
}

export function TheaterShell({ seed, mode = 'home' }: TheaterShellProps) {
  void seed
  void mode
  return <div className="min-h-screen bg-[#08070a]" />
}
