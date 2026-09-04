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
import {
  dispatchTheaterSeek,
  dispatchTheaterUserPlaybackState,
  THEATER_SEEK,
  type TheaterSeekDetail,
} from './useTheaterStageEvents'
import { cn } from '@/lib/utils'

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
  /** Desktop renders immediately above the 124px filmstrip instead of at the viewport top. */
  desktopDock?: boolean
  /** Keep timer/event effects alive while de-clutter hides the desktop dock. */
  hidden?: boolean
}

function paintProgress(
  fill: HTMLDivElement | null,
  slider: HTMLInputElement | null,
  progress: number,
  durationSeconds?: number | null,
) {
  const clamped = Math.min(1, Math.max(0, progress))
  const pct = clamped * 100
  if (fill) fill.style.width = `${pct}%`
  if (slider) {
    slider.value = String(Math.round(clamped * 1000))
    slider.setAttribute(
      'aria-valuetext',
      durationSeconds && Number.isFinite(durationSeconds)
        ? `${formatPlaybackTime(clamped * durationSeconds)} of ${formatPlaybackTime(durationSeconds)}`
        : `${Math.round(pct)}%`,
    )
  }
}

export function formatPlaybackTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const remainder = whole % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`
}

export function TheaterProgressLine({
  itemKey,
  kind,
  desktopDock = false,
  hidden = false,
}: TheaterProgressLineProps) {
  const fillRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const badgeRef = useRef<HTMLDivElement>(null)
  const badgeTextRef = useRef<HTMLSpanElement>(null)
  const durationRef = useRef<number | null>(kind === 'timed' ? NON_VIDEO_DWELL_MS / 1000 : null)
  const scrubbingRef = useRef(false)

  useEffect(() => {
    scrubbingRef.current = false
    durationRef.current = kind === 'timed' ? NON_VIDEO_DWELL_MS / 1000 : null
    badgeRef.current?.setAttribute('aria-hidden', 'true')
    if (badgeRef.current) badgeRef.current.style.opacity = '0'
  }, [itemKey, kind])

  const showScrubBadge = (progress: number) => {
    const duration = durationRef.current
    const badge = badgeRef.current
    if (!badge || !badgeTextRef.current || !duration || !Number.isFinite(duration)) return
    const clamped = Math.min(1, Math.max(0, progress))
    badge.style.opacity = '1'
    badgeTextRef.current.textContent = `${formatPlaybackTime(clamped * duration)} / ${formatPlaybackTime(duration)}`
  }

  const endScrub = () => {
    scrubbingRef.current = false
    badgeRef.current?.setAttribute('aria-hidden', 'true')
    if (badgeRef.current) badgeRef.current.style.opacity = '0'
  }

  useEffect(() => {
    if (hidden) endScrub()
  }, [hidden])

  // kind 'video': mirror StageVideo's timeupdate-derived progress directly
  // onto the fill's width. No React state — a tick here must never trigger a
  // re-render of this component (let alone the shell/stage tree above it).
  useEffect(() => {
    if (kind !== 'video') return
    const fill = fillRef.current
    if (!fill) return
    paintProgress(fill, sliderRef.current, 0)

    function handleProgress(e: Event) {
      const detail = (e as CustomEvent<{ progress: number; duration?: number }>).detail
      if (!detail) return
      if (detail.duration && Number.isFinite(detail.duration)) durationRef.current = detail.duration
      if (scrubbingRef.current) {
        showScrubBadge(Number(sliderRef.current?.value ?? 0) / 1000)
        return
      }
      paintProgress(fillRef.current, sliderRef.current, detail.progress, durationRef.current)
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
    paintProgress(fill, sliderRef.current, 0, NON_VIDEO_DWELL_MS / 1000)

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
        paintProgress(
          node,
          sliderRef.current,
          elapsedMs / NON_VIDEO_DWELL_MS,
          NON_VIDEO_DWELL_MS / 1000,
        )
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
        dispatchTheaterUserPlaybackState(false)
        handleResume()
        window.dispatchEvent(new CustomEvent('theater-resume'))
      } else {
        dispatchTheaterUserPlaybackState(true)
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
      paintProgress(fillRef.current, sliderRef.current, detail.progress, NON_VIDEO_DWELL_MS / 1000)
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
    <div className="contents" data-theater-progress>
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
        disabled={hidden}
        className={cn(
          'peer fixed inset-x-0 z-[70] w-full touch-none cursor-ew-resize opacity-0',
          desktopDock
            ? 'bottom-[124px] top-auto h-9'
            : 'pointer-events-auto top-[env(safe-area-inset-top)] h-11',
          hidden ? 'pointer-events-none' : 'pointer-events-auto',
        )}
        onPointerDown={() => {
          scrubbingRef.current = true
          showScrubBadge(Number(sliderRef.current?.value ?? 0) / 1000)
        }}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onLostPointerCapture={endScrub}
        onTouchStart={() => {
          scrubbingRef.current = true
          showScrubBadge(Number(sliderRef.current?.value ?? 0) / 1000)
        }}
        onTouchEnd={endScrub}
        onTouchCancel={endScrub}
        onInput={(event) => {
          const progress = Number(event.currentTarget.value) / 1000
          paintProgress(fillRef.current, sliderRef.current, progress, durationRef.current)
          if (scrubbingRef.current) showScrubBadge(progress)
          dispatchTheaterSeek(progress)
        }}
      />
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 transition-[opacity,filter,background-color]',
          desktopDock
            ? 'bottom-[124px] top-auto z-[72] h-1 bg-white/20'
            : 'top-[env(safe-area-inset-top)] z-[70] h-[3px] bg-white/15',
          'peer-focus-visible:bg-white/40 peer-focus-visible:brightness-125',
          hidden && 'opacity-0',
        )}
      >
        <div
          ref={fillRef}
          data-theater-progress-fill
          className={cn(
            'relative h-full bg-clay after:absolute after:right-0 after:top-1/2 after:h-2 after:w-2 after:translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-clay after:shadow-[0_0_8px_rgba(240,127,76,.65)]',
            desktopDock && 'bg-[#f07f4c] shadow-[0_0_10px_rgba(240,127,76,.72)] after:bg-[#f07f4c]',
          )}
          style={{ width: '0%' }}
        />
      </div>
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 z-[74] flex justify-center',
          desktopDock
            ? 'bottom-[calc(124px+0.5625rem)]'
            : 'top-[calc(env(safe-area-inset-top)+0.5rem)]',
        )}
      >
        <div
          ref={badgeRef}
          data-theater-scrub-time
          aria-hidden="true"
          className="pointer-events-none w-max min-w-[7rem] whitespace-nowrap rounded-full border border-white/20 bg-[#121117]/95 px-2 py-1 text-center font-mono text-[11px] font-semibold leading-none tabular-nums text-white opacity-0 shadow-[0_5px_18px_rgba(0,0,0,.35)] backdrop-blur-md"
        >
          <span ref={badgeTextRef}>0:00 / 0:00</span>
        </div>
      </div>
    </div>
  )
}
