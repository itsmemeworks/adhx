'use client'

/**
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
 * ticks never re-render the shell/stage tree — the fill's width is mutated
 * directly on the DOM node via a ref, never through React state.
 */

import { useEffect, useRef } from 'react'
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

export function TheaterProgressLine({ itemKey, kind }: TheaterProgressLineProps) {
  const fillRef = useRef<HTMLDivElement>(null)

  // kind 'video': mirror StageVideo's timeupdate-derived progress directly
  // onto the fill's width. No React state — a tick here must never trigger a
  // re-render of this component (let alone the shell/stage tree above it).
  useEffect(() => {
    if (kind !== 'video') return
    const fill = fillRef.current
    if (!fill) return
    fill.style.width = '0%'

    function handleProgress(e: Event) {
      const detail = (e as CustomEvent<{ progress: number }>).detail
      const node = fillRef.current
      if (!node || !detail) return
      const pct = Math.min(100, Math.max(0, detail.progress * 100))
      node.style.width = `${pct}%`
    }

    window.addEventListener('theater-video-progress', handleProgress)
    return () => window.removeEventListener('theater-video-progress', handleProgress)
  }, [kind, itemKey])

  // kind 'timed': a self-driven 10s rAF countdown. `paused` + `elapsedMs` are
  // plain closure variables (not state/refs-outside-effect) so a hold/release
  // pair only ever adjusts this one running loop — pausing freezes `elapsedMs`
  // in place and resuming re-derives the rAF baseline from it, so the fill
  // continues from the same progress rather than restarting.
  useEffect(() => {
    if (kind !== 'timed') return
    const fill = fillRef.current
    if (!fill) return
    fill.style.width = '0%'

    let rafId = 0
    let baseline: number | null = null
    let elapsedMs = 0
    let paused = false
    let advanced = false

    const tick = (now: number) => {
      if (paused) {
        rafId = requestAnimationFrame(tick)
        return
      }
      if (baseline === null) baseline = now - elapsedMs
      elapsedMs = now - baseline
      const node = fillRef.current
      if (node) {
        const pct = Math.min(100, (elapsedMs / NON_VIDEO_DWELL_MS) * 100)
        node.style.width = `${pct}%`
      }
      if (elapsedMs >= NON_VIDEO_DWELL_MS) {
        if (!advanced) {
          advanced = true
          window.dispatchEvent(new CustomEvent('theater-advance'))
        }
        return
      }
      rafId = requestAnimationFrame(tick)
    }

    const handleHold = () => {
      paused = true
      // Force the next resumed tick to re-baseline from the accumulated
      // elapsed time instead of the wall-clock gap the hold created.
      baseline = null
    }
    const handleRelease = () => {
      paused = false
    }

    window.addEventListener('theater-hold', handleHold)
    window.addEventListener('theater-release', handleRelease)
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('theater-hold', handleHold)
      window.removeEventListener('theater-release', handleRelease)
    }
  }, [kind, itemKey])

  if (kind === 'none') return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] pt-[env(safe-area-inset-top)]"
      aria-hidden
    >
      <div className="h-[3px] w-full bg-white/15">
        <div ref={fillRef} className="h-full bg-clay" style={{ width: '0%' }} />
      </div>
    </div>
  )
}
