'use client'

/**
 * <video> stage for twitter/tiktok MP4s (spec §6): poster-first, muted
 * autoplay. A whole-stage tap hides chrome and starts playback (Instagram);
 * tapping again restores overlays without pausing. Sound is the rail/peek-bar
 * audio button. Falls back to a big centered play button when
 * autoplay is rejected even muted (iOS low-power mode blocks even muted
 * autoplay — spec §11). There is NO end-of-video replay/next overlay anymore
 * (owner: legacy — it predated auto-advance and leaked over the next item
 * after the waiting stage's "Start from the beginning"): every playlist now
 * auto-advances or loops on `ended`, and an ended video that somehow has
 * nowhere to go replays via the transport/stage-tap instead (the `ended`
 * branches in the play handlers below).
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

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { logSV } from './YtDebugOverlay'
import {
  dispatchTheaterStageTap,
  dispatchTheaterUserPlaybackState,
  THEATER_SEEK,
  type TheaterSeekDetail,
} from './useTheaterStageEvents'
import { nextAlbumIndex, StageAlbumDots, StageAlbumScroller } from './StageAlbumChrome'
import type { TheaterItem } from './types'

/**
 * How long a failed video stays on screen before the queue moves on. Matches
 * the timed-dwell advance a non-video item gets, so a dead post costs the same
 * ~10s as a text post rather than ending the session.
 */
const ERRORED_ADVANCE_MS = 10_000

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

export interface StageVideoProps {
  item: TheaterItem
  src: string
  poster: string | null
  muted: boolean
  /** Shell unmute — used by the chrome audio button, not the stage tap. */
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
  /**
   * This element is retained but COVERED — a non-video item is on stage and
   * this instance only exists to keep the element (and the unmute grant iOS
   * gave it) alive underneath. Pause while covered, resume on uncover.
   *
   * Without this the element unmounted on every text/photo/article item, so
   * returning to a video meant a brand-new element with no grant, and sound
   * silently dropped mid-session — owner report: "sometimes I'm watching with
   * volume and it goes from a video to an image or a text post, and then back
   * to a video. It's actually muted for me again."
   */
  covered?: boolean
  /**
   * Twitter video album (same snap chrome as multi-photo). One <video>
   * element — src swaps with the index so the iOS unmute grant survives.
   */
  albumCount?: number
  albumIndex?: number
  albumPosters?: string[]
  onAlbumIndexChange?: (index: number) => void
}

export function StageVideo({
  item,
  src,
  poster,
  muted,
  onRequestUnmute: _onRequestUnmute,
  onEnded,
  repeat,
  covered = false,
  albumCount = 1,
  albumIndex = 0,
  albumPosters = [],
  onAlbumIndexChange,
}: StageVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  // The element intentionally survives source swaps, so every asynchronous
  // operation must carry the source generation it started under. A settled
  // play()/probe from the previous MP4 must never mutate the new item's
  // playback, mute, gesture, or error state.
  const sourceGenerationRef = useRef(0)
  const currentSrcRef = useRef(src)
  // Native media events do not carry the resource that queued them. Committing
  // a new src invalidates this binding synchronously; the next matching
  // `loadstart` activates the new generation. Media-element tasks are ordered,
  // so an ended/error/pause task left over from A runs before B's loadstart
  // and is ignored.
  // The URL checks also reject a lifecycle event while currentSrc still
  // identifies A. This preserves one persistent element without pretending
  // the generation read at event-dispatch time identifies the event's source.
  const activeLifecycleRef = useRef<{ generation: number; src: string } | null>(null)
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
  // Instagram catch-up unmute: every Instagram item is a genuinely FRESH
  // mount of this component (StageInstagram swaps a brand-new StageVideo in
  // the moment its mirror probe succeeds — unlike twitter/tiktok, which
  // reuse ONE persistent instance across items, see the top-of-file
  // comment). A fresh element carries no user-gesture history, so when the
  // shell already wants sound (`muted` prop false) the initial unmuted
  // play() attempt above is routinely rejected and falls back to muted —
  // and previously nothing ever asked for sound again, leaving a viewer who
  // already had sound on stuck muted the moment an Instagram item came up.
  // `catchUpAttemptedRef` bounds this to one attempt per item (no retries —
  // round-4 lesson elsewhere in this file's sibling stages: silence never
  // means rejection, only an OBSERVED signal does); `catchUpPendingRef`
  // marks that attempt as in flight so an unexpected `pause` right after it
  // (the only signal a platform gives for vetoing a gesture-less unmute) can
  // be told apart from a deliberate pause action, which clears this first.
  const catchUpAttemptedRef = useRef(false)
  const catchUpPendingRef = useRef(false)
  const pausedByCoverRef = useRef(false)
  const deferredEndedRef = useRef<(() => void) | null>(null)

  const captureSource = () => ({
    generation: sourceGenerationRef.current,
    src: currentSrcRef.current,
  })
  const isCurrentSource = (generation: number, operationSrc: string) =>
    sourceGenerationRef.current === generation && currentSrcRef.current === operationSrc
  const absoluteSource = (operationSrc: string) => new URL(operationSrc, document.baseURI).href
  const elementMatchesSource = (video: HTMLVideoElement, operationSrc: string) => {
    const expected = absoluteSource(operationSrc)
    return (
      (!video.currentSrc || video.currentSrc === expected) && (!video.src || video.src === expected)
    )
  }
  const isCurrentLifecycleEvent = (video: HTMLVideoElement) => {
    const active = activeLifecycleRef.current
    return (
      active !== null &&
      isCurrentSource(active.generation, active.src) &&
      elementMatchesSource(video, active.src)
    )
  }

  // Reconcile the shell's `muted` signal onto the persistent element — but
  // only on an actual prop transition (this effect's dependency array), so
  // a stale/unchanged prop value never echoes back over a mute state a tap
  // or the unmuted-autoplay fallback already changed for the item currently
  // on screen. Declared before the src-change effect so, on mount, the
  // element's initial mute state is set before that effect's play() call.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    logSV(`[muted] prop reconcile -> ${muted} (async persistence path)`)
    video.muted = muted
    setEffectiveMuted(muted)
  }, [muted])

  // The top progress line is an interactive scrubber. Seek the persistent
  // media element in place so its iOS sound grant survives, and ignore the
  // event while this player is only being retained underneath a non-video
  // stage.
  useEffect(() => {
    const handleSeek = (event: Event) => {
      const detail = (event as CustomEvent<TheaterSeekDetail>).detail
      const video = videoRef.current
      if (
        covered ||
        !video ||
        !detail ||
        !Number.isFinite(detail.progress) ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0 ||
        !isCurrentLifecycleEvent(video)
      ) {
        return
      }
      const progress = Math.min(1, Math.max(0, detail.progress))
      video.currentTime = progress * video.duration
      if (progress < 1) setEnded(false)
    }
    window.addEventListener(THEATER_SEEK, handleSeek)
    return () => window.removeEventListener(THEATER_SEEK, handleSeek)
  }, [covered])

  // Gesture-context fast path (the persistent double-tap-to-unmute bug): the
  // chrome's audio button dispatches this SYNCHRONOUSLY, from inside its own
  // click handler's call stack, alongside (not instead of) calling the
  // shell's setter — which lands on the `[muted]` prop above one render
  // later, OUTSIDE the tap's gesture context. WebKit gates un-muting a
  // playing video on the mutation happening synchronously in response to a
  // user gesture; the prop effect above is a passive effect and always runs
  // in a separate task, so it was the ONLY stage control still relying on
  // that async path (pause/play already used synchronous `theater-pause`/
  // `theater-resume`/`theater-toggle-play` events). Applying the SAME value
  // here first means the `[muted]` effect above observes an
  // already-correct element and is just idempotent housekeeping by the time
  // it runs.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ muted: boolean; source?: 'user' | 'catchup' }>).detail
      if (!detail) return
      const video = videoRef.current
      if (!video) return
      logSV(`theater-set-muted(${detail.muted}, ${detail.source ?? 'user'}) applied synchronously`)
      if (!detail.muted && detail.source === 'catchup' && video.muted) {
        // Cross-tab/local preference synchronization has no user activation.
        // Watch for the platform's observed rejection-pause exactly like the
        // automatic fresh-element catch-up path below.
        catchUpAttemptedRef.current = true
        catchUpPendingRef.current = true
      } else {
        // A real audio-button/stage gesture, or an explicit mute, must never
        // be mistaken for a gesture-less autoplay attempt.
        catchUpPendingRef.current = false
      }
      video.muted = detail.muted
      setEffectiveMuted(detail.muted)
    }
    window.addEventListener('theater-set-muted', handler)
    return () => window.removeEventListener('theater-set-muted', handler)
  }, [])

  // A render can commit before the passive source-loading effect below runs.
  // Invalidate A synchronously in the commit's layout phase so a queued media
  // event (or a settling play promise) cannot observe A as current while the
  // DOM already represents B. The passive effect consumes this generation;
  // it does not increment again.
  useLayoutEffect(() => {
    sourceGenerationRef.current += 1
    currentSrcRef.current = src
    activeLifecycleRef.current = null
  }, [src])

  // New item: reset per-video UI state, then swap the element's source in
  // place and play it. This is the ONLY place that calls play() for a
  // freshly-loaded source, so a rejection here is a trustworthy "needs a
  // gesture" signal — there's no second caller (like the old `autoPlay`
  // attribute) it could be racing against.
  useEffect(() => {
    // The layout effect above already advanced this source generation before
    // any queued native event could run. Capture it for load/play work.
    const generation = sourceGenerationRef.current

    setEnded(false)
    setNeedsGesture(false)
    setErrored(false)
    setUnavailableReason(null)
    setPlaying(false)
    catchUpAttemptedRef.current = false
    catchUpPendingRef.current = false
    deferredEndedRef.current = null

    const video = videoRef.current
    if (!video) return

    logSV(`mount item platform=${item.platform} initialMuted=${video.muted}`)
    video.src = src
    video.load()

    // Continue with whatever mute state the element already carries (an
    // earlier unmute, or a previous item's fallback re-mute) — never
    // re-derive from the `muted` prop here.
    video.play().then(
      () => {
        if (!isCurrentSource(generation, src)) return
        setPlaying(true)
      },
      (err: unknown) => {
        if (!isCurrentSource(generation, src)) return
        if (isAbortError(err)) return
        logSV('play() rejected', err instanceof Error ? err.name : String(err))
        if (!video.muted) {
          // Unmuted continuation denied for this item — never leave the
          // video frozen. Drop back to muted and surface the sound
          // affordance again so the user can re-grant it.
          video.muted = true
          setEffectiveMuted(true)
          video.play().then(
            () => {
              if (!isCurrentSource(generation, src)) return
              setPlaying(true)
            },
            (err: unknown) => {
              if (!isCurrentSource(generation, src)) return
              if (isAbortError(err)) return
              setNeedsGesture(true)
            },
          )
        } else {
          setNeedsGesture(true)
        }
      },
    )
    return () => {
      if (isCurrentSource(generation, src)) {
        sourceGenerationRef.current += 1
      }
    }
  }, [src])

  // Cover transitions. Pausing is unconditional (a covered video must never be
  // heard under a text post); resuming only touches a video this component
  // actually paused, and only when the src hasn't changed underneath — a src
  // change means the `[src]` effect above is already calling play(), and this
  // must not become a second caller of it.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (covered) {
      if (!video.paused) {
        logSV('covered by a non-video item — pausing, element retained')
        // A cover is an intentional pause, just like the transport's fixed
        // pause command. Disarm catch-up attribution before the native pause
        // event arrives so it cannot be mistaken for an autoplay rejection.
        catchUpPendingRef.current = false
        video.pause()
        pausedByCoverRef.current = true
      }
      return
    }
    if (deferredEndedRef.current) {
      const finishEnded = deferredEndedRef.current
      deferredEndedRef.current = null
      pausedByCoverRef.current = false
      finishEnded()
      return
    }
    if (!pausedByCoverRef.current) return
    pausedByCoverRef.current = false
    if (video.paused) {
      const { generation, src: operationSrc } = captureSource()
      logSV(`uncovered — resuming (muted=${video.muted})`)
      video.play().then(
        () => {
          if (!isCurrentSource(generation, operationSrc)) return
          setPlaying(true)
        },
        (err: unknown) => {
          if (!isCurrentSource(generation, operationSrc)) return
          if (isAbortError(err)) return
          setNeedsGesture(true)
        },
      )
    }
  }, [covered])

  /**
   * A dead video must not stop the playlist. When playback errors out — the
   * mirror/proxy 404s, the post is gone at the source — the queue moves on
   * after the same ~10s a non-video item gets from the timed dwell, so the
   * viewer sees what happened (and can hit "Try again", which clears `errored`
   * and cancels this) but isn't stranded. Owner: "we should apply the same
   * 10-second rule we use with a non-video so it at least skips and doesn't
   * stop the playlist."
   *
   * Skipped while `repeat` is on — a pinned or looping post is deliberately
   * parked on, error or not — and when there's nowhere to advance to (`onEnded`
   * absent, e.g. collection, where Delete is the way past a dead post).
   */
  useEffect(() => {
    if (!errored || !onEnded || repeat || covered) return
    logSV(`errored — advancing in ${ERRORED_ADVANCE_MS}ms rather than stalling the queue`)
    const timer = setTimeout(() => onEnded(), ERRORED_ADVANCE_MS)
    return () => clearTimeout(timer)
  }, [errored, onEnded, repeat, covered])

  // The ONE start path for a not-yet-started video (autoplay rejected, the
  // tap-to-play overlay showing): used by the overlay's own tap AND — via the
  // `needsGesture` branches below — the peek-bar/dock transport's play/resume
  // button, so both user gestures produce identical behavior. Previously only
  // the overlay called this; the transport handlers below just bailed out
  // whenever `needsGesture` was true, so tapping "play" in the controls did
  // nothing until the viewer also tapped the overlay on the stage itself.
  const handleStartTap = () => {
    const video = videoRef.current
    if (!video) return
    const { generation, src: operationSrc } = captureSource()
    setNeedsGesture(false)
    setErrored(false)
    video.play().then(
      () => {
        if (!isCurrentSource(generation, operationSrc)) return
        setPlaying(true)
      },
      (err: unknown) => {
        if (!isCurrentSource(generation, operationSrc)) return
        if (isAbortError(err)) return
        setErrored(true)
      },
    )
  }

  useEffect(() => {
    const handler = () => {
      const video = videoRef.current
      if (!video) return
      if (errored || unavailableReason) return
      // Ended with nowhere auto-advance took it (e.g. behind the waiting
      // overlay): the transport's play means "watch it again" — there's no
      // end-overlay replay button anymore.
      if (ended) {
        dispatchTheaterUserPlaybackState(false)
        handleReplay()
        return
      }
      if (needsGesture) {
        dispatchTheaterUserPlaybackState(false)
        handleStartTap()
        return
      }
      if (video.paused) {
        dispatchTheaterUserPlaybackState(false)
        const { generation, src: operationSrc } = captureSource()
        video.play().then(
          () => {
            if (!isCurrentSource(generation, operationSrc)) return
            setPlaying(true)
          },
          (err: unknown) => {
            if (!isCurrentSource(generation, operationSrc)) return
            if (isAbortError(err)) return
            setNeedsGesture(true)
          },
        )
      } else {
        dispatchTheaterUserPlaybackState(true)
        // A deliberate pause — disarm the catch-up watch first so the
        // `onPause` this triggers is never misread as the platform vetoing
        // the automatic unmute.
        catchUpPendingRef.current = false
        video.pause()
        setPlaying(false)
      }
    }
    window.addEventListener('theater-toggle-play', handler)
    return () => window.removeEventListener('theater-toggle-play', handler)
  }, [ended, needsGesture, errored, unavailableReason])

  // Explicit pause/resume (mobile theater's pause button, TheaterMobileChrome)
  // — unlike `theater-toggle-play` above, these have a single fixed meaning
  // each rather than flipping on current state, so a stale re-tap can't
  // fight itself. Guarded the same way as the toggle handler; a resume while
  // `needsGesture` is the exact same "start from a dead stop" case the stage
  // overlay handles, so it routes through the same `handleStartTap`.
  useEffect(() => {
    const handlePause = () => {
      const video = videoRef.current
      if (!video || ended) return
      // A deliberate pause — see the identical note in the toggle handler
      // above.
      catchUpPendingRef.current = false
      video.pause()
      setPlaying(false)
    }
    const handleResume = () => {
      const video = videoRef.current
      if (!video) return
      // Covered = retained under text/photo, or Live waiting / Saved All Clear.
      // A tab-flip theater-resume must not restart that clip.
      if (covered) return
      if (errored || unavailableReason) return
      // Same ended-means-replay rule as the toggle handler above.
      if (ended) {
        handleReplay()
        return
      }
      if (needsGesture) {
        handleStartTap()
        return
      }
      const { generation, src: operationSrc } = captureSource()
      video.play().then(
        () => {
          if (!isCurrentSource(generation, operationSrc)) return
          setPlaying(true)
        },
        (err: unknown) => {
          if (!isCurrentSource(generation, operationSrc)) return
          if (isAbortError(err)) return
          setNeedsGesture(true)
        },
      )
    }
    window.addEventListener('theater-pause', handlePause)
    window.addEventListener('theater-resume', handleResume)
    return () => {
      window.removeEventListener('theater-pause', handlePause)
      window.removeEventListener('theater-resume', handleResume)
    }
  }, [ended, needsGesture, covered, errored, unavailableReason])

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

  const handleLifecycleStart = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget
    const { generation, src: operationSrc } = captureSource()
    if (!isCurrentSource(generation, operationSrc) || !elementMatchesSource(video, operationSrc)) {
      return
    }
    activeLifecycleRef.current = { generation, src: operationSrc }
  }

  const handleTimeUpdate = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget
    if (!isCurrentLifecycleEvent(video) || !video.duration) return
    const progress = video.currentTime / video.duration
    // The shared top-of-screen progress line
    // (TheaterProgressLine, kind 'video') has no access to this element, so
    // it subscribes to this event instead of reading the DOM directly.
    window.dispatchEvent(
      new CustomEvent('theater-video-progress', {
        detail: { progress, duration: video.duration },
      }),
    )
  }

  const handleEnded = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!isCurrentLifecycleEvent(event.currentTarget)) return
    // Some browsers fire `pause` immediately before `ended` as part of
    // reaching the end of the media — never a catch-up rejection.
    catchUpPendingRef.current = false
    setEnded(true)
    setPlaying(false)
    window.dispatchEvent(new CustomEvent('theater-video-progress', { detail: { progress: 1 } }))
    const finishEnded = () => {
      if (!repeat && albumCount > 1 && albumIndex < albumCount - 1 && onAlbumIndexChange) {
        onAlbumIndexChange(albumIndex + 1)
        return
      }
      onEnded?.()
    }
    if (covered) {
      deferredEndedRef.current = finishEnded
      return
    }
    finishEnded()
  }

  const showAlbum = !covered && albumCount > 1 && !!onAlbumIndexChange

  // A confirmed rejection of the automatic catch-up unmute (see
  // `handleVideoPlaying` below): the platform accepted playback continuing
  // but vetoed going unmuted without a gesture, signalled ONLY by an
  // unexpected `pause` while `catchUpPendingRef` is armed — never a timer
  // (the same evidence-only discipline as this file's `theater-pause`
  // handlers and StageYouTube's `fallBackToMuted`: a successful, silent
  // unmute produces no event at all, so silence can never mean rejection).
  // Drops back to muted and resumes, exactly like the mount effect's own
  // rejected-unmuted-continuation fallback above.
  const revertCatchUpUnmute = () => {
    logSV('catch-up unmute reverted (observed pause)')
    catchUpPendingRef.current = false
    const video = videoRef.current
    if (!video) return
    const { generation, src: operationSrc } = captureSource()
    video.muted = true
    setEffectiveMuted(true)
    video.play().then(
      () => {
        if (!isCurrentSource(generation, operationSrc)) return
        setPlaying(true)
      },
      (err: unknown) => {
        if (!isCurrentSource(generation, operationSrc)) return
        if (isAbortError(err)) return
        setNeedsGesture(true)
      },
    )
  }

  // The media element is the source of truth — a successful start (initial
  // play() or any later play() path) clears the gesture overlay.
  const handleVideoPlaying = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!isCurrentLifecycleEvent(event.currentTarget)) return
    setPlaying(true)
    setNeedsGesture(false)
    // A playing element is by definition not at its end — clears any stale
    // ended state left by a playback path that didn't reset it explicitly
    // (this is what let the legacy end overlay float over the NEXT item
    // after the waiting stage's "Start from the beginning", owner report).
    setEnded(false)
    // Instagram catch-up unmute (see `catchUpAttemptedRef`'s doc comment
    // above): only once playback is CONFIRMED — never before, that's
    // exactly the gesture-less-unmuted-autoplay rejection this whole file
    // works around — retry sound if the shell wants it but this fresh
    // element fell back to muted. An already-playing element can often go
    // unmuted without a fresh gesture even where starting unmuted from cold
    // couldn't.
    if (!muted && effectiveMuted && !catchUpAttemptedRef.current) {
      logSV('catch-up unmute attempt (confirmed playing, shell wants sound)')
      catchUpAttemptedRef.current = true
      catchUpPendingRef.current = true
      const video = videoRef.current
      if (video) video.muted = false
      setEffectiveMuted(false)
    }
  }

  const handleVideoPause = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget
    if (!isCurrentLifecycleEvent(video)) return
    logSV('pause event', {
      ended: video?.ended ?? false,
      catchUpPending: catchUpPendingRef.current,
    })
    // A pause synthesized by reaching the end fires just before `ended` —
    // `handleEnded` (and its own `catchUpPendingRef` clear) owns that
    // transition, never a rejection.
    if (catchUpPendingRef.current && !(video && video.ended)) {
      revertCatchUpUnmute()
      return
    }
    catchUpPendingRef.current = false
    setPlaying(false)
  }

  const handleReplay = () => {
    const video = videoRef.current
    if (!video) return
    const { generation, src: operationSrc } = captureSource()
    setEnded(false)
    setErrored(false)
    video.currentTime = 0
    video.play().then(
      () => {
        if (!isCurrentSource(generation, operationSrc)) return
        setPlaying(true)
      },
      (err: unknown) => {
        if (!isCurrentSource(generation, operationSrc)) return
        if (isAbortError(err)) return
        setNeedsGesture(true)
      },
    )
  }

  // A <video> error event carries no HTTP status, so it can't tell "this"
  // post is gone for good" (FxTwitter 410 — deleted/private/suspended,
  // src.ts routes it through /api/media/video) from a transient load
  // failure worth retrying. Follow up with a lightweight ranged fetch of
  // the same src: our video routes serve GET (no HEAD), so a 2-byte Range
  // request is the cheapest way to read the real status without pulling
  // the whole file. A 410 body carries `{ error: 'unavailable', reason }`;
  // anything else (including a non-410 error) leaves the generic
  // load-failure state with its retry button in place.
  const handleVideoError = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!isCurrentLifecycleEvent(event.currentTarget)) return
    const { generation, src: operationSrc } = captureSource()
    setErrored(true)
    fetch(operationSrc, { headers: { Range: 'bytes=0-1' } })
      .then((res) => {
        if (!isCurrentSource(generation, operationSrc)) return null
        return res.status === 410 ? res.json() : null
      })
      .then((body) => {
        if (!isCurrentSource(generation, operationSrc)) return
        if (body && typeof body.reason === 'string') {
          setUnavailableReason(body.reason)
        }
      })
      .catch(() => {
        // Probe failed — stay in the generic load-failure state.
      })
  }

  const handleStageTap = (_e?: React.MouseEvent) => {
    // A stage tap always gets a stopped clip moving, then hands chrome focus
    // to the shell. It never pauses a playing video — pause remains an
    // explicit transport action in the bottom bar / desktop dock.
    if (errored || unavailableReason) {
      dispatchTheaterStageTap()
      return
    }
    if (ended) {
      handleReplay()
      dispatchTheaterStageTap()
      return
    }
    if (needsGesture) {
      handleStartTap()
      dispatchTheaterStageTap()
      return
    }
    if (videoRef.current?.paused) handleStartTap()
    dispatchTheaterStageTap()
  }

  return (
    <div
      className="relative h-full w-full bg-[#08070a]"
      onClick={showAlbum ? undefined : handleStageTap}
    >
      <video
        ref={videoRef}
        poster={poster ?? undefined}
        // Declared here (not just set imperatively in the mute-sync effect
        // below) so the element is muted from the very first commit rather
        // than only after a passive effect runs — a fresh mount (every
        // Instagram item: StageInstagram swaps in a brand-new StageVideo the
        // moment its mirror probe succeeds) otherwise starts life unmuted by
        // the browser's own default, and iOS Safari's muted-autoplay
        // allowance is keyed to the element carrying `muted` from creation,
        // not to a same-tick-but-later JS assignment. React doesn't keep this
        // attribute reactive on updates (a known video/audio element quirk),
        // which is exactly why the mute-sync effect below still owns every
        // change after mount — this only fixes the initial value.
        muted={effectiveMuted}
        loop={repeat}
        playsInline
        onLoadStart={handleLifecycleStart}
        onPlaying={handleVideoPlaying}
        onPause={handleVideoPause}
        onLoadedMetadata={handleTimeUpdate}
        onDurationChange={handleTimeUpdate}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleVideoError}
        className="h-full w-full object-contain"
      />

      {/* Tap-to-play fallback (autoplay rejected even muted). */}
      {needsGesture && !ended && !errored && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
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
          been removed at the source. The viewer gets ~10s to read why, then the
          errored-advance effect above moves the queue on; it used to sit here
          forever waiting for manual navigation, which stalls a playlist just as
          badly as a failed load does. In collection (no `onEnded`) Delete is still
          the way past it. */}
      {errored && unavailableReason && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-[#08070a]/70 px-6 text-center">
          <p className="max-w-xs text-sm text-white/70">{unavailableReason}</p>
        </div>
      )}

      {/* Generic playback error fallback: poster stays visible, offer a retry. */}
      {errored && !unavailableReason && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#08070a]/70 text-center">
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
            <span>Try again</span>
          </button>
        </div>
      )}

      {showAlbum ? (
        <>
          <StageAlbumScroller
            overlay
            count={albumCount}
            index={albumIndex}
            onIndexChange={onAlbumIndexChange}
            onCenterTap={handleStageTap}
            label={`Videos, ${albumCount}`}
          >
            {Array.from({ length: albumCount }, (_, i) => {
              const slidePoster = albumPosters[i] || (i === albumIndex ? poster : null)
              return (
                <div key={i} className="h-full w-full min-w-full shrink-0 snap-center">
                  {i === albumIndex ? null : slidePoster ? (
                    <img
                      src={slidePoster}
                      alt=""
                      draggable={false}
                      referrerPolicy="no-referrer"
                      className="pointer-events-none h-full w-full object-contain"
                    />
                  ) : (
                    <div className="h-full w-full bg-[#08070a]" />
                  )}
                </div>
              )
            })}
          </StageAlbumScroller>
          <StageAlbumDots
            count={albumCount}
            index={albumIndex}
            noun="video"
            mediaRef={videoRef}
            revision={`${src}:${albumIndex}`}
            onNext={() => onAlbumIndexChange(nextAlbumIndex(albumIndex, albumCount))}
          />
        </>
      ) : null}

      {/* No internal progress bar: BOTH viewports now show the shared
          top-of-screen TheaterProgressLine, fed by the
          `theater-video-progress` events dispatched above. */}
      <span className="sr-only">{item.text || `${item.platform} video`}</span>
    </div>
  )
}
