'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Radio, X } from 'lucide-react'
import { momentPlayHref } from '../theater/queue'

/**
 * "Kitchen synths is live · Tune in": when a forming group you rang the bell
 * on goes live, a toast on whatever page you're on (members only, mounted by
 * AppShell), plus a browser notification if you allowed them when you pressed
 * the bell. Asks `GET /api/moments/alerts` every minute (and when the tab
 * comes back); an alert is marked seen once it's dismissed, tuned in to or
 * has shown for a while, so a phone doesn't ring for it again.
 */

export interface MomentAlert {
  id: string
  slug: string
  title: string
  at: string
}

const POLL_MS = 60_000
const SHOW_MS = 15_000

export function alertLine(alert: Pick<MomentAlert, 'title'>): string {
  return `${alert.title} is live`
}

async function markSeen(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  try {
    await fetch('/api/moments/alerts/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
  } catch {
    // It shows again next time; nothing lost.
  }
}

function notify(alert: MomentAlert): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const n = new Notification(alertLine(alert), { body: 'Tune in', tag: `adhx-alert-${alert.id}` })
    n.onclick = () => {
      window.focus()
      window.location.assign(momentPlayHref(alert.slug))
    }
  } catch {
    // Notifications can throw (no service worker on some phones): the toast still shows.
  }
}

export function MomentAlerts() {
  const [shown, setShown] = useState<MomentAlert | null>(null)
  const known = useRef(new Set<string>())
  const queue = useRef<MomentAlert[]>([])

  const next = useCallback(() => {
    setShown(queue.current.shift() ?? null)
  }, [])

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/moments/alerts', { cache: 'no-store' })
      if (!res.ok) return
      const body = (await res.json()) as { alerts?: MomentAlert[] }
      const fresh = (body.alerts ?? []).filter((a) => !known.current.has(a.id)).reverse()
      if (fresh.length === 0) return
      for (const a of fresh) {
        known.current.add(a.id)
        notify(a)
      }
      queue.current.push(...fresh)
      setShown((current) => current ?? queue.current.shift() ?? null)
    } catch {
      // Offline or signed out: try again next minute.
    }
  }, [])

  useEffect(() => {
    void poll()
    const timer = window.setInterval(() => void poll(), POLL_MS)
    const onVisible = () => {
      if (!document.hidden) void poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [poll])

  const done = useCallback(
    (alert: MomentAlert) => {
      void markSeen([alert.id])
      next()
    },
    [next],
  )

  useEffect(() => {
    if (!shown) return
    const t = window.setTimeout(() => done(shown), SHOW_MS)
    return () => window.clearTimeout(t)
  }, [shown, done])

  if (!shown) return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[84px] z-[80] flex justify-center px-4 md:bottom-6"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full border border-white/10 bg-nx-sheet/[0.97] py-2 pl-3 pr-2 font-nx-sans text-nx-ink shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-md animate-nx-slide-in">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nx-live/20 text-nx-live"
        >
          <Radio className="h-4 w-4" strokeWidth={2.4} />
        </span>
        <span className="min-w-0 truncate text-sm font-bold">{alertLine(shown)}</span>
        <Link
          href={momentPlayHref(shown.slug)}
          onClick={() => done(shown)}
          className="flex h-9 shrink-0 items-center rounded-full bg-nx-accent px-4 text-sm font-extrabold text-black"
        >
          Tune in
        </Link>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => done(shown)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-nx-ink/70 hover:bg-white/10"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
