'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { AvatarSource } from '@/lib/avatar/generated-avatar'
import {
  readStoredSoundPreference,
  THEATER_SOUND_CHOICE_STORAGE_KEY,
  THEATER_SOUND_DEFAULT_STORAGE_KEY,
  writeStoredSoundPreference,
} from '@/lib/theater/sound-preference'

export type BodyFont = 'ibm-plex' | 'inter' | 'lexend' | 'atkinson'
export type { AvatarSource }

export const FONT_OPTIONS: Record<BodyFont, { name: string; description: string }> = {
  'ibm-plex': {
    name: 'IBM Plex Sans',
    description: 'Clean and professional - the default choice',
  },
  lexend: {
    name: 'Lexend',
    description: 'Designed specifically for ADHD and reading difficulties',
  },
  atkinson: {
    name: 'Atkinson Hyperlegible',
    description: 'Maximum legibility - great letter differentiation',
  },
  inter: {
    name: 'Inter',
    description: 'Neutral and familiar with excellent screen rendering',
  },
}

interface Preferences {
  bionicReading: boolean
  bodyFont: BodyFont
  avatarSource: AvatarSource
  soundOn: boolean
}

interface PreferencesContextType {
  preferences: Preferences
  updatePreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => Promise<void>
  loading: boolean
}

const defaultPreferences: Preferences = {
  bionicReading: false,
  bodyFont: 'ibm-plex',
  avatarSource: 'x',
  soundOn: false,
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences)
  const [loading, setLoading] = useState(true)

  // Fetch preferences on mount (only if authenticated)
  useEffect(() => {
    async function fetchPreferences() {
      const localSoundOn = readStoredSoundPreference(
        localStorage,
        THEATER_SOUND_DEFAULT_STORAGE_KEY,
      )
      try {
        // Check auth status first to avoid 401 on landing page. /api/auth/me
        // (not the X-only /api/auth/twitter/status) so email-only accounts
        // fetch their preferences too instead of being treated as signed out.
        const authResponse = await fetch('/api/auth/me')
        const authData = await authResponse.json()

        if (!authData.authenticated) {
          if (localSoundOn !== null) {
            setPreferences((current) => ({ ...current, soundOn: localSoundOn }))
          }
          setLoading(false)
          return
        }

        const response = await fetch('/api/preferences')
        if (response.ok) {
          const data = await response.json()
          const soundOn = data.soundOn === 'true'
          writeStoredSoundPreference(localStorage, THEATER_SOUND_DEFAULT_STORAGE_KEY, soundOn)
          setPreferences({
            bionicReading: data.bionicReading === 'true',
            bodyFont: (data.bodyFont as BodyFont) || 'ibm-plex',
            avatarSource: data.avatarSource === 'generated' ? 'generated' : 'x',
            soundOn,
          })
        } else if (localSoundOn !== null) {
          setPreferences((current) => ({ ...current, soundOn: localSoundOn }))
        }
      } catch (error) {
        console.error('Failed to fetch preferences:', error)
        if (localSoundOn !== null) {
          setPreferences((current) => ({ ...current, soundOn: localSoundOn }))
        }
      } finally {
        setLoading(false)
      }
    }

    fetchPreferences()
  }, [])

  const updatePreference = useCallback(
    async <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      // Store previous value for revert
      const previousValue = preferences[key]
      const isSoundUpdate = key === 'soundOn' && typeof value === 'boolean'
      const soundOnValue = isSoundUpdate ? (value as boolean) : null

      // Optimistic update
      setPreferences((prev) => ({ ...prev, [key]: value }))
      if (soundOnValue !== null) {
        // Publish the interaction immediately so open Theaters follow it.
        // Never write this choice again after the network round-trip: a
        // player action in another tab may be newer by then.
        writeStoredSoundPreference(localStorage, THEATER_SOUND_CHOICE_STORAGE_KEY, soundOnValue)
      }

      try {
        const response = await fetch('/api/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: String(value) }),
        })

        if (!response.ok) {
          throw new Error('Failed to update preference')
        }
        if (soundOnValue !== null) {
          writeStoredSoundPreference(localStorage, THEATER_SOUND_DEFAULT_STORAGE_KEY, soundOnValue)
        }
      } catch (error) {
        console.error('Failed to update preference:', error)
        // Revert the account setting, but retain the browser's explicit
        // choice. Rolling that shared value back can overwrite a newer player
        // action (including an off → on ABA sequence) from another tab.
        setPreferences((prev) => ({ ...prev, [key]: previousValue }))
      }
    },
    [preferences],
  )

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreference, loading }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider')
  }
  return context
}

export function usePreferencesOptional() {
  return useContext(PreferencesContext)
}
