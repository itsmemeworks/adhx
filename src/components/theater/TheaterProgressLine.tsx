'use client'

/**
 * STUB — implemented by the theater-progress agent.
 *
 * Instagram-style progress line for the mobile theater, fixed at the very top
 * of the screen (clay/orange on a faint track):
 * - kind 'video': fill mirrors the current video's playback — driven by
 *   `theater-video-progress` window CustomEvents (detail: { progress: 0..1 })
 *   dispatched by StageVideo on timeupdate.
 * - kind 'timed': a 10s countdown fill; when it completes, dispatches a
 *   `theater-advance` window CustomEvent (the shell listens and goes next).
 *   Pauses while a `theater-hold` event is active and resumes (from the same
 *   progress) on `theater-release` — hold-to-pause, dispatched by the shell's
 *   stage touch handlers.
 * - kind 'none' (YouTube — no progress/ended signal from the iframe): renders
 *   nothing; navigation stays manual.
 *
 * Progress state lives entirely inside this component (rAF/event driven) so
 * ticks never re-render the shell/stage tree.
 */

import type { TheaterItem } from './types'

export type ProgressKind = 'video' | 'timed' | 'none'

export const NON_VIDEO_DWELL_MS = 10_000

/** Pure: which progress treatment an item gets. */
export function progressKindFor(item: TheaterItem | null): ProgressKind {
  if (!item) return 'none'
  if (item.platform === 'youtube') return 'none'
  if (item.platform === 'tiktok' || item.platform === 'instagram' || item.contentType === 'video') {
    return 'video'
  }
  return 'timed'
}

export interface TheaterProgressLineProps {
  /** Current item key — progress resets when it changes. */
  itemKey: string | null
  kind: ProgressKind
}

export function TheaterProgressLine(_props: TheaterProgressLineProps) {
  return null
}
