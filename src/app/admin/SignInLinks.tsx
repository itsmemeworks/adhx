'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HeldLink {
  tokenHash: string
  email: string
  url: string
  intent: string
  createdAt: string
  expiresAt: number
}

const REFRESH_MS = 10_000

function minutesLeft(expiresAt: number): string {
  const mins = Math.max(0, Math.round((expiresAt - Date.now()) / 60_000))
  return mins <= 1 ? 'about a minute left' : `${mins} minutes left`
}

/**
 * EMAIL_LINKS_TO_ADMIN: with no email service, sign-in links wait here for
 * whoever runs ADHX to pass on (by message, in person …). Hidden otherwise.
 */
export function SignInLinks() {
  const [mode, setMode] = useState<string | null>(null)
  const [links, setLinks] = useState<HeldLink[]>([])
  const [copied, setCopied] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/sign-in-links')
      if (!res.ok) return
      const data = await res.json()
      setMode(data.delivery)
      setLinks(Array.isArray(data.links) ? data.links : [])
    } catch {
      // Try again on the next refresh.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), REFRESH_MS)
    return () => window.clearInterval(t)
  }, [load])

  async function copy(link: HeldLink) {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(link.tokenHash)
      window.setTimeout(() => setCopied((c) => (c === link.tokenHash ? null : c)), 2000)
    } catch {
      // The link is selectable below.
    }
  }

  async function remove(link: HeldLink) {
    await fetch('/api/admin/sign-in-links', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenHash: link.tokenHash }),
    }).catch(() => {})
    void load()
  }

  // Arriving from the account menu's "sign-in links waiting": the card only
  // exists once loaded, after the browser has tried to jump to it.
  const section = useRef<HTMLElement>(null)
  const jumped = useRef(false)
  useEffect(() => {
    if (mode !== 'admin' || jumped.current) return
    jumped.current = true
    if (window.location.hash === '#sign-in-links') {
      section.current?.scrollIntoView({ block: 'start' })
    }
  }, [mode])

  if (mode !== 'admin') return null
  return (
    <section
      ref={section}
      id="sign-in-links"
      aria-labelledby="admin-sign-in-links"
      className="bg-surface rounded-card border border-hairline shadow-m-sm p-5 scroll-mt-24"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 id="admin-sign-in-links" className="font-serif font-semibold text-base text-ink">
            Sign-in links
          </h2>
          <p className="text-[13px] text-ink-3">
            This ADHX doesn’t send email. When someone asks to sign in, their link shows up here for
            you to pass on. Each one works once, for 15 minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] bg-clay/10 text-clay text-[13px] font-semibold"
        >
          <RefreshCw aria-hidden className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          <span>Refresh</span>
        </button>
      </div>
      {links.length === 0 ? (
        <p className="rounded-[12px] bg-inset px-4 py-3 text-[13px] text-ink-3">
          Nobody is waiting for a link.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {links.map((link) => (
            <li
              key={link.tokenHash}
              className="flex flex-col gap-2 rounded-[12px] bg-inset px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                  {link.email}
                </span>
                <span className="text-[12px] text-ink-3">
                  {`${link.intent === 'change' ? 'Confirming a new email · ' : ''}${minutesLeft(link.expiresAt)}`}
                </span>
              </div>
              <code className="block select-all break-all rounded-lg bg-surface px-2.5 py-2 font-mono text-[12px] text-ink-2">
                {link.url}
              </code>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void copy(link)}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] bg-clay text-white text-[13px] font-semibold"
                >
                  {copied === link.tokenHash ? (
                    <Check aria-hidden className="h-3.5 w-3.5" />
                  ) : (
                    <Copy aria-hidden className="h-3.5 w-3.5" />
                  )}
                  <span>{copied === link.tokenHash ? 'Copied' : 'Copy link'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void remove(link)}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-hairline text-[13px] font-semibold text-ink-2"
                >
                  <X aria-hidden className="h-3.5 w-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
