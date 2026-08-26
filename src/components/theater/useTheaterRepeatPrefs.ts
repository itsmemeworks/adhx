'use client'

import { useCallback, useEffect, useState } from 'react'
import { LIVE_REPEAT_STORAGE_KEY, SAVED_REPEAT_STORAGE_KEY, type RepeatMode } from './types'

/**
 * Live and Saved keep independent repeat prefs. Live defaults to stop-
 * when-caught-up. Saved defaults to looping. Playlist is wrapOnly all⇄one
 * and is not persisted.
 */
export function useTheaterRepeatPrefs(opts: { loop: boolean; isCollectionTab: boolean }) {
  const [liveRepeatMode, setLiveRepeatMode] = useState<RepeatMode>('off')
  const [savedRepeatMode, setSavedRepeatMode] = useState<RepeatMode>('all')
  const [playlistRepeatMode, setPlaylistRepeatMode] = useState<RepeatMode>('all')
  const [repeatPrefsReady, setRepeatPrefsReady] = useState(false)

  const effectiveRepeatMode: RepeatMode = opts.loop
    ? playlistRepeatMode
    : opts.isCollectionTab
      ? savedRepeatMode
      : liveRepeatMode

  const setRepeatMode = useCallback(
    (next: RepeatMode) => {
      if (opts.loop) setPlaylistRepeatMode(next)
      else if (opts.isCollectionTab) setSavedRepeatMode(next)
      else setLiveRepeatMode(next)
    },
    [opts.loop, opts.isCollectionTab],
  )

  useEffect(() => {
    if (opts.loop) {
      setRepeatPrefsReady(true)
      return
    }
    try {
      if (localStorage.getItem(LIVE_REPEAT_STORAGE_KEY) === 'all') setLiveRepeatMode('all')
      const saved = localStorage.getItem(SAVED_REPEAT_STORAGE_KEY)
      if (saved === 'off') setSavedRepeatMode('off')
      else if (saved === 'all') setSavedRepeatMode('all')
    } catch {
      // Storage unavailable — keep defaults (Live off, Saved all).
    }
    setRepeatPrefsReady(true)
  }, [opts.loop])

  useEffect(() => {
    if (!repeatPrefsReady || opts.loop || opts.isCollectionTab || liveRepeatMode === 'one') return
    try {
      localStorage.setItem(LIVE_REPEAT_STORAGE_KEY, liveRepeatMode)
    } catch {
      // Never let a storage failure break playback.
    }
  }, [repeatPrefsReady, opts.loop, opts.isCollectionTab, liveRepeatMode])

  useEffect(() => {
    if (!repeatPrefsReady || opts.loop || !opts.isCollectionTab || savedRepeatMode === 'one') return
    try {
      localStorage.setItem(SAVED_REPEAT_STORAGE_KEY, savedRepeatMode)
    } catch {
      // Never let a storage failure break playback.
    }
  }, [repeatPrefsReady, opts.loop, opts.isCollectionTab, savedRepeatMode])

  return {
    liveRepeatMode,
    savedRepeatMode,
    playlistRepeatMode,
    repeatPrefsReady,
    effectiveRepeatMode,
    setRepeatMode,
    setSavedRepeatMode,
  }
}
