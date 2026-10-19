'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { KeyRound, LogOut, RefreshCw, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NxAvatar } from './primitives'

interface Me {
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  xConnected: boolean
  /** This ADHX can connect X. */
  xAvailable: boolean
  isAdmin: boolean
  /** Admins, with no email: sign-in links waiting to be passed on. */
  waitingSignIns: number
}

/** Where an admin passes sign-in links on. */
export const SIGN_IN_LINKS_HREF = '/admin#sign-in-links'

/** How often an admin's menu looks for new sign-in links waiting. */
const WAITING_POLL_MS = 30_000

function waitingLabel(n: number): string {
  return n === 1 ? '1 sign-in link waiting' : `${n} sign-in links waiting`
}

/** Where "Sync" goes: Settings' X card, which connects X if needed, then syncs. */
export const SYNC_HREF = '/settings?sync=1'

/**
 * Your avatar in the header, opening Sync X bookmarks, Settings and Sign out.
 * For an admin with friends waiting for a sign-in link, a count on the avatar
 * and a way to the links. Signed out, a Sign in button instead.
 */
export function AccountMenu({
  className,
  avatarOnPhones = true,
}: {
  className?: string
  /** False where phones have no room for the avatar (the theater); Sign in still shows. */
  avatarOnPhones?: boolean
}) {
  const [me, setMe] = useState<Me | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const isAdmin = !!me?.isAdmin
  const [tick, setTick] = useState(0)
  // An admin's menu looks again now and then, so a friend waiting for a link
  // shows up without a reload.
  useEffect(() => {
    if (!isAdmin) return
    const t = window.setInterval(() => setTick((n) => n + 1), WAITING_POLL_MS)
    return () => window.clearInterval(t)
  }, [isAdmin])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/auth/me', { signal: controller.signal, credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            authenticated?: boolean
            xConnected?: boolean
            xAvailable?: boolean
            isAdmin?: boolean
            waitingSignIns?: number
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
            xAvailable: data.xAvailable !== false,
            isAdmin: !!data.isAdmin,
            waitingSignIns: data.waitingSignIns ?? 0,
          })
        },
      )
      .catch(() => {})
    return () => controller.abort()
  }, [tick])

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
    <div
      ref={root}
      className={cn('relative shrink-0', !avatarOnPhones && 'hidden md:block', className)}
    >
      <button
        type="button"
        aria-label={
          me.waitingSignIns > 0
            ? `Your account, ${waitingLabel(me.waitingSignIns)}`
            : 'Your account'
        }
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="group relative flex h-10 w-10 items-center justify-center rounded-[38%]"
      >
        <NxAvatar
          author={{ avatarUrl: me.avatarUrl, handle, name: me.displayName ?? handle }}
          size={36}
          className="ring-1 ring-white/15 ring-offset-2 ring-offset-transparent group-hover:ring-white/40"
        />
        {me.waitingSignIns > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-nx-accent px-1 text-[11px] font-extrabold leading-none text-black ring-2 ring-black"
          >
            {me.waitingSignIns > 9 ? '9+' : String(me.waitingSignIns)}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Your account"
          className="absolute right-0 top-12 z-50 flex w-[240px] flex-col gap-0.5 rounded-2xl bg-[#1c1b19] p-1.5 font-nx-sans text-sm text-white shadow-nx-toast"
        >
          <span className="truncate px-3 pb-1.5 pt-2 text-xs text-white/55">{`@${handle}`}</span>
          {me.waitingSignIns > 0 && (
            <Link
              role="menuitem"
              href={SIGN_IN_LINKS_HREF}
              className={cn(ROW, 'font-bold text-nx-accent')}
              onClick={() => setOpen(false)}
            >
              <KeyRound aria-hidden className="h-4 w-4" />
              <span>{waitingLabel(me.waitingSignIns)}</span>
            </Link>
          )}
          {(me.xConnected || me.xAvailable) && (
            <Link role="menuitem" href={SYNC_HREF} className={ROW} onClick={() => setOpen(false)}>
              <RefreshCw aria-hidden className="h-4 w-4" />
              <span>{me.xConnected ? 'Sync X bookmarks' : 'Connect X'}</span>
            </Link>
          )}
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
