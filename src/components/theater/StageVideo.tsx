'use client'

/**
 * <video> stage for twitter/tiktok MP4s (spec §6): poster-first, muted
 * autoplay, a whole-stage tap to unmute plus the rail/peek-bar audio button
 * as the sound affordance, replay + next
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
import { Play, RotateCcw, ArrowDown } from 'lucide-react'
import type { TheaterItem } from './types'

export interface StageVideoProps {
  item: TheaterItem
  src: string
  poster: string | null
  muted: boolean
  onRequestUnmute: () => void
  onEnded?: () => void
  /**
   * shared-post-repeat: while true, the native `loop` attribute takes over —
   * the browser restarts the video in place and never fires `ended`, so
   * `onEnded` (and therefore the shell's auto-advance) simply never runs.
   * Applied declaratively (unlike `src`/`muted`, which are imperative) since
   * it needs no coordination with the play()-call effect below.
   */
  repeat?: boolean
}

export function StageVideo({
  item,
  src,
  poster,
  muted,
  onRequestUnmute,
  onEnded,
  repeat,
}: StageVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ended, setEnded] = useState(false)
  const [needsGesture, setNeedsGesture] = useState(false)
  const [errored, setErrored] = useState(false)
  // Set only when the follow-up probe (below) confirms the src 410'd —
  // i.e. FxTwitter reports the underlying post gone (deleted/private/
  // suspended), not just "failed to load this time". Distinguishes the
  // graceful "gone" state (no retry — it won't come back) from the generic
  // load-failure state (retry is worth offering).
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null)
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
    setEnded(false)
    setNeedsGesture(false)
    setErrored(false)
    setUnavailableReason(null)
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
    // The shared top-of-screen progress line
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

  // A <video> error event carries no HTTP status, so it can't tell "this
  // post is gone for good" (FxTwitter 410 — deleted/private/suspended,
  // src.ts routes it through /api/media/video) from a transient load
  // failure worth retrying. Follow up with a lightweight ranged fetch of
  // the same src: our video routes serve GET (no HEAD), so a 2-byte Range
  // request is the cheapest way to read the real status without pulling
  // the whole file. A 410 body carries `{ error: 'unavailable', reason }`;
  // anything else (including a non-410 error) leaves the generic
  // load-failure state with its retry button in place.
  const handleVideoError = () => {
    setErrored(true)
    fetch(src, { headers: { Range: 'bytes=0-1' } })
      .then((res) => (res.status === 410 ? res.json() : null))
      .then((body) => {
        if (body && typeof body.reason === 'string') {
          setUnavailableReason(body.reason)
        }
      })
      .catch(() => {
        // Probe failed — stay in the generic load-failure state.
      })
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
        loop={repeat}
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
        onError={handleVideoError}
        className="h-full w-full object-contain"
      />

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

      {/* Gone-for-good fallback (post deleted/private/suspended on X): poster
          stays visible, no retry — retrying can't bring back content that's
          been removed at the source. The user's own next/prev navigation
          (or, in triage, Delete) is how they move past it — we never
          auto-skip. */}
      {errored && unavailableReason && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#08070a]/70 px-6 text-center">
          <p className="max-w-xs text-sm text-white/70">{unavailableReason}</p>
        </div>
      )}

      {/* Generic playback error fallback: poster stays visible, offer a retry. */}
      {errored && !unavailableReason && (
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

      {/* No internal progress bar: BOTH viewports now show the shared
          top-of-screen TheaterProgressLine, fed by the
          `theater-video-progress` events dispatched above. */}
      <span className="sr-only">{item.text || `${item.platform} video`}</span>
    </div>
  )
}
