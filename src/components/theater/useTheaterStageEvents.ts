'use client'

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

/** User tapped the video or photo — chrome toggles overlays, does not pause. */
export const THEATER_STAGE_TAP = 'theater-stage-tap'

export function dispatchTheaterStageTap() {
  window.dispatchEvent(new CustomEvent(THEATER_STAGE_TAP))
}

/**
 * Stage tap = Instagram-style chrome toggle: first tap hides overlays and
 * starts playback; second tap only restores overlays. Pause stays on the
 * peek-bar / dock button (and Space).
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
 * and mobile peek bar both mirror those events for pause/audio buttons.
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
