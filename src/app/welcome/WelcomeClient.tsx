'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'

// Always dark, like the theater / SignInModal — this is a brand-new
// account's very first screen, before any theme preference has loaded.
const INK = '#f3ece0'
const MUTED = '#857a69'
const SUBTLE = '#b8ac99'
const PANEL = '#201b16'
const BORDER = '#322b23'
const INPUT_BG = '#2a241d'
const ACCENT_GRADIENT = 'linear-gradient(135deg,#e88a5e,#d26b40)'
const STAGE_BG = '#08070a'
const GOOD = '#7fbf8f'
const BAD = '#e08a6a'

/**
 * Client-side mirror of `sanitizeUsername()` (src/lib/auth/account.ts) so
 * the live preview/availability check never disagrees with what the server
 * will actually store.
 */
function sanitizeClientSide(raw: string): string {
  const stripped = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '')
  return stripped.replace(/^[-_]+/, '').slice(0, 15)
}

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'error'

export interface WelcomeClientProps {
  suggestedUsername: string
  returnTo: string
}

export function WelcomeClient({ suggestedUsername, returnTo }: WelcomeClientProps) {
  const [value, setValue] = useState(suggestedUsername)
  const [availability, setAvailability] = useState<Availability>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<number | null>(null)

  const sanitized = sanitizeClientSide(value)

  useEffect(() => {
    if (sanitized.length < 3) {
      setAvailability('idle')
      return
    }
    setAvailability('checking')
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/username?check=${encodeURIComponent(sanitized)}`)
        if (!res.ok) {
          setAvailability('error')
          return
        }
        const data = await res.json()
        setAvailability(data.available ? 'available' : 'taken')
      } catch {
        setAvailability('error')
      }
    }, 350)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
    // Deliberately keyed on `sanitized` alone — the debounce timer must not
    // reset on unrelated re-renders. (This repo's eslint config doesn't load
    // react-hooks, so no disable pragma: an unknown-rule pragma is itself a
    // lint error here.)
  }, [sanitized])

  async function claim(username: string) {
    setError(null)
    const candidate = sanitizeClientSide(username)
    if (candidate.length < 3) {
      setError('Username must be at least 3 characters.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: candidate }),
      })
      if (res.ok || res.status === 403) {
        // 403 (already_chosen) means a concurrent request already spent the
        // claim — either way there's nothing left to do here.
        window.location.assign(returnTo)
        return
      }
      const data = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setError('That username is already taken.')
      } else {
        setError(data.error || 'Something went wrong — try again.')
      }
    } catch {
      setError('Something went wrong — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    claim(value)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: STAGE_BG }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose your username"
        className="w-full max-w-[420px] rounded-2xl border p-7 shadow-2xl"
        style={{ backgroundColor: PANEL, borderColor: BORDER }}
      >
        <div className="mb-6 flex items-center gap-2">
          <img src="/adhx-cloud.png" alt="" aria-hidden style={{ height: 26 }} className="w-auto" />
          <span className="font-indie-flower leading-none" style={{ fontSize: 22, color: INK }}>
            ADHX
          </span>
        </div>

        <h1 className="font-serif text-2xl leading-tight" style={{ color: INK }}>
          Choose your username
        </h1>
        <p className="mt-2 text-[13.5px] leading-snug" style={{ color: MUTED }}>
          This is your public handle on shared collections — adhx.com/t/{sanitized || 'username'}.
          You can only set it once.
        </p>

        <form onSubmit={handleSubmit} className="mt-6">
          <div
            className="flex h-12 items-center rounded-full pl-4 pr-2"
            style={{ backgroundColor: INPUT_BG }}
          >
            <span className="whitespace-nowrap font-mono text-[13px]" style={{ color: SUBTLE }}>
              adhx.com/t/
            </span>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label="Username"
              maxLength={15}
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
              style={{ color: INK }}
            />
          </div>

          <div className="mt-2 min-h-[18px] text-[12.5px]">
            {availability === 'checking' && <span style={{ color: SUBTLE }}>Checking…</span>}
            {availability === 'available' && <span style={{ color: GOOD }}>Available</span>}
            {availability === 'taken' && <span style={{ color: BAD }}>Taken — try another</span>}
            {availability === 'error' && (
              <span style={{ color: SUBTLE }}>Couldn&rsquo;t check availability</span>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || availability === 'taken' || sanitized.length < 3}
            className="mt-3 h-12 w-full rounded-full text-[14.5px] font-semibold text-white transition-transform hover:scale-[1.01] disabled:opacity-60"
            style={{ background: ACCENT_GRADIENT }}
          >
            {submitting ? 'Claiming…' : `Claim @${sanitized || '...'}`}
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => claim(suggestedUsername)}
            className="mt-3 w-full text-center text-[13px] underline underline-offset-2 disabled:opacity-60"
            style={{ color: SUBTLE }}
          >
            Keep @{suggestedUsername}
          </button>

          {error && (
            <p className="mt-2 text-[13px]" style={{ color: BAD }}>
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
