'use client'

/**
 * <video> stage for twitter/tiktok MP4s (spec §6): poster-first, muted
 * autoplay, thin progress bar, "Tap for sound" affordance, replay + next
 * nudge on end. Falls back to a big centered play button when autoplay is
 * rejected even muted (iOS low-power mode blocks even muted autoplay — spec
 * §11).
 *
 * The <video> element is intentionally NEVER remounted on a src change (no
 * `key={src}`) — mobile browsers grant unmuted-autoplay permission to the
 * ELEMENT the user gestured on, not to the app. A fresh element for every
 * item would lose that grant on every swipe, forcing the user to re-tap
 * "sound" on every single video. Reusing the element lets an unmute survive
 * across items rendered by the same StageVideo instance (Stage.tsx renders
 * this component for both twitter and tiktok, so X→TikTok→X keeps it;
 * swapping to a non-video item — text/article/YouTube/a re-probing
 * Instagram reel — unmounts this component entirely, an accepted gap).
 *
 * `src`/`muted` are applied imperatively (not as controlled JSX attributes)
 * so there is exactly one caller of `play()` per item — the effect below —
 * instead of racing a manual play() against the `autoPlay` attribute like
 * the old per-item element did.
 */

import { useEffect, useRef, useState } from 'react'
import { Play, RotateCcw, Volume2, VolumeX, ArrowDown } from 'lucide-react'
import type { TheaterItem } from './types'

export interface StageVideoProps {
  item: TheaterItem
  src: string
  poster: string | null
  muted: boolean
  onRequestUnmute: () => void
  onEnded?: () => void
}

export function StageVideo({
  item,
  src,
  poster,
  muted,
  onRequestUnmute,
  onEnded,
}: StageVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [progress, setProgress] = useState(0)
  const [ended, setEnded] = useState(false)
  const [needsGesture, setNeedsGesture] = useState(false)
  const [errored, setErrored] = useState(false)
  const [playing, setPlaying] = useState(false)
  // Mirrors the live element's `.muted`. Initialized from the `muted` prop,
  // which is only the extern/initial signal from here on — once the user
  // (or a fallback below) changes the element's mute state directly, this is
  // what the rest of the component reads, never the prop again.
  const [effectiveMuted, setEffectiveMuted] = useState(muted)

  // Reconcile the shell's `muted` signal onto the persistent element — but
  // only on an actual prop transition (this effect's dependency array), so
  // a stale/unchanged prop value never echoes back over a mute state a tap
  // or the unmuted-autoplay fallback already changed for the item currently
  // on screen. Declared before the src-change effect so, on mount, the
  // element's initial mute state is set before that effect's play() call.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = muted
    setEffectiveMuted(muted)
  }, [muted])

  // New item: reset per-video UI state, then swap the element's source in
  // place and play it. This is the ONLY place that calls play() for a
  // freshly-loaded source, so a rejection here is a trustworthy "needs a
  // gesture" signal — there's no second caller (like the old `autoPlay`
  // attribute) it could be racing against.
  useEffect(() => {
    setProgress(0)
    setEnded(false)
    setNeedsGesture(false)
    setErrored(false)
    setPlaying(false)

    const video = videoRef.current
    if (!video) return

    video.src = src
    video.load()

    // Continue with whatever mute state the element already carries (an
    // earlier unmute, or a previous item's fallback re-mute) — never
    // re-derive from the `muted` prop here.
    video.play().then(
      () => setPlaying(true),
      () => {
        if (!video.muted) {
          // Unmuted continuation denied for this item — never leave the
          // video frozen. Drop back to muted and surface the sound
          // affordance again so the user can re-grant it.
          video.muted = true
          setEffectiveMuted(true)
          video.play().then(
            () => setPlaying(true),
            () => setNeedsGesture(true),
          )
        } else {
          setNeedsGesture(true)
        }
      },
    )
  }, [src])

  useEffect(() => {
    const handler = () => {
      const video = videoRef.current
      if (!video || ended || needsGesture) return
      if (video.paused) {
        video.play().then(
          () => setPlaying(true),
          () => setNeedsGesture(true),
        )
      } else {
        video.pause()
        setPlaying(false)
      }
    }
    window.addEventListener('theater-toggle-play', handler)
    return () => window.removeEventListener('theater-toggle-play', handler)
  }, [ended, needsGesture])

  // Explicit pause/resume (mobile theater's pause button, TheaterMobileChrome)
  // — unlike `theater-toggle-play` above, these have a single fixed meaning
  // each rather than flipping on current state, so a stale re-tap can't
  // fight itself. Guarded the same way as the toggle handler.
  useEffect(() => {
    const handlePause = () => {
      const video = videoRef.current
      if (!video || ended) return
      video.pause()
      setPlaying(false)
    }
    const handleResume = () => {
      const video = videoRef.current
      if (!video || ended || needsGesture) return
      video.play().then(
        () => setPlaying(true),
        () => setNeedsGesture(true),
      )
    }
    window.addEventListener('theater-pause', handlePause)
    window.addEventListener('theater-resume', handleResume)
    return () => {
      window.removeEventListener('theater-pause', handlePause)
      window.removeEventListener('theater-resume', handleResume)
    }
  }, [ended, needsGesture])

  // Broadcast the element's real playing/muted state so the mobile chrome's
  // pause and audio buttons stay in sync regardless of what triggered the
  // change (chrome button, a tap on the stage itself, an autoplay-rejection
  // fallback re-muting the element, etc.) — keyed on the state itself rather
  // than wired into every individual setPlaying/setEffectiveMuted call site,
  // so no future call site can forget to announce it.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('theater-playing-state', { detail: { playing } }))
  }, [playing])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('theater-muted-state', { detail: { muted: effectiveMuted } }),
    )
  }, [effectiveMuted])

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video || !video.duration) return
    const progress = video.currentTime / video.duration
    setProgress(progress)
    // Mirrors the internal bottom bar's value — the mobile top progress line
    // (TheaterProgressLine, kind 'video') has no access to this element, so
    // it subscribes to this event instead of reading the DOM directly.
    window.dispatchEvent(new CustomEvent('theater-video-progress', { detail: { progress } }))
  }

  const handleEnded = () => {
    setEnded(true)
    setPlaying(false)
    window.dispatchEvent(new CustomEvent('theater-video-progress', { detail: { progress: 1 } }))
    onEnded?.()
  }

  const handleReplay = () => {
    const video = videoRef.current
    if (!video) return
    setEnded(false)
    setErrored(false)
    video.currentTime = 0
    video.play().then(
      () => setPlaying(true),
      () => setNeedsGesture(true),
    )
  }

  const handleStartTap = () => {
    const video = videoRef.current
    if (!video) return
    setNeedsGesture(false)
    setErrored(false)
    video.play().then(
      () => setPlaying(true),
      () => setErrored(true),
    )
  }

  // Tapping the sound affordance unmutes the ELEMENT directly (works without
  // a fresh permission grant — it's the same element the tap gestured on),
  // then tells the shell so its `muted` state (and the next item's initial
  // signal) follows.
  const handleUnmuteTap = () => {
    const video = videoRef.current
    if (video) {
      video.muted = false
      setEffectiveMuted(false)
    }
    onRequestUnmute()
  }

  const handleStageTap = () => {
    if (needsGesture) {
      handleStartTap()
      return
    }
    if (effectiveMuted) {
      handleUnmuteTap()
      return
    }
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().then(
        () => setPlaying(true),
        () => setNeedsGesture(true),
      )
    } else {
      video.pause()
      setPlaying(false)
    }
  }

  return (
    <div className="relative h-full w-full bg-[#08070a]" onClick={handleStageTap}>
      <video
        ref={videoRef}
        poster={poster ?? undefined}
        playsInline
        onPlaying={() => {
          // The media element is the source of truth — a successful start
          // (initial play() or any later play() path) clears the gesture
          // overlay.
          setPlaying(true)
          setNeedsGesture(false)
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={() => setErrored(true)}
        className="h-full w-full object-contain"
      />

      {/* Small unmuted-state indicator (bottom-left), unchanged. */}
      {!effectiveMuted && playing && (
        <div className="pointer-events-none absolute bottom-6 left-4 inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm">
          <Volume2 size={14} />
        </div>
      )}

      {/* Prominent, hard-to-miss sound affordance: centered in the lower
          third, large tap target, gentle pulse. Shown any time the current
          video is muted-but-playing — the first video, or a later item that
          fell back to muted after an unmuted-continuation rejection.
          Desktop only — on mobile the affordance lives on the peek bar's
          audio button instead (TheaterMobileChrome pulses it under the same
          condition); the whole-stage tap-to-unmute here still works on
          mobile unchanged, this is just the visual nudge. */}
      {effectiveMuted && playing && !needsGesture && !ended && !errored && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[18%] hidden justify-center px-4 lg:flex">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleUnmuteTap()
            }}
            className="animate-sound-pulse pointer-events-auto inline-flex min-h-[48px] items-center gap-2.5 rounded-full bg-black/70 px-6 py-3 text-base font-semibold text-white shadow-lg backdrop-blur-md"
          >
            <VolumeX size={20} />
            Tap for sound
          </button>
        </div>
      )}

      {/* Tap-to-play fallback (autoplay rejected even muted). */}
      {needsGesture && !ended && !errored && (
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleStartTap()
            }}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md"
            aria-label="Play video"
          >
            <Play size={26} fill="currentColor" />
          </button>
        </div>
      )}

      {/* Playback error fallback: poster stays visible, offer a retry. */}
      {errored && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#08070a]/70 text-center">
          <p className="max-w-xs text-sm text-white/70">This video couldn&apos;t load.</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleStartTap()
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <RotateCcw size={15} />
            Try again
          </button>
        </div>
      )}

      {/* Replay + next nudge on end. No auto-advance (spec §6). */}
      {ended && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#08070a]/60">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleReplay()
            }}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md"
            aria-label="Replay"
          >
            <RotateCcw size={24} />
          </button>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-white/70">
            <ArrowDown size={14} />
            next
          </span>
        </div>
      )}

      {/* Thin progress bar along the bottom — desktop only. Mobile shows the
          shared top-of-screen TheaterProgressLine instead (fed by the
          `theater-video-progress` event dispatched above). */}
      <div className="absolute inset-x-0 bottom-0 hidden h-[3px] bg-white/15 lg:block">
        <div
          className="h-full bg-clay transition-[width] duration-150 ease-linear"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>

      <span className="sr-only">{item.text || `${item.platform} video`}</span>
    </div>
  )
}
