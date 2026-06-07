'use client'

import { Moon, Sun } from 'lucide-react'
import { useThemeOptional } from '@/lib/theme/context'
import { cn } from '@/lib/utils'

/**
 * Light/dark toggle for the public + preview surfaces (the authed header has
 * its own inline version). Flips between an explicit 'light'/'dark' — which the
 * provider persists to localStorage — so the choice sticks. Until the user
 * clicks, the provider follows the device ('system').
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useThemeOptional()
  // Rendered outside a provider (isolated test / SSR fallback) — render nothing.
  if (!theme) return null
  const { resolvedTheme, setTheme } = theme
  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'inline-flex items-center justify-center rounded-full p-2 text-ink-2 hover:text-ink hover:bg-inset transition-colors',
        className,
      )}
    >
      {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  )
}
