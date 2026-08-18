'use client'

/**
 * STUB — implemented by the theater-hooks agent (spec §6).
 * Per-platform playback resolution for a theater item. PR 1 scope:
 * twitter + tiktok MP4 via `reelVideoSrc` (SSOT); instagram/youtube resolve
 * to `poster` (their stages land in PR 2); photo/text/article need no media.
 */

import type { TheaterItem } from './types'

export interface PlaybackSource {
  /** 'video' = attach `src` to a <video>; 'poster' = image only; 'none' = no media. */
  kind: 'video' | 'poster' | 'none'
  src: string | null
  poster: string | null
}

export function usePlaybackSource(item: TheaterItem | null): PlaybackSource {
  void item
  return { kind: 'none', src: null, poster: null }
}

/** Fire-and-forget warm of the NEXT item's source (Range 0-1). At most 1 ahead. */
export function prefetchPlayback(item: TheaterItem | null): void {
  void item
}
