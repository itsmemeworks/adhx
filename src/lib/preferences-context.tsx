'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export type BodyFont = 'ibm-plex' | 'inter' | 'lexend' | 'atkinson'

export const FONT_OPTIONS: Record<BodyFont, { name: string; description: string }> = {
  'inter': {
    name: 'Inter',
    description: 'Neutral and familiar - the default choice',
  },
  'lexend': {
    name: 'Lexend',
    description: 'Designed specifically for ADHD and reading difficulties',
  },
  'atkinson': {
    name: 'Atkinson Hyperlegible',
    description: 'Maximum legibility - great letter differentiation',
  },
  'ibm-plex': {
    name: 'IBM Plex Sans',
    description: 'Clean and professional with excellent screen rendering',
  },
}

interface Preferences {
  bionicReading: boolean
  bodyFont: BodyFont
}

interface PreferencesContextType {
  preferences: Preferences
  updatePreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => Promise<void>
  loading: boolean
}

const defaultPreferences: Preferences = {
  bionicReading: false,
  bodyFont: 'inter',
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences)
  const [loading, setLoading] = useState(true)

  // Fetch preferences on mount (only if authenticated)
  useEffect(() => {
    async function fetchPreferences() {
      try {
        // Check auth status first to avoid 401 on landing page
        const authResponse = await fetch('/api/auth/twitter/status')
        const authData = await authResponse.json()

        if (!authData.authenticated) {
          setLoading(false)
          return
        }

        const response = await fetch('/api/preferences')
        if (response.ok) {
          const data = await response.json()
          setPreferences({
            bionicReading: data.bionicReading === 'true',
            bodyFont: (data.bodyFont as BodyFont) || 'ibm-plex',
          })
        }
      } catch (error) {
        console.error('Failed to fetch preferences:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchPreferences()
  }, [])

  const updatePreference = useCallback(async <K extends keyof Preferences>(
    key: K,
    value: Preferences[K]
  ) => {
    // Store previous value for revert
    const previousValue = preferences[key]

    // Optimistic update
    setPreferences((prev) => ({ ...prev, [key]: value }))

    try {
      const response = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: String(value) }),
      })

      if (!response.ok) {
        throw new Error('Failed to update preference')
      }
    } catch (error) {
      console.error('Failed to update preference:', error)
      // Revert on error
      setPreferences((prev) => ({ ...prev, [key]: previousValue }))
    }
  }, [preferences])

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
