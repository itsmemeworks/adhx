'use client'

/**
 * Instagram-style progress line for the mobile theater, fixed at the very top
 * of the screen (clay/orange on a faint track):
 * - kind 'video': fill mirrors the current video's playback — driven by
 *   `theater-video-progress` window CustomEvents (detail: { progress: 0..1 })
 *   dispatched by StageVideo on timeupdate. YouTube also gets this kind
 *   (StageYouTube drives real play/pause/ended/mute via the raw postMessage
 *   protocol — see that file) and, since round 5, dispatches the same event
 *   itself from the protocol's `infoDelivery` `currentTime`/`duration`
 *   fields, so the fill tracks YouTube playback too.
 * - kind 'timed': a 10s countdown fill; when it completes, dispatches a
 *   `theater-advance` window CustomEvent (the shell listens and goes next).
 *   Pauses while a `theater-pause` event is active and resumes (from the same
 *   progress) on `theater-resume` — dispatched by the mobile chrome's
 *   explicit pause/play button (TheaterMobileChrome). There is no longer a
 *   hold-to-pause gesture — it interfered with text selection on long posts.
 * - kind 'none': no item, or a 'timed' item (photo/text/quote/article) in
 *   triage's Collection tab — those still wait on a deliberate Done/Later/
 *   Delete, never a 10s dwell auto-advance (see `collectionTabProgressKind`
 *   and TheaterShell's `handleAdvance`). Videos in the Collection tab keep
 *   their real 'video' kind and auto-advance on end like every other
 *   playlist — see `TriageStage`'s `onEnded` wiring.
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
  if (
    item.platform === 'youtube' ||
    item.platform === 'tiktok' ||
    item.platform === 'instagram' ||
    item.contentType === 'video'
  ) {
    return 'video'
  }
  return 'timed'
}

/**
 * Pure: demote a 'timed' kind to 'none' while the shared post is pinned
 * (shared-post-repeat: the visitor lands on a shared link and it repeats
 * instead of auto-advancing into the live pulse until they deliberately
 * navigate — see TheaterShell's `sharedPinned`/`isSharedPostPinned`). A
 * pinned photo/text/article must never auto-advance out from under the
 * visitor, so its progress line renders nothing (no timer, no
 * `theater-advance` dispatch) rather than visibly counting toward an advance
 * that will never happen. 'video' and 'none' pass through unchanged — video
 * auto-advance is independently blocked at the player level (StageVideo's
 * `loop` attribute / StageYouTube's seek-to-0 replay), so its progress line
 * stays honest.
 */
export function progressKindForPin(kind: ProgressKind, pinned: boolean): ProgressKind {
  return pinned && kind === 'timed' ? 'none' : kind
}

/**
 * Pure: the progress-line kind for triage's Collection tab (unified-theater-
 * triage.md §2 — "My Collection is just a different playlist in that same
 * theater," the owner's standing directive). Videos now flow through the
 * Collection tab exactly like every other playlist — auto-advance on end —
 * so they keep whatever `progressKindFor` already gave them (typically
 * 'video'). Only 'timed' items (photo/text/quote/article) still wait on a
 * deliberate Done/Later/Delete, with no 10s dwell auto-advance, so 'timed'
 * alone is demoted to 'none' there. Composes with `progressKindForPin`
 * (apply this first, then that) for the shared-post-pin case.
 */
export function collectionTabProgressKind(
  baseKind: ProgressKind,
  isCollectionTab: boolean,
): ProgressKind {
  return isCollectionTab && baseKind === 'timed' ? 'none' : baseKind
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

    const handlePause = () => {
      paused = true
      // Force the next resumed tick to re-baseline from the accumulated
      // elapsed time instead of the wall-clock gap the pause created.
      baseline = null
    }
    const handleResume = () => {
      paused = false
    }

    window.addEventListener('theater-pause', handlePause)
    window.addEventListener('theater-resume', handleResume)
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('theater-pause', handlePause)
      window.removeEventListener('theater-resume', handleResume)
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
