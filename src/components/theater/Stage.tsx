'use client'

/**
 * STUB — implemented by the theater-stage agent (spec §3/§6).
 * Dark stage dispatcher: renders the right variant for the current item.
 * The stage background is ALWAYS near-black (#08070a) in both themes.
 */

import type { TheaterItem } from './types'

export interface StageProps {
  item: TheaterItem | null
  /** Muted until the user's first gesture (autoplay policy). */
  muted: boolean
  /** User tapped the "Tap for sound" chip / the video. */
  onRequestUnmute: () => void
  /** Current video finished (show replay + "↓ next" nudge; no auto-advance). */
  onEnded?: () => void
}

export function Stage({ item }: StageProps) {
  return (
    <div className="h-full w-full bg-[#08070a]" data-stage-item={item ? 'yes' : 'empty'} />
  )
}
