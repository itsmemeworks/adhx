'use client'

/**
 * STUB — implemented by the theater-stage agent (spec §6).
 * <video> stage for twitter/tiktok MP4s: poster-first, muted autoplay,
 * progress bar, "Tap for sound" chip, replay + next nudge on end.
 */

import type { TheaterItem } from './types'

export interface StageVideoProps {
  item: TheaterItem
  src: string
  poster: string | null
  muted: boolean
  onRequestUnmute: () => void
  onEnded?: () => void
}

export function StageVideo(_props: StageVideoProps) {
  return null
}
