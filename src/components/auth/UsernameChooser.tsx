'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { sanitizeUsername } from '@/lib/auth/username-rules'

// Colors for the `dark` theme — matches the /welcome full-bleed modal (always
// dark, like the theater / SignInModal, since it's a brand-new account's very
// first screen before any theme preference has loaded).
const INK = '#f3ece0'
const SUBTLE = '#b8ac99'
const INPUT_BG = '#2a241d'
const ACCENT_GRADIENT = 'linear-gradient(135deg,#e88a5e,#d26b40)'
const GOOD = '#7fbf8f'
const BAD = '#e08a6a'

export type UsernameAvailability = 'idle' | 'checking' | 'available' | 'taken' | 'error'

export interface UsernameClaimSuccess {
  username: string
  changesRemaining: number
}

export interface UsernameChooserProps {
  /** Prefilled value — the suggested username at /welcome, or the caller's current username in Settings. */
  suggestedUsername: string
  /** Called after a successful claim/change with the new username + how many changes remain. */
  onSuccess: (result: UsernameClaimSuccess) => void
  /** Visual language: 'dark' matches the /welcome full-bleed modal; 'matter' matches Settings cards. Default 'matter'. */
  theme?: 'dark' | 'matter'
  /** Show the "Keep @suggested" shortcut button below the submit button. Default true. */
  showKeepSuggestion?: boolean
  autoFocus?: boolean
  /** Fired whenever the live-sanitized preview of the input changes, so a caller can mirror it in surrounding copy. */
  onSanitizedChange?: (sanitized: string) => void
  /** Settings uses Save; /welcome uses Claim @handle. Default 'claim'. */
  submitLabel?: 'claim' | 'save'
  onCancel?: () => void
}

/**
 * Shared username claim/change form — input with a live availability check,
 * submit to `POST /api/auth/username`, and success/error handling. Used by
 * both `/welcome` (first-claim prompt, `theme="dark"`) and the Settings
 * Username card (subsequent changes, `theme="matter"`).
 */
export function UsernameChooser({
  suggestedUsername,
  onSuccess,
  theme = 'matter',
  showKeepSuggestion = true,
  autoFocus = false,
  onSanitizedChange,
  submitLabel = 'claim',
  onCancel,
}: UsernameChooserProps) {
  const [value, setValue] = useState(suggestedUsername)
  const [availability, setAvailability] = useState<UsernameAvailability>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<number | null>(null)

  const sanitized = sanitizeUsername(value)

  useEffect(() => {
    onSanitizedChange?.(sanitized)
    // Deliberately keyed on `sanitized` alone — see the debounce effect
    // below for why (and this repo's eslint config has no react-hooks
    // plugin loaded, so no disable pragma).
  }, [sanitized, onSanitizedChange])

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
    const candidate = sanitizeUsername(username)
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
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        onSuccess({ username: data.username ?? candidate, changesRemaining: data.changesRemaining })
        return
      }
      if (data.error === 'taken') {
        setError('That username is already taken.')
      } else if (data.error === 'change_limit_reached') {
        setError("You've used up your username changes.")
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

  const disabled = submitting || availability === 'taken' || sanitized.length < 3

  if (theme === 'dark') {
    return (
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
            autoFocus={autoFocus}
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
          disabled={disabled}
          className="mt-3 h-12 w-full rounded-full text-[14.5px] font-semibold text-white transition-transform hover:scale-[1.01] disabled:opacity-60"
          style={{ background: ACCENT_GRADIENT }}
        >
          {submitting ? 'Claiming…' : `Claim @${sanitized || '...'}`}
        </button>

        {showKeepSuggestion && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => claim(suggestedUsername)}
            className="mt-3 w-full text-center text-[13px] underline underline-offset-2 disabled:opacity-60"
            style={{ color: SUBTLE }}
          >
            Keep @{suggestedUsername}
          </button>
        )}

        {error && (
          <p className="mt-2 text-[13px]" style={{ color: BAD }}>
            {error}
          </p>
        )}
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-11 min-w-0 flex-1 items-center rounded-[10px] border border-hairline bg-inset pl-3.5 pr-2">
          <span className="whitespace-nowrap font-mono text-[13px] text-ink-3">adhx.com/t/</span>
          <input
            type="text"
            autoFocus={autoFocus}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Username"
            maxLength={15}
            className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none focus:ring-0 sm:text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex min-h-[44px] flex-none items-center whitespace-nowrap rounded-[10px] bg-clay-grad px-3.5 py-2 text-[13px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
        >
          {submitting
            ? 'Saving…'
            : submitLabel === 'save'
              ? 'Save'
              : `Claim @${sanitized || '...'}`}
        </button>
        {showKeepSuggestion && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => claim(suggestedUsername)}
            className="flex-none text-[13px] text-ink-3 underline underline-offset-2 disabled:opacity-60"
          >
            Keep @{suggestedUsername}
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-none text-[13px] text-ink-3 transition-colors hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="min-h-[18px] text-[12.5px]">
        {availability === 'checking' && <span className="text-ink-3">Checking…</span>}
        {availability === 'available' && <span className="text-green-700">Available</span>}
        {availability === 'taken' && <span className="text-red-600">Taken — try another</span>}
        {availability === 'error' && (
          <span className="text-ink-3">Couldn&rsquo;t check availability</span>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  )
}
