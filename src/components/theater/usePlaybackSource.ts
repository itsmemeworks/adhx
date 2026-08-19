'use client'

/**
 * Per-platform playback resolution for a theater item (spec §6). PR 1 scope:
 * twitter + tiktok MP4 via `reelVideoSrc` (the video-src SSOT — never inline
 * a per-platform URL here, that's the regression that made Instagram fall
 * through to the Twitter proxy repeatedly); instagram/youtube resolve to
 * `poster` for now (their real stages — the IG Range-probe warm path and the
 * YouTube iframe — land in PR 2); everything else (photo/text/quote/article)
 * needs no media pipeline at all.
 *
 * The resolution itself is exported as a pure function (`resolvePlaybackSource`)
 * so it's unit-testable without React; the hook is a thin `useMemo` wrapper.
 */

import { useMemo } from 'react'
import { reelVideoSrc } from '@/components/feed/video-src'
import type { TheaterItem } from './types'

export interface PlaybackSource {
  /** 'video' = attach `src` to a <video>; 'poster' = image only; 'none' = no media. */
  kind: 'video' | 'poster' | 'none'
  src: string | null
  poster: string | null
}

/** Resolve a theater item's playback source. Pure — no fetch, no DOM. */
export function resolvePlaybackSource(item: TheaterItem | null): PlaybackSource {
  if (!item) return { kind: 'none', src: null, poster: null }

  const poster = item.thumbnailUrl ?? null
  const isTwitterOrTiktok = item.platform === 'twitter' || item.platform === 'tiktok'
  const isVideoLike = item.contentType === 'video' || item.platform === 'tiktok'

  if (isTwitterOrTiktok && isVideoLike) {
    return { kind: 'video', src: reelVideoSrc(item), poster }
  }
  if (item.platform === 'instagram' || item.platform === 'youtube') {
    return { kind: 'poster', src: null, poster }
  }
  return { kind: 'none', src: null, poster }
}

export function usePlaybackSource(item: TheaterItem | null): PlaybackSource {
  return useMemo(() => resolvePlaybackSource(item), [item])
}

/** Fire-and-forget warm of the NEXT item's source (Range 0-1). At most 1 ahead. */
export function prefetchPlayback(item: TheaterItem | null): void {
  if (typeof window === 'undefined' || !item) return
  const source = resolvePlaybackSource(item)
  if (source.kind !== 'video' || !source.src) return
  fetch(source.src, {
    headers: { Range: 'bytes=0-1' },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {
    // Best-effort warm — a failed prefetch just means the real request (on
    // play) pays the cold-start cost instead.
  })
}
