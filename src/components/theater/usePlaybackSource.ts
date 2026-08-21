'use client'

/**
 * Per-platform playback resolution for a theater item (spec §6). Twitter +
 * tiktok MP4 via `reelVideoSrc` (the video-src SSOT — never inline a
 * per-platform URL here, that's the regression that made Instagram fall
 * through to the Twitter proxy repeatedly); instagram/youtube resolve to
 * `poster` here — instagram's real playback is a Range-probe-gated `<video>`
 * that only `StageInstagram` renders (never attach `<video src>` on the
 * mirror before the probe confirms 200/206, spec §6/§11), and youtube has no
 * MP4 at all (official iframe only).
 *
 * The resolution itself is exported as a pure function (`resolvePlaybackSource`)
 * so it's unit-testable without React; the hook is a thin `useMemo` wrapper.
 */

import { useMemo } from 'react'
import { reelVideoSrc } from '@/components/feed/video-src'
import { instagramVideoSrc } from '@/lib/media/instagram-playback'
import { fetchWithTimeout } from '@/lib/utils/fetch-timeout'
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

/**
 * The Instagram mirror URL to warm for this item, or null when the item
 * isn't an Instagram post (or has no source id yet). Pure — exported
 * separately from `prefetchPlayback` so the warm-target resolution is
 * testable without a `fetch`/`window`.
 */
export function instagramWarmSrc(item: TheaterItem | null): string | null {
  if (!item || item.platform !== 'instagram' || !item.bookmarkId) return null
  return instagramVideoSrc(item.bookmarkId)
}

/**
 * Fire-and-forget warm of a source (Range 0-1). For twitter/tiktok this is
 * the MP4 proxy; for instagram it's the vxinstagram mirror — its cold cache
 * can take 10–20s (see `instagram-playback.ts`), so warming early is what
 * makes the probe in `StageInstagram` usually resolve fast instead of
 * showing the "starting…" state. At most 1 item ahead (bandwidth restraint).
 */
export function prefetchPlayback(item: TheaterItem | null): void {
  if (typeof window === 'undefined' || !item) return

  const warmSrc = instagramWarmSrc(item)
  const source = warmSrc ? null : resolvePlaybackSource(item)
  const src = warmSrc ?? (source?.kind === 'video' ? source.src : null)
  if (!src) return

  fetchWithTimeout(src, 10_000, {
    headers: { Range: 'bytes=0-1' },
  }).catch(() => {
    // Best-effort warm — a failed prefetch just means the real request (on
    // play, or the probe) pays the cold-start cost instead.
  })
}
