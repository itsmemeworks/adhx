'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start from the same value the server rendered ('light') so the first client
  // render matches the SSR HTML — reading localStorage during render here would
  // diverge from the server and cause a hydration mismatch. The real value is
  // loaded right after mount; the blocking script in layout.tsx keeps the actual
  // page colours correct in the meantime (no FOUC).
  const [theme, setThemeState] = useState<Theme>('light')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    // No stored preference → follow the device ('system'); the blocking script
    // in layout.tsx already painted the matching colours, so this just keeps
    // React in sync. Once the user toggles, their explicit choice is persisted.
    const stored = (localStorage.getItem('theme') as Theme) || 'system'
    setThemeState(stored)
  }, [])

  useEffect(() => {
    const root = window.document.documentElement

    // Determine the actual theme to apply
    let effectiveTheme: 'light' | 'dark'

    if (theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    } else {
      effectiveTheme = theme
    }

    setResolvedTheme(effectiveTheme)

    // Apply theme
    root.classList.remove('light', 'dark')
    root.classList.add(effectiveTheme)
  }, [theme])

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      setResolvedTheme(mediaQuery.matches ? 'dark' : 'light')
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(mediaQuery.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem('theme', newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

/**
 * Non-throwing variant for leaf components (e.g. ThemeToggle) that can render
 * outside a provider — isolated component tests, SSR fallbacks. Returns
 * undefined instead of throwing so those renders don't crash.
 */
export function useThemeOptional() {
  return useContext(ThemeContext)
}
