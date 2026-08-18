'use client'

/**
 * STUB — implemented by the theater-stage agent (spec §3).
 * Text/quote tweets typeset large (serif) on the stage; photo posts reuse the
 * layout with the image full-bleed.
 */

import type { TheaterItem } from './types'

export interface StageTextProps {
  item: TheaterItem
  /** When set, render the photo variant (image full-bleed + caption). */
  photo?: boolean
}

export function StageText(_props: StageTextProps) {
  return null
}
