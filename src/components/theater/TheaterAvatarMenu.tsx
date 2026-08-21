'use client'

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { usePathname } from 'next/navigation'
import { Bookmark, LogIn, LogOut, Menu, Radio, Settings, Trophy } from 'lucide-react'
import { useAuthMe } from '@/components/auth'
import { cn } from '@/lib/utils'

// The theater is ALWAYS dark regardless of the site's light/dark theme, so
// the dropdown panel uses a hardcoded palette rather than the Matter theme
// tokens — same precedent as SignInModal.tsx.
const PANEL = '#201b16'
const BORDER = '#322b23'
const INK = '#f3ece0'
const MUTED = '#857a69'
const SUBTLE = '#b8ac99'

// Keys the theater's window-level keydown handler acts on. Stop them from
// bubbling past the open menu so ↓/↑/space/m don't drive the background
// stage. Escape is handled separately (it closes the menu instead).
const THEATER_SHORTCUT_KEYS = new Set([
  ' ',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'm',
  'M',
  'j',
  'J',
  'k',
  'K',
])

export interface TheaterAvatarMenuProps {
  className?: string
  /**
   * Opens the theater's shared sign-in modal (the "save-post" intent — the
   * same one the Save CTAs trigger) from the signed-out burger's "Sign in"
   * entry. Only read when `allowSignedOut` is set and the visitor isn't
   * authenticated.
   */
  onRequestSignIn?: () => void
  /**
   * Renders a burger-menu fallback (Theater / Leaderboard / Sign in) for
   * signed-out visitors in this exact slot, instead of this component's
   * default "render nothing" behavior — one menu implementation covering
   * both auth states rather than a second component. Callers opt in per
   * mode: the home theater and shared preview pages pass this (signed-out
   * visitors there had no navigation at all); triage is always reached
   * authed, and collection mode already has its own "Make your own"
   * signed-out conversion CTA, so neither passes it.
   */
  allowSignedOut?: boolean
}

/**
 * Avatar button + dropdown for the theater chrome. Signed in: the account
 * menu (collection/settings/sign out). Signed out with `allowSignedOut`: a
 * burger menu (Theater/Leaderboard/Sign in) in the same slot, so new mobile
 * visitors have SOME way to reach the public surfaces. Signed out without
 * `allowSignedOut` (or while auth is still loading): renders nothing.
 */
export function TheaterAvatarMenu({
  className,
  onRequestSignIn,
  allowSignedOut = false,
}: TheaterAvatarMenuProps) {
  const { me, loading } = useAuthMe()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    if (!open) return

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDownCapture(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        setOpen(false)
        return
      }
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (THEATER_SHORTCUT_KEYS.has(e.key)) {
        e.stopPropagation()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDownCapture, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDownCapture, true)
    }
  }, [open])

  if (loading) return null

  if (!me?.authenticated || !me.user) {
    if (!allowSignedOut) return null

    // Already on the home theater: closing the menu is enough — a real
    // navigation to `/` would restart the stage the visitor is already
    // watching. From anywhere else (a shared preview page), it's a real link.
    const isHome = pathname === '/'

    return (
      <div
        ref={containerRef}
        className={cn('relative', className)}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Menu"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
        >
          <Menu size={18} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border shadow-2xl"
            style={{ backgroundColor: PANEL, borderColor: BORDER }}
          >
            {isHome ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-white/[.06]"
                style={{ color: SUBTLE }}
              >
                <Radio size={15} />
                Theater
              </button>
            ) : (
              <a
                href="/"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors hover:bg-white/[.06]"
                style={{ color: SUBTLE }}
              >
                <Radio size={15} />
                Theater
              </a>
            )}
            <a
              href="/leaderboard"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors hover:bg-white/[.06]"
              style={{ color: SUBTLE }}
            >
              <Trophy size={15} />
              Leaderboard
            </a>
            <div className="my-1 h-px" style={{ backgroundColor: BORDER }} />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onRequestSignIn?.()
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-white/[.06]"
              style={{ color: SUBTLE }}
            >
              <LogIn size={15} />
              Sign in
            </button>
          </div>
        )}
      </div>
    )
  }

  const { user, identities } = me
  const initial = (user.displayName || user.username || '?').trim().charAt(0).toUpperCase() || '?'
  const identityLabel = identities?.x
    ? `@${identities.x.username}`
    : identities?.email?.email || `@${user.username}`
  const identitySubtitle = identities?.x
    ? 'Connected'
    : identities?.email
      ? 'Signed in with email'
      : null

  async function handleSignOut(e: ReactMouseEvent) {
    e.stopPropagation()
    setOpen(false)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      window.location.href = '/'
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full border border-white/25 bg-white/10 text-[13px] font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border shadow-2xl"
          style={{ backgroundColor: PANEL, borderColor: BORDER }}
        >
          <div
            className="flex items-center gap-3 border-b px-4 py-3"
            style={{ borderColor: BORDER }}
          >
            <div
              className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full text-[13px] font-semibold text-white"
              style={{ backgroundColor: BORDER }}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                initial
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold" style={{ color: INK }}>
                {identityLabel}
              </p>
              {identitySubtitle && (
                <p className="text-[11.5px]" style={{ color: MUTED }}>
                  {identitySubtitle}
                </p>
              )}
            </div>
          </div>

          <a
            href="/"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors hover:bg-white/[.06]"
            style={{ color: SUBTLE }}
          >
            <Bookmark size={15} />
            Your collection
          </a>
          <a
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors hover:bg-white/[.06]"
            style={{ color: SUBTLE }}
          >
            <Settings size={15} />
            Settings
          </a>
          <div className="my-1 h-px" style={{ backgroundColor: BORDER }} />
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-white/[.06]"
            style={{ color: SUBTLE }}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
