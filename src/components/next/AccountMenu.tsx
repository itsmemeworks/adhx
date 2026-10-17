'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { LogOut, RefreshCw, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NxAvatar } from './primitives'

interface Me {
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  xConnected: boolean
}

/** Where "Sync" goes: Settings' X card, which connects X if needed, then syncs. */
export const SYNC_HREF = '/settings?sync=1'

/**
 * Your avatar in the header, opening Sync X bookmarks, Settings and Sign out.
 * Signed out, a Sign in button instead.
 */
export function AccountMenu({ className }: { className?: string }) {
  const [me, setMe] = useState<Me | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/auth/me', { signal: controller.signal, credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            authenticated?: boolean
            xConnected?: boolean
            user?: { username?: string; displayName?: string; avatarUrl?: string }
          } | null,
        ) => {
          if (!data?.authenticated) {
            setSignedOut(!!data)
            return
          }
          setMe({
            username: data.user?.username ?? null,
            displayName: data.user?.displayName ?? null,
            avatarUrl: data.user?.avatarUrl ?? null,
            xConnected: !!data.xConnected,
          })
        },
      )
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  if (!me) {
    if (!signedOut) return null
    // Signed out: a way in that brings you back to where you are.
    return (
      <a
        href={`/start?${new URLSearchParams({ returnTo: `${window.location.pathname}${window.location.search}` })}`}
        className={cn(
          'flex h-10 shrink-0 items-center rounded-full bg-nx-cream px-4 text-sm font-extrabold text-black',
          className,
        )}
      >
        Sign in
      </a>
    )
  }
  const handle = me.username ?? 'you'

  return (
    <div ref={root} className={cn('relative shrink-0', className)}>
      <button
        type="button"
        aria-label="Your account"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full ring-1 ring-white/15 hover:ring-white/40"
      >
        <NxAvatar
          author={{ avatarUrl: me.avatarUrl, handle, name: me.displayName ?? handle }}
          size={36}
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Your account"
          className="absolute right-0 top-12 z-50 flex w-[240px] flex-col gap-0.5 rounded-2xl bg-[#1c1b19] p-1.5 font-nx-sans text-sm text-white shadow-nx-toast"
        >
          <span className="truncate px-3 pb-1.5 pt-2 text-xs text-white/55">{`@${handle}`}</span>
          <Link role="menuitem" href={SYNC_HREF} className={ROW} onClick={() => setOpen(false)}>
            <RefreshCw aria-hidden className="h-4 w-4" />
            <span>{me.xConnected ? 'Sync X bookmarks' : 'Connect X'}</span>
          </Link>
          <Link role="menuitem" href="/settings" className={ROW} onClick={() => setOpen(false)}>
            <Settings aria-hidden className="h-4 w-4" />
            <span>Settings</span>
          </Link>
          <button
            type="button"
            role="menuitem"
            className={ROW}
            onClick={() => {
              void fetch('/api/auth/logout', { method: 'POST' }).finally(() =>
                window.location.assign('/'),
              )
            }}
          >
            <LogOut aria-hidden className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  )
}

const ROW =
  'flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left hover:bg-white/10 focus-visible:bg-white/10'
