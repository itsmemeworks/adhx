'use client'

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { isValidEmail } from '@/lib/utils/email'
import { Mail, X } from 'lucide-react'
import { THEATER_SHORTCUT_KEYS } from '@/components/theater/theater-shortcuts'
import { registerModal, type ModalStackRegistration } from '@/lib/a11y/modal-stack'
import { MatterLogo } from '@/components/matter'

export interface SignInModalProps {
  open: boolean
  onClose: () => void
  /** Default: "Sign in to ADHX" */
  title?: string
  /** e.g. "12 posts from claude-code, curated by @weedauwl — save them to Saved." */
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

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

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
  const modalRootRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const successActionRef = useRef<HTMLButtonElement>(null)
  const registrationRef = useRef<ModalStackRegistration | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const titleId = useId()
  const descriptionId = useId()

  const focusDefault = useCallback(() => {
    const target = successActionRef.current ?? emailInputRef.current ?? dialogRef.current
    target?.focus({ preventScroll: true })
  }, [])

  const requestClose = useCallback(() => {
    const registration = registrationRef.current
    if (!registration?.isTopmost()) return
    registrationRef.current = null
    registration.unregister()
    onCloseRef.current()
  }, [])

  // Capture the exact invoker before transferring focus, isolate every
  // outside branch, and restore both on controlled close or unmount.
  useEffect(() => {
    const root = modalRootRef.current
    if (!open || !root) return
    setStage('form')
    setError(null)
    setSubmitting(false)
    const registration = registerModal({
      root,
      invokingElement:
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
      focusDefault,
      onEscape: requestClose,
    })
    registrationRef.current = registration
    return () => {
      if (registrationRef.current === registration) registrationRef.current = null
      registration.unregister()
    }
  }, [focusDefault, open, requestClose])

  // Keep the first meaningful control focused as the modal changes stage.
  useEffect(() => {
    if (!open) return
    const focusTimer = window.setTimeout(() => {
      if (registrationRef.current?.isTopmost()) focusDefault()
    }, 0)
    return () => window.clearTimeout(focusTimer)
  }, [focusDefault, open, stage])

  // Keep Tab inside the topmost dialog. Escape has one coordinator-owned
  // capture listener so one key event can never close two stacked modals.
  // Theater shortcuts remain contained at the modal root in the bubble phase
  // so inputs and native buttons still receive their own keyboard events.
  useEffect(() => {
    if (!open) return
    function handleKeyDownCapture(e: KeyboardEvent) {
      if (!registrationRef.current?.isTopmost()) return
      if (e.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getAttribute('aria-hidden') !== 'true' && !element.closest('[inert]'),
      )
      if (focusable.length === 0) {
        e.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || !focusable.includes(active)) {
        e.preventDefault()
        const wrapTarget = e.shiftKey ? last : first
        wrapTarget.focus({ preventScroll: true })
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', handleKeyDownCapture, true)
    return () => window.removeEventListener('keydown', handleKeyDownCapture, true)
  }, [open])

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
      ref={modalRootRef}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(8,7,10,.72)', backdropFilter: 'blur(8px)' }}
      onMouseDown={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) requestClose()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (THEATER_SHORTCUT_KEYS.has(e.key)) e.stopPropagation()
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative w-full max-w-[420px] rounded-2xl border p-7 shadow-2xl"
        style={{ backgroundColor: PANEL, borderColor: BORDER }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close sign-in"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50"
          style={{ color: SUBTLE }}
        >
          <X aria-hidden style={{ width: 18, height: 18 }} />
        </button>

        {/* Brand row */}
        <div className="mb-6 flex items-center pr-10">
          <MatterLogo size={19} surface="dark" />
        </div>

        {stage === 'form' ? (
          <>
            <h2 id={titleId} className="font-serif text-2xl leading-tight" style={{ color: INK }}>
              {title}
            </h2>
            {subtitle && (
              <p
                id={descriptionId}
                className="mt-2 text-[13.5px] leading-snug"
                style={{ color: MUTED }}
              >
                {subtitle}
              </p>
            )}
            {!subtitle && (
              <span id={descriptionId} className="sr-only">
                Sign in with an email magic link.
              </span>
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
            <h2 id={titleId} className="font-serif text-2xl leading-tight" style={{ color: INK }}>
              Check your inbox
            </h2>
            <p
              id={descriptionId}
              role="status"
              aria-live="polite"
              className="mt-2 text-[13.5px] leading-snug"
              style={{ color: MUTED }}
            >
              We sent a sign-in link to {email}. It expires in 15 minutes.
            </p>
            <button
              ref={successActionRef}
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
