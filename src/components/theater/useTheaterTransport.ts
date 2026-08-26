'use client'

import { useEffect } from 'react'
import { formatQueueCount, type QueueCount } from './theater-math'
import { logAV } from './YtDebugOverlay'
import { useTheaterStageEvents } from './useTheaterStageEvents'
import type { ProgressKind } from './TheaterProgressLine'

/**
 * Shared mute / pause / queue-count copy for the desktop dock and mobile peek.
 * Desktop and mobile used to copy the same handlers.
 */
export function useTheaterTransport(opts: {
  currentKey: string | null
  kind: ProgressKind
  muted: boolean
  onSetMuted: (muted: boolean) => void
  queue: QueueCount
  audioOnlyOnVideo?: boolean
}) {
  const { videoPlaying, timedPaused, setTimedPaused, liveMuted, setLiveMuted } =
    useTheaterStageEvents()

  useEffect(() => {
    setTimedPaused(false)
    setLiveMuted(null)
  }, [opts.currentKey, setTimedPaused, setLiveMuted])

  const paused = opts.kind === 'video' ? !videoPlaying : timedPaused
  const displayMuted = liveMuted ?? opts.muted
  const soundPulse = opts.kind === 'video' && displayMuted && videoPlaying
  const queueCount = formatQueueCount(opts.queue)

  const handleAudioTap = () => {
    if (opts.audioOnlyOnVideo && opts.kind !== 'video') return
    const next = !displayMuted
    logAV(
      `audio tap: displayed=${displayMuted ? 'muted' : 'unmuted'} -> requesting ${next ? 'muted' : 'unmuted'}`,
    )
    window.dispatchEvent(new CustomEvent('theater-set-muted', { detail: { muted: next } }))
    opts.onSetMuted(next)
  }

  const handleTogglePause = () => {
    if (opts.kind === 'video') {
      window.dispatchEvent(new CustomEvent(videoPlaying ? 'theater-pause' : 'theater-resume'))
      return
    }
    if (opts.kind === 'timed') {
      const next = !timedPaused
      setTimedPaused(next)
      window.dispatchEvent(new CustomEvent(next ? 'theater-pause' : 'theater-resume'))
    }
  }

  return {
    videoPlaying,
    paused,
    displayMuted,
    soundPulse,
    queueCount,
    handleAudioTap,
    handleTogglePause,
  }
}
