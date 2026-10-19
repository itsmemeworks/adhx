'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PIP_QUERY,
  PIP_STATE,
  PIP_TOGGLE,
  NO_PICTURE_IN_PICTURE,
  type PictureInPictureState,
} from '@/components/theater/useVideoPictureInPicture'
import {
  dispatchTheaterSeek,
  dispatchTheaterUserPlaybackState,
  THEATER_STAGE_TAP,
} from '@/components/theater/useTheaterStageEvents'

/**
 * The next_ui theater's view of the shared stage. The stage (reused from the
 * current theater: one persistent <video>, the Instagram probe) owns the
 * media; this hook only listens to what it announces and
 * sends commands as synchronous window events, so browser user activation
 * survives the click (iOS unmute and picture-in-picture need that).
 */
export interface VideoState {
  playing: boolean
  /** null until the stage reports its real state. */
  muted: boolean | null
  progress: number
  duration: number
  pip: PictureInPictureState
}

export function useVideoState(currentKey: string): VideoState {
  const [state, setState] = useState<VideoState>({
    playing: false,
    muted: null,
    progress: 0,
    duration: 0,
    pip: NO_PICTURE_IN_PICTURE,
  })

  useEffect(() => {
    setState((s) => ({ ...s, progress: 0, duration: 0 }))
  }, [currentKey])

  useEffect(() => {
    const onPlaying = (e: Event) =>
      setState((s) => ({
        ...s,
        playing: !!(e as CustomEvent<{ playing?: boolean }>).detail?.playing,
      }))
    const onMuted = (e: Event) =>
      setState((s) => ({ ...s, muted: !!(e as CustomEvent<{ muted?: boolean }>).detail?.muted }))
    const onProgress = (e: Event) => {
      const d = (e as CustomEvent<{ progress?: number; duration?: number }>).detail
      setState((s) => ({
        ...s,
        progress: typeof d?.progress === 'number' ? d.progress : s.progress,
        duration: typeof d?.duration === 'number' && d.duration > 0 ? d.duration : s.duration,
      }))
    }
    const onPip = (e: Event) =>
      setState((s) => ({
        ...s,
        pip: (e as CustomEvent<PictureInPictureState>).detail ?? NO_PICTURE_IN_PICTURE,
      }))
    window.addEventListener('theater-playing-state', onPlaying)
    window.addEventListener('theater-muted-state', onMuted)
    window.addEventListener('theater-video-progress', onProgress)
    window.addEventListener(PIP_STATE, onPip)
    window.dispatchEvent(new CustomEvent(PIP_QUERY))
    return () => {
      window.removeEventListener('theater-playing-state', onPlaying)
      window.removeEventListener('theater-muted-state', onMuted)
      window.removeEventListener('theater-video-progress', onProgress)
      window.removeEventListener(PIP_STATE, onPip)
    }
  }, [])

  return state
}

export const stage = {
  pause() {
    dispatchTheaterUserPlaybackState(true)
    window.dispatchEvent(new CustomEvent('theater-pause', { detail: { source: 'transport' } }))
  },
  resume() {
    dispatchTheaterUserPlaybackState(false)
    window.dispatchEvent(new CustomEvent('theater-resume', { detail: { source: 'transport' } }))
  },
  setMuted(muted: boolean) {
    window.dispatchEvent(new CustomEvent('theater-set-muted', { detail: { muted } }))
  },
  setVolume(volume: number) {
    window.dispatchEvent(new CustomEvent('theater-set-volume', { detail: { volume } }))
  },
  seek(progress: number) {
    dispatchTheaterSeek(progress)
  },
  togglePip() {
    window.dispatchEvent(new CustomEvent(PIP_TOGGLE))
  },
}

/** Calls `onTap` when the stage is tapped (the stage itself only ever starts a stopped clip). */
export function useStageTap(onTap: () => void) {
  const ref = useRef(onTap)
  ref.current = onTap
  useEffect(() => {
    const handler = () => ref.current()
    window.addEventListener(THEATER_STAGE_TAP, handler)
    return () => window.removeEventListener(THEATER_STAGE_TAP, handler)
  }, [])
}

/**
 * Timer for posts without a player (photos, text, articles): 0→1 over
 * `seconds`, pausable, restartable, calling `onDone` once at the end.
 */
export function useDwell({
  active,
  seconds,
  paused,
  resetKey,
  onDone,
}: {
  active: boolean
  seconds: number
  paused: boolean
  resetKey: string
  onDone: () => void
}): { progress: number; seek: (progress: number) => void } {
  const [progress, setProgress] = useState(0)
  const elapsedRef = useRef(0)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    elapsedRef.current = 0
    setProgress(0)
  }, [resetKey])

  useEffect(() => {
    if (!active || paused) return
    let last = performance.now()
    let fired = false
    const timer = window.setInterval(() => {
      const now = performance.now()
      elapsedRef.current += (now - last) / 1000
      last = now
      const p = Math.min(1, elapsedRef.current / seconds)
      setProgress(p)
      if (p >= 1 && !fired) {
        fired = true
        window.clearInterval(timer)
        doneRef.current()
      }
    }, 100)
    return () => window.clearInterval(timer)
  }, [active, paused, seconds, resetKey])

  const seek = useCallback(
    (p: number) => {
      elapsedRef.current = Math.min(1, Math.max(0, p)) * seconds
      setProgress(elapsedRef.current / seconds)
    },
    [seconds],
  )
  return { progress, seek }
}
