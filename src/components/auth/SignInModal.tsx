'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { isValidEmail } from '@/lib/utils/email'
import { Mail } from 'lucide-react'
import { THEATER_SHORTCUT_KEYS } from '@/components/theater/theater-shortcuts'

export interface SignInModalProps {
  open: boolean
  onClose: () => void
  /** Default: "Sign in to ADHX" */
  title?: string
  /** e.g. "12 posts from claude-code, curated by @weedauwl — keep them in your collection." */
  subtitle?: string
  /** Path to land on after auth. Default: current location.pathname. */
  returnTo?: string
}

// This surface is ALWAYS dark, like the theater — regardless of the site's
// light/dark theme setting — so colors are hardcoded rather than pulled from
// the Matter theme tokens (which flip with the `light`/`dark` class).
const INK = '#f3ece0'
const MUTED = '#857a69'
const SUBTLE = '#b8ac99'
const PANEL = '#201b16'
const BORDER = '#322b23'
const INPUT_BG = '#2a241d'
const ACCENT_GRADIENT = 'linear-gradient(135deg,#e88a5e,#d26b40)'

type Stage = 'form' | 'success'

export function SignInModal({
  open,
  onClose,
  title = 'Sign in to ADHX',
  subtitle,
  returnTo,
}: SignInModalProps) {
  const [email, setEmail] = useState('')
  const [stage, setStage] = useState<Stage>('form')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)

  // Reset transient state whenever the modal is (re)opened.
  useEffect(() => {
    if (!open) return
    setStage('form')
    setError(null)
    setSubmitting(false)
    const focusTimer = window.setTimeout(() => emailInputRef.current?.focus(), 0)
    return () => window.clearTimeout(focusTimer)
  }, [open])

  // Capture-phase keydown: Escape always closes; theater/global shortcut
  // keys are stopped from propagating further (unless the target is a text
  // field, where typing must work normally and the theater already ignores
  // those keys anyway).
  useEffect(() => {
    if (!open) return
    function handleKeyDownCapture(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        onClose()
        return
      }
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (THEATER_SHORTCUT_KEYS.has(e.key)) {
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', handleKeyDownCapture, true)
    return () => window.removeEventListener('keydown', handleKeyDownCapture, true)
  }, [open, onClose])

  if (!open) return null

  const effectiveReturnTo =
    returnTo || (typeof window !== 'undefined' ? window.location.pathname : '/')

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = email.trim()
    if (!trimmed || !isValidEmail(trimmed)) {
      setError('Enter a valid email address.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, returnTo: effectiveReturnTo }),
      })
      if (res.ok) {
        setEmail(trimmed)
        setStage('success')
      } else {
        const data = await res.json().catch(() => ({}))
        if (res.status === 429) {
          setError(data.error || 'Too many attempts — try again in a few minutes.')
        } else if (res.status === 503) {
          setError(data.error || 'Email sign-in is temporarily unavailable — try again shortly.')
        } else {
          setError(data.error || 'Something went wrong — try again.')
        }
      }
    } catch {
      setError('Something went wrong — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(8,7,10,.72)', backdropFilter: 'blur(8px)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[420px] rounded-2xl border p-7 shadow-2xl"
        style={{ backgroundColor: PANEL, borderColor: BORDER }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Brand row */}
        <div className="mb-6 flex items-center gap-2">
          <Image
            src="/adhx-cloud.png"
            alt=""
            aria-hidden
            width={23}
            height={26}
            style={{ height: 26, width: 'auto' }}
          />
          <span className="font-indie-flower leading-none" style={{ fontSize: 22, color: INK }}>
            ADHX
          </span>
        </div>

        {stage === 'form' ? (
          <>
            <h2 className="font-serif text-2xl leading-tight" style={{ color: INK }}>
              {title}
            </h2>
            {subtitle && (
              <p className="mt-2 text-[13.5px] leading-snug" style={{ color: MUTED }}>
                {subtitle}
              </p>
            )}

            <form onSubmit={handleEmailSubmit} noValidate className="mt-6">
              <div className="relative flex items-center">
                <Mail
                  className="pointer-events-none absolute left-4"
                  style={{ width: 16, height: 16, color: SUBTLE }}
                />
                <input
                  ref={emailInputRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email address"
                  className="h-12 w-full rounded-full pl-11 pr-4 text-base outline-none focus:ring-2"
                  style={
                    {
                      backgroundColor: INPUT_BG,
                      color: INK,
                      '--tw-ring-color': 'rgba(232,138,94,0.4)',
                    } as React.CSSProperties
                  }
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-3 h-12 w-full rounded-full text-[14.5px] font-semibold text-white transition-transform hover:scale-[1.01] disabled:opacity-60"
                style={{ background: ACCENT_GRADIENT }}
              >
                {submitting ? 'Sending…' : 'Email me a magic link'}
              </button>

              {error && (
                <p className="mt-2 text-[13px]" style={{ color: '#e08a6a' }}>
                  {error}
                </p>
              )}
            </form>

            <p className="mt-5 text-[12px] leading-snug" style={{ color: SUBTLE }}>
              One-tap sign-in link, no password. New here? This creates your account. Link X later
              in Settings if you want to sync bookmarks.
            </p>
          </>
        ) : (
          <div className="text-center">
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: INPUT_BG }}
            >
              <Mail style={{ width: 20, height: 20, color: SUBTLE }} />
            </div>
            <h2 className="font-serif text-2xl leading-tight" style={{ color: INK }}>
              Check your inbox
            </h2>
            <p className="mt-2 text-[13.5px] leading-snug" style={{ color: MUTED }}>
              We sent a sign-in link to {email}. It expires in 15 minutes.
            </p>
            <button
              type="button"
              onClick={() => {
                setStage('form')
                setError(null)
              }}
              className="mt-4 text-[13px] underline underline-offset-2"
              style={{ color: SUBTLE }}
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
