'use client'

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

/** User tapped the video or photo — chrome toggles overlays, does not pause. */
export const THEATER_STAGE_TAP = 'theater-stage-tap'
export const THEATER_SEEK = 'theater-seek'
export const THEATER_USER_PLAYBACK_STATE = 'theater-user-playback-state'

export interface TheaterSeekDetail {
  progress: number
}

export function dispatchTheaterStageTap() {
  window.dispatchEvent(new CustomEvent(THEATER_STAGE_TAP))
}

/** Seek the active video or timed dwell to a normalized 0..1 position. */
export function dispatchTheaterSeek(progress: number) {
  window.dispatchEvent(
    new CustomEvent<TheaterSeekDetail>(THEATER_SEEK, {
      detail: { progress: Math.min(1, Math.max(0, progress)) },
    }),
  )
}

/** Synchronous user intent, used to beat late ended/dwell events. */
export function dispatchTheaterUserPlaybackState(paused: boolean) {
  window.dispatchEvent(new CustomEvent(THEATER_USER_PLAYBACK_STATE, { detail: { paused } }))
}

/**
 * Stage tap = Instagram-style chrome toggle: first tap hides overlays and
 * starts playback; second tap only restores overlays. Pause stays on the
 * bottom-bar / dock button (and Space).
 */
export function useTheaterStageTapDeclutter(
  declutter: boolean,
  setDeclutter: Dispatch<SetStateAction<boolean>>,
) {
  const declutterRef = useRef(declutter)
  declutterRef.current = declutter

  useEffect(() => {
    const onTap = () => {
      if (declutterRef.current) {
        setDeclutter(false)
        return
      }
      setDeclutter(true)
      window.dispatchEvent(new CustomEvent('theater-resume'))
    }
    window.addEventListener(THEATER_STAGE_TAP, onTap)
    return () => window.removeEventListener(THEATER_STAGE_TAP, onTap)
  }, [setDeclutter])
}

/**
 * StageVideo / StageYouTube broadcast playing + mute on window. Desktop dock
 * and mobile bottom bar both mirror those events for pause/audio buttons.
 */
export function useTheaterStageEvents() {
  const [videoPlaying, setVideoPlaying] = useState(true)
  const [timedPaused, setTimedPaused] = useState(false)
  const [liveMuted, setLiveMuted] = useState<boolean | null>(null)

  useEffect(() => {
    const handlePlaying = (e: Event) => {
      const detail = (e as CustomEvent<{ playing: boolean }>).detail
      if (detail) setVideoPlaying(detail.playing)
    }
    const handleMuted = (e: Event) => {
      const detail = (e as CustomEvent<{ muted: boolean }>).detail
      if (detail) setLiveMuted(detail.muted)
    }
    const handleResume = () => setTimedPaused(false)
    const handlePause = () => setTimedPaused(true)
    window.addEventListener('theater-playing-state', handlePlaying)
    window.addEventListener('theater-muted-state', handleMuted)
    window.addEventListener('theater-resume', handleResume)
    window.addEventListener('theater-pause', handlePause)
    return () => {
      window.removeEventListener('theater-playing-state', handlePlaying)
      window.removeEventListener('theater-muted-state', handleMuted)
      window.removeEventListener('theater-resume', handleResume)
      window.removeEventListener('theater-pause', handlePause)
    }
  }, [])

  return { videoPlaying, setVideoPlaying, timedPaused, setTimedPaused, liveMuted, setLiveMuted }
}
