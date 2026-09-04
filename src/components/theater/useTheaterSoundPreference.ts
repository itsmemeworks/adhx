'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  readStoredSoundPreference,
  removeStoredSoundPreference,
  THEATER_SOUND_CHOICE_STORAGE_KEY,
  THEATER_SOUND_DEFAULT_STORAGE_KEY,
  writeStoredSoundPreference,
} from '@/lib/theater/sound-preference'
import { THEATER_STAGE_TAP } from './useTheaterStageEvents'

export function resolveInitialTheaterSound(
  explicitSoundOn: boolean | null,
  localDefaultSoundOn: boolean | null,
  soundOnByDefault: boolean,
): boolean {
  return explicitSoundOn ?? localDefaultSoundOn ?? soundOnByDefault
}

/**
 * Account preference supplies the fallback. The viewer's latest Theater
 * choice wins across links, reloads, and same-origin tabs.
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
  const initializedFromCachedDefaultRef = useRef(false)

  const applyGesturelessChoice = useCallback((nextMuted: boolean) => {
    const changed = mutedRef.current !== nextMuted
    mutedRef.current = nextMuted
    setMutedState(nextMuted)
    if (!changed) return

    // Persisted/account/cross-tab state has no user activation. Stages may
    // attempt sound immediately, but must preserve their autoplay fallback.
    window.dispatchEvent(
      new CustomEvent('theater-set-muted', {
        detail: { muted: nextMuted, source: 'catchup' },
      }),
    )
  }, [])

  const setMuted = useCallback<Dispatch<SetStateAction<boolean>>>((update) => {
    const next = typeof update === 'function' ? update(mutedRef.current) : update
    mutedRef.current = next
    initializedRef.current = true
    initializedFromCachedDefaultRef.current = false
    writeStoredSoundPreference(localStorage, THEATER_SOUND_CHOICE_STORAGE_KEY, !next)
    if (readStoredSoundPreference(localStorage, THEATER_SOUND_CHOICE_STORAGE_KEY) === !next) {
      // Migrate away from the former per-tab storage only after the durable
      // browser-wide write is readable.
      removeStoredSoundPreference(sessionStorage, THEATER_SOUND_CHOICE_STORAGE_KEY)
    } else {
      // If localStorage is unavailable, retain the old same-tab behavior.
      writeStoredSoundPreference(sessionStorage, THEATER_SOUND_CHOICE_STORAGE_KEY, !next)
    }
    setMutedState(next)
  }, [])

  useEffect(() => {
    if (initializedRef.current) {
      if (ready && initializedFromCachedDefaultRef.current) {
        const accountMuted = !soundOnByDefault
        initializedFromCachedDefaultRef.current = false
        applyGesturelessChoice(accountMuted)
      }
      return
    }

    const localChoiceSoundOn = readStoredSoundPreference(
      localStorage,
      THEATER_SOUND_CHOICE_STORAGE_KEY,
    )
    const legacySessionSoundOn = readStoredSoundPreference(
      sessionStorage,
      THEATER_SOUND_CHOICE_STORAGE_KEY,
    )
    const explicitSoundOn = localChoiceSoundOn ?? legacySessionSoundOn
    const localDefaultSoundOn = readStoredSoundPreference(
      localStorage,
      THEATER_SOUND_DEFAULT_STORAGE_KEY,
    )
    if (explicitSoundOn === null && localDefaultSoundOn === null && !ready) return

    if (localChoiceSoundOn === null && legacySessionSoundOn !== null) {
      writeStoredSoundPreference(
        localStorage,
        THEATER_SOUND_CHOICE_STORAGE_KEY,
        legacySessionSoundOn,
      )
      if (
        readStoredSoundPreference(localStorage, THEATER_SOUND_CHOICE_STORAGE_KEY) ===
        legacySessionSoundOn
      ) {
        removeStoredSoundPreference(sessionStorage, THEATER_SOUND_CHOICE_STORAGE_KEY)
      }
    }

    const initialSoundOn = resolveInitialTheaterSound(
      explicitSoundOn,
      localDefaultSoundOn,
      soundOnByDefault,
    )
    initializedRef.current = true
    initializedFromCachedDefaultRef.current =
      !ready && explicitSoundOn === null && localDefaultSoundOn !== null
    applyGesturelessChoice(!initialSoundOn)
  }, [applyGesturelessChoice, ready, soundOnByDefault])

  useEffect(() => {
    const syncSoundChoice = (event: StorageEvent) => {
      try {
        if (event.storageArea && event.storageArea !== localStorage) return
      } catch {
        return
      }
      if (event.key !== THEATER_SOUND_CHOICE_STORAGE_KEY) return
      // Events are queued per document. Read the current authoritative value
      // instead of trusting a possibly stale event.newValue after near-
      // simultaneous choices in two tabs.
      let soundOn = readStoredSoundPreference(localStorage, THEATER_SOUND_CHOICE_STORAGE_KEY)
      if (soundOn === null) {
        let currentRaw: string | null
        try {
          currentRaw = localStorage.getItem(THEATER_SOUND_CHOICE_STORAGE_KEY)
        } catch {
          return
        }
        if (currentRaw !== null) return
        soundOn =
          readStoredSoundPreference(localStorage, THEATER_SOUND_DEFAULT_STORAGE_KEY) ??
          soundOnByDefault
      }

      const nextMuted = !soundOn
      initializedRef.current = true
      initializedFromCachedDefaultRef.current = false
      applyGesturelessChoice(nextMuted)
    }

    window.addEventListener('storage', syncSoundChoice)
    return () => window.removeEventListener('storage', syncSoundChoice)
  }, [applyGesturelessChoice, soundOnByDefault])

  // A fresh mobile document may reject audible autoplay. Retry the preferred
  // unmute inside the next stage-tap gesture. A manual mute sets `muted` true,
  // so normal taps never override the viewer's stored choice.
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
