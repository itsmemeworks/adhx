'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  readStoredSoundPreference,
  THEATER_SOUND_DEFAULT_STORAGE_KEY,
  THEATER_SOUND_SESSION_STORAGE_KEY,
  writeStoredSoundPreference,
} from '@/lib/theater/sound-preference'
import { THEATER_STAGE_TAP } from './useTheaterStageEvents'

export function resolveInitialTheaterSound(
  sessionSoundOn: boolean | null,
  localDefaultSoundOn: boolean | null,
  soundOnByDefault: boolean,
): boolean {
  return sessionSoundOn ?? localDefaultSoundOn ?? soundOnByDefault
}

/**
 * Account preference sets the default for a fresh browser session. A sound
 * choice made in the current tab wins until that tab closes.
 */
export function useTheaterSoundPreference({
  soundOnByDefault,
  ready,
}: {
  soundOnByDefault: boolean
  ready: boolean
}): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [muted, setMutedState] = useState(true)
  const mutedRef = useRef(true)
  const initializedRef = useRef(false)
  const initializedFromLocalRef = useRef(false)

  const setMuted = useCallback<Dispatch<SetStateAction<boolean>>>((update) => {
    const next = typeof update === 'function' ? update(mutedRef.current) : update
    mutedRef.current = next
    initializedRef.current = true
    initializedFromLocalRef.current = false
    writeStoredSoundPreference(sessionStorage, THEATER_SOUND_SESSION_STORAGE_KEY, !next)
    setMutedState(next)
  }, [])

  useEffect(() => {
    if (initializedRef.current) {
      if (ready && initializedFromLocalRef.current) {
        const accountMuted = !soundOnByDefault
        initializedFromLocalRef.current = false
        mutedRef.current = accountMuted
        setMutedState(accountMuted)
      }
      return
    }

    const sessionSoundOn = readStoredSoundPreference(
      sessionStorage,
      THEATER_SOUND_SESSION_STORAGE_KEY,
    )
    const localDefaultSoundOn = readStoredSoundPreference(
      localStorage,
      THEATER_SOUND_DEFAULT_STORAGE_KEY,
    )
    if (sessionSoundOn === null && localDefaultSoundOn === null && !ready) return

    const initialSoundOn = resolveInitialTheaterSound(
      sessionSoundOn,
      localDefaultSoundOn,
      soundOnByDefault,
    )
    initializedRef.current = true
    initializedFromLocalRef.current =
      !ready && sessionSoundOn === null && localDefaultSoundOn !== null
    mutedRef.current = !initialSoundOn
    setMutedState(!initialSoundOn)
  }, [ready, soundOnByDefault])

  // A fresh mobile document may reject audible autoplay. Retry the preferred
  // unmute inside the next stage-tap gesture. A manual mute sets `muted` true,
  // so normal taps never override the viewer's current-session choice.
  useEffect(() => {
    if (muted) return
    const retryPreferredSound = () => {
      window.dispatchEvent(new CustomEvent('theater-set-muted', { detail: { muted: false } }))
    }
    window.addEventListener(THEATER_STAGE_TAP, retryPreferredSound)
    return () => window.removeEventListener(THEATER_STAGE_TAP, retryPreferredSound)
  }, [muted])

  return [muted, setMuted]
}
