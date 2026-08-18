'use client'

/**
 * STUB — implemented by the theater-embed agent (spec §6).
 * Official youtube-nocookie iframe in a CONCRETE-height container — an
 * aspect box around an absolute iframe collapses to zero (known gotcha,
 * see CLAUDE.md "YouTube Shorts preview"). No MP4 exists; the iframe
 * appears instantly and plays on its own tap.
 */

import type { TheaterItem } from './types'

export interface StageYouTubeProps {
  item: TheaterItem
}

export function StageYouTube(_props: StageYouTubeProps) {
  return null
}
