'use client'

/**
 * <video> stage for twitter/tiktok MP4s (spec §6): poster-first, muted
 * autoplay, thin progress bar, "Tap for sound" chip, replay + next nudge on
 * end. Falls back to a big centered play button when autoplay is rejected
 * (iOS low-power mode blocks even muted autoplay — spec §11).
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

  // New item: reset per-video state. The <video> itself remounts (key={src})
  // and starts via its `autoPlay` attribute — deliberately NOT via a manual
  // play() here: a play() issued while the new source is still loading gets
  // aborted by the load ("interrupted by a new load request") and would
  // flag a spurious needs-gesture overlay over a video that is in fact
  // playing. Real autoplay rejection is detected in onCanPlay below.
  useEffect(() => {
    setProgress(0)
    setEnded(false)
    setNeedsGesture(false)
    setErrored(false)
    setPlaying(false)
  }, [src])

  // Genuine autoplay rejection (e.g. iOS low-power mode blocks even muted
  // autoplay — spec §11): once the video CAN play but still hasn't, one
  // explicit attempt tells us whether a gesture is required.
  const handleCanPlay = () => {
    const video = videoRef.current
    if (!video || !video.paused || ended) return
    video.play().then(
      () => setPlaying(true),
      () => setNeedsGesture(true),
    )
  }

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

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video || !video.duration) return
    setProgress(video.currentTime / video.duration)
  }

  const handleEnded = () => {
    setEnded(true)
    setPlaying(false)
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

  const handleStageTap = () => {
    if (needsGesture) {
      handleStartTap()
      return
    }
    if (muted) {
      onRequestUnmute()
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
        key={src}
        src={src}
        poster={poster ?? undefined}
        playsInline
        autoPlay
        muted={muted}
        onCanPlay={handleCanPlay}
        onPlaying={() => {
          // The media element is the source of truth — a successful start
          // (autoplay or any play() path) clears the gesture overlay.
          setPlaying(true)
          setNeedsGesture(false)
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={() => setErrored(true)}
        className="h-full w-full object-contain"
      />

      {/* Persistent unmute chip while muted (before the first gesture). */}
      {muted && !needsGesture && !ended && !errored && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRequestUnmute()
          }}
          className="absolute bottom-6 left-4 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-black/55 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-md"
        >
          <VolumeX size={16} />
          Tap for sound
        </button>
      )}
      {!muted && playing && (
        <div className="pointer-events-none absolute bottom-6 left-4 inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm">
          <Volume2 size={14} />
        </div>
      )}

      {/* Tap-to-play fallback (autoplay rejected). */}
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

      {/* Thin progress bar along the bottom. */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
        <div
          className="h-full bg-clay transition-[width] duration-150 ease-linear"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>

      <span className="sr-only">{item.text || `${item.platform} video`}</span>
    </div>
  )
}
