'use client'

import { useEffect, useState } from 'react'

/**
 * Live viewport check matching Tailwind's `lg` breakpoint (1024px) — the JS
 * counterpart to the `lg:hidden`/`lg:flex` split between the mobile chrome
 * and the desktop rail. Needed because CSS `display: none` on the chrome's
 * wrapper only hides it VISUALLY — its effects (including the mobile
 * `TheaterProgressLine`'s 10s auto-advance timer) keep running underneath
 * regardless of viewport. Gating the chrome's `current` prop (and this hook's
 * own desktop-progress-line kind) on this flag is what keeps exactly one
 * 'timed' timer alive at a time; without it, a desktop viewer would get two
 * independent timers double-dispatching `theater-advance`. SSR-safe default
 * `false` (matches mobile) to avoid a hydration mismatch — the real value
 * settles a moment after mount.
 */
export function useIsDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    setIsDesktop(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isDesktop
}
