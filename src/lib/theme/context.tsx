'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

/**
 * Resolves the theme for the very first paint, before any user toggle.
 * Mirrors the inline FOUC script in src/app/layout.tsx exactly — keep the
 * two in lockstep; that script points back here.
 *
 * - An explicit stored value ('light' | 'dark') always wins, everywhere.
 * - No stored value: the theater route ('/') defaults to dark
 *   (theater-first.md §7); everywhere else follows the device.
 * - An explicit stored 'system' always follows the device, regardless of
 *   route — only an *unset* preference gets the theater-dark override.
 */
export function resolveInitialTheme(
  stored: Theme | null | undefined,
  pathname: string,
  prefersDark: boolean,
): 'light' | 'dark' {
  if (stored === 'light' || stored === 'dark') return stored
  if (!stored && pathname === '/') return 'dark'
  return prefersDark ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start from the same value the server rendered ('light') so the first client
  // render matches the SSR HTML — reading localStorage during render here would
  // diverge from the server and cause a hydration mismatch. The real value is
  // loaded right after mount; the blocking script in layout.tsx keeps the actual
  // page colours correct in the meantime (no FOUC).
  const [theme, setThemeState] = useState<Theme>('light')
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  // Loads the stored preference (or 'system' when unset) into state, and
  // applies the resolved initial theme to <html> in the same effect — both
  // together, in one commit. This resolution (including the theater-dark
  // override for an unset preference on '/') is computed once per full page
  // load, same as the FOUC script; it is not re-evaluated on client-side
  // navigation. Doing the state load and the DOM/resolvedTheme application
  // together (rather than as two effects keyed off `theme`) avoids a second
  // effect re-firing with plain system logic (no pathname) the moment this
  // effect updates `theme` — which would flash away the theater-dark result
  // right after mount. Explicit toggles go through setTheme below instead,
  // which applies its own DOM update directly and never touches this effect.
  useEffect(() => {
    let stored: Theme | null = null
    try {
      stored = localStorage.getItem('theme') as Theme | null
    } catch {
      stored = null
    }

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const resolved = resolveInitialTheme(stored, window.location.pathname, prefersDark)

    setThemeState(stored || 'system')
    setResolvedTheme(resolved)

    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolved)
  }, [])

  // Listen for system theme changes while `theme` is 'system' (whether that
  // came from an explicit toggle or an unset preference). On the theater
  // route with no stored preference, the resolved theme stays dark regardless
  // of the device theme (theater-first.md §7), so route through the same
  // resolveInitialTheme() used above instead of applying prefersDark blindly.
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      let stored: Theme | null = null
      try {
        stored = localStorage.getItem('theme') as Theme | null
      } catch {
        stored = null
      }
      const next = resolveInitialTheme(stored, window.location.pathname, mediaQuery.matches)
      setResolvedTheme(next)
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(next)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    try {
      localStorage.setItem('theme', newTheme)
    } catch {
      // Safari private mode (and similar) throws on localStorage writes —
      // the in-memory state still updates, it just won't persist.
    }

    // Explicit user action — apply immediately and directly, rather than via
    // an effect keyed on `theme`, so this can never race with the mount
    // effect's initial (possibly theater-dark) resolution above.
    const effectiveTheme: 'light' | 'dark' =
      newTheme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : newTheme
    setResolvedTheme(effectiveTheme)
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(effectiveTheme)
  }, [])

  // Memoize the context value so consumers only re-render when theme/
  // resolvedTheme actually change, not on every provider render (setTheme is
  // itself stable via useCallback, so it can't be what invalidates this).
  const value = useMemo(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
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
