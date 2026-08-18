'use client'

/**
 * STUB — implemented by the theater-instagram agent (spec §6).
 * Instagram Reel stage: NEVER attaches `<video src>` until the mirror proxy
 * answers a Range probe with 200/206 (`probeInstagramVideo`) — the vxinstagram
 * cold cache can take 10–20s and media elements abort sooner. Poster + spinner
 * for ≤3s, then poster + "starting…"; persistent miss → official IG iframe.
 */

import type { TheaterItem } from './types'

export interface StageInstagramProps {
  item: TheaterItem
  muted: boolean
  onRequestUnmute: () => void
  onEnded?: () => void
}

export function StageInstagram(_props: StageInstagramProps) {
  return null
}
