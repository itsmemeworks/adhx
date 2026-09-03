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
 *   fields, so the fill tracks YouTube playback too. When YouTube
 *   withholds `currentTime` until an in-iframe gesture, StageYouTube
 *   interpolates from duration + play-start and still dispatches here.
 * - kind 'timed': a 10s countdown fill; when it completes, dispatches a
 *   `theater-advance` window CustomEvent (the shell listens and goes next).
 *   Pauses while a `theater-pause` event is active and resumes (from the same
 *   progress) on `theater-resume` — dock / peek-bar play-pause, or Space
 *   (`theater-toggle-play`, which this line also honors so static posts
 *   pause the 10s dwell the same way video pauses playback). There is no
 *   longer a hold-to-pause gesture — it interfered with text selection on
 *   long posts.
 * - kind 'none': no item, or a 'timed' item while Repeat-one / the shared
 *   post is pinned (`progressKindForPin`) — the line must not tick toward
 *   an advance that will never happen. Saved uses the same 'timed'
 *   dwell as Live; videos keep their real 'video' kind and auto-advance on
 *   end via Stage `onEnded`.
 *
 * Progress state lives entirely inside this component (rAF/event driven) so
 * ticks never re-render the shell/stage tree — the fill's width is mutated
 * directly on the DOM node via a ref, never through React state.
 */

import { useEffect, useRef } from 'react'
import { isQuoteReader, type TheaterItem } from './types'
import { dispatchTheaterSeek, THEATER_SEEK, type TheaterSeekDetail } from './useTheaterStageEvents'

export type ProgressKind = 'video' | 'timed' | 'none'

export const NON_VIDEO_DWELL_MS = 10_000

/** Pure: which progress treatment an item gets. */
export function progressKindFor(item: TheaterItem | null, _articleMode = false): ProgressKind {
  if (!item) return 'none'
  // Text-only quotes have no full-bleed player. Video stays 'video' in
  // article mode — the same element keeps playing above the reader.
  // `_articleMode` is kept so existing call sites don't churn.
  if (isQuoteReader(item, false)) return 'timed'
  if (item.platform === 'youtube' || item.platform === 'tiktok' || item.contentType === 'video') {
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

export interface TheaterProgressLineProps {
  /** Current item key — progress resets when it changes. */
  itemKey: string | null
  kind: ProgressKind
}

function paintProgress(
  fill: HTMLDivElement | null,
  slider: HTMLInputElement | null,
  progress: number,
) {
  const clamped = Math.min(1, Math.max(0, progress))
  const pct = clamped * 100
  if (fill) fill.style.width = `${pct}%`
  if (slider) {
    slider.value = String(Math.round(clamped * 1000))
    slider.setAttribute('aria-valuetext', `${Math.round(pct)}%`)
  }
}

export function TheaterProgressLine({ itemKey, kind }: TheaterProgressLineProps) {
  const fillRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const scrubbingRef = useRef(false)

  useEffect(() => {
    scrubbingRef.current = false
  }, [itemKey, kind])

  // kind 'video': mirror StageVideo's timeupdate-derived progress directly
  // onto the fill's width. No React state — a tick here must never trigger a
  // re-render of this component (let alone the shell/stage tree above it).
  useEffect(() => {
    if (kind !== 'video') return
    const fill = fillRef.current
    if (!fill) return
    paintProgress(fill, sliderRef.current, 0)

    function handleProgress(e: Event) {
      const detail = (e as CustomEvent<{ progress: number }>).detail
      if (!detail || scrubbingRef.current) return
      paintProgress(fillRef.current, sliderRef.current, detail.progress)
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
    paintProgress(fill, sliderRef.current, 0)

    let rafId = 0
    let baseline: number | null = null
    let elapsedMs = 0
    let paused = false
    let advanced = false

    const tick = (now: number) => {
      if (paused || scrubbingRef.current) {
        baseline = null
        rafId = requestAnimationFrame(tick)
        return
      }
      if (baseline === null) baseline = now - elapsedMs
      elapsedMs = now - baseline
      const node = fillRef.current
      if (node) {
        paintProgress(node, sliderRef.current, elapsedMs / NON_VIDEO_DWELL_MS)
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
    // Space / `theater-toggle-play` is what video stages listen for. Static
    // posts have no player — flip the dwell and broadcast pause/resume so
    // the dock and peek-bar icons stay in sync.
    const handleTogglePlay = () => {
      if (paused) {
        handleResume()
        window.dispatchEvent(new CustomEvent('theater-resume'))
      } else {
        handlePause()
        window.dispatchEvent(new CustomEvent('theater-pause'))
      }
    }
    const handleSeek = (event: Event) => {
      const detail = (event as CustomEvent<TheaterSeekDetail>).detail
      if (!detail || !Number.isFinite(detail.progress)) return
      elapsedMs = Math.min(1, Math.max(0, detail.progress)) * NON_VIDEO_DWELL_MS
      baseline = null
      advanced = false
      paintProgress(fillRef.current, sliderRef.current, detail.progress)
    }

    window.addEventListener('theater-pause', handlePause)
    window.addEventListener('theater-resume', handleResume)
    window.addEventListener('theater-toggle-play', handleTogglePlay)
    window.addEventListener(THEATER_SEEK, handleSeek)
    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('theater-pause', handlePause)
      window.removeEventListener('theater-resume', handleResume)
      window.removeEventListener('theater-toggle-play', handleTogglePlay)
      window.removeEventListener(THEATER_SEEK, handleSeek)
    }
  }, [kind, itemKey])

  if (kind === 'none') return null

  return (
    <div
      className="group pointer-events-auto fixed inset-x-0 top-0 z-[70] h-[calc(env(safe-area-inset-top)+44px)] touch-none lg:h-8"
      data-theater-progress
    >
      <div className="absolute inset-x-0 top-[env(safe-area-inset-top)] h-[3px] bg-white/15">
        <div
          ref={fillRef}
          data-theater-progress-fill
          className="relative h-full bg-clay after:absolute after:right-0 after:top-1/2 after:h-2 after:w-2 after:translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-clay after:shadow-[0_0_8px_rgba(240,127,76,.65)] after:transition-transform group-focus-within:after:scale-125 group-active:after:scale-125"
          style={{ width: '0%' }}
        />
      </div>
      <input
        ref={sliderRef}
        type="range"
        min="0"
        max="1000"
        step="1"
        defaultValue="0"
        aria-label="Playback position"
        aria-valuetext="0%"
        data-theater-progress-slider
        className="absolute inset-x-0 top-[env(safe-area-inset-top)] h-11 w-full cursor-ew-resize opacity-0 lg:h-8"
        onPointerDown={() => {
          scrubbingRef.current = true
        }}
        onPointerUp={() => {
          scrubbingRef.current = false
        }}
        onPointerCancel={() => {
          scrubbingRef.current = false
        }}
        onLostPointerCapture={() => {
          scrubbingRef.current = false
        }}
        onTouchStart={() => {
          scrubbingRef.current = true
        }}
        onTouchEnd={() => {
          scrubbingRef.current = false
        }}
        onTouchCancel={() => {
          scrubbingRef.current = false
        }}
        onInput={(event) => {
          const progress = Number(event.currentTarget.value) / 1000
          paintProgress(fillRef.current, sliderRef.current, progress)
          dispatchTheaterSeek(progress)
        }}
      />
    </div>
  )
}
