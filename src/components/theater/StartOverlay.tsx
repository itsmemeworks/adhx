'use client'

/**
 * First-intent teaching overlay for the signed-out live theater (`/?start=1`
 * — the destination for the "Make your own" CTA in the collection-mode
 * theater chrome and the "Start your collection" CTA on `/t/{username}`'s
 * footer). Those CTAs used to dump visitors on the bare theater with no
 * obvious next step ("they're not sure what to do"); this teaches the two
 * ways in — tap Save on any post, or paste a link — before getting out of
 * the way.
 *
 * Shown every time the CTA is followed while signed out; this is an intent
 * signal, not a first-visit flag, so there's deliberately no
 * localStorage/dismissal persistence. `TheaterShell` strips the `start`
 * param once auth state is known regardless of whether this ends up shown
 * (an already-authed visitor has a collection — no need to teach them
 * anything), and owns the `open` condition entirely; this component is
 * purely presentational.
 *
 * Styled like `SignInModal` — always-dark theater surface (hardcoded
 * palette, independent of the site's light/dark theme), same capture-phase
 * Escape/shortcut handling so the underlying live theater's ↓/↑/space/m keys
 * don't leak through to the stage behind it while this is open.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bookmark, Clipboard, ArrowRight, X } from 'lucide-react'
import { resolvePastedLink } from '@/lib/theater/paste-preview'
import { navigateToAppPath } from '@/components/PasteToPreview'

export interface StartOverlayProps {
  open: boolean
  onDismiss: () => void
}

// Same always-dark palette as SignInModal — this overlay sits over the same
// near-black stage regardless of the site's light/dark theme setting.
const INK = '#f3ece0'
const MUTED = '#857a69'
const SUBTLE = '#b8ac99'
const PANEL = '#201b16'
const BORDER = '#322b23'
const INPUT_BG = '#2a241d'
const ACCENT_GRADIENT = 'linear-gradient(135deg,#e88a5e,#d26b40)'

// Mirrors SignInModal's THEATER_SHORTCUT_KEYS — stop the live theater's
// keyboard nav (↓↑/jk, arrows, space, m) from reaching it while this overlay
// covers the stage.
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

export function StartOverlay({ open, onDismiss }: StartOverlayProps) {
  const [linkValue, setLinkValue] = useState('')
  const [linkError, setLinkError] = useState(false)
  const linkErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset transient input state whenever the overlay is (re)shown.
  useEffect(() => {
    if (!open) return
    setLinkValue('')
    setLinkError(false)
  }, [open])

  // Capture-phase keydown: Escape always dismisses; theater/global shortcut
  // keys are stopped from propagating further (unless the target is a text
  // field, where typing must work normally).
  useEffect(() => {
    if (!open) return
    function handleKeyDownCapture(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        onDismiss()
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
  }, [open, onDismiss])

  useEffect(
    () => () => {
      if (linkErrorTimeoutRef.current) clearTimeout(linkErrorTimeoutRef.current)
    },
    [],
  )

  if (!open) return null

  function trySubmitLink(e: FormEvent) {
    e.preventDefault()
    const path = resolvePastedLink(linkValue)
    if (path) {
      navigateToAppPath(path)
      return
    }
    setLinkError(true)
    if (linkErrorTimeoutRef.current) clearTimeout(linkErrorTimeoutRef.current)
    linkErrorTimeoutRef.current = setTimeout(() => setLinkError(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(8,7,10,.72)', backdropFilter: 'blur(8px)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss()
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Start your collection"
        className="w-full max-w-[460px] rounded-2xl border p-7 shadow-2xl"
        style={{ backgroundColor: PANEL, borderColor: BORDER }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <img
              src="/adhx-cloud.png"
              alt=""
              aria-hidden
              style={{ height: 24 }}
              className="w-auto"
            />
            <span className="font-indie-flower leading-none" style={{ fontSize: 20, color: INK }}>
              ADHX
            </span>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
            style={{ color: SUBTLE }}
          >
            <X size={16} />
          </button>
        </div>

        <h2 className="font-serif text-[26px] leading-tight" style={{ color: INK }}>
          Start your collection
        </h2>
        <p className="mt-2 text-[13.5px] leading-snug" style={{ color: MUTED }}>
          There&apos;s nothing to set up first — save something and your account exists.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <div
            className="flex gap-3 rounded-xl border p-4"
            style={{ borderColor: BORDER, backgroundColor: INPUT_BG }}
          >
            <div
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-white"
              style={{ background: ACCENT_GRADIENT }}
            >
              <Bookmark size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold" style={{ color: INK }}>
                Save anything you like
              </p>
              <p className="mt-0.5 text-[13px] leading-snug" style={{ color: MUTED }}>
                Hit Save on any post below — your account is created right there.
              </p>
            </div>
          </div>

          <div
            className="flex gap-3 rounded-xl border p-4"
            style={{ borderColor: BORDER, backgroundColor: INPUT_BG }}
          >
            <div
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-white"
              style={{ background: ACCENT_GRADIENT }}
            >
              <Clipboard size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold" style={{ color: INK }}>
                Or paste a link
              </p>
              <p className="mt-0.5 text-[13px] leading-snug" style={{ color: MUTED }}>
                ⌘V / Ctrl+V any X, Instagram, TikTok, or YouTube link anywhere on this page — or
                drop it here:
              </p>
              <form onSubmit={trySubmitLink} className="mt-2.5 flex items-center gap-2">
                <input
                  type="text"
                  inputMode="url"
                  value={linkValue}
                  onChange={(e) => setLinkValue(e.target.value)}
                  placeholder="Paste a link…"
                  aria-label="Paste a link to preview"
                  className="h-10 min-w-0 flex-1 rounded-full px-3.5 text-[13px] outline-none focus:ring-2"
                  style={
                    {
                      backgroundColor: '#201b16',
                      color: INK,
                      border: `1px solid ${linkError ? '#e08a6a' : BORDER}`,
                      '--tw-ring-color': 'rgba(232,138,94,0.4)',
                    } as React.CSSProperties
                  }
                />
                <button
                  type="submit"
                  aria-label="Preview link"
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-white transition-transform hover:scale-105"
                  style={{ background: ACCENT_GRADIENT }}
                >
                  <ArrowRight size={16} />
                </button>
              </form>
              {linkError && (
                <p className="mt-1.5 text-[12px]" style={{ color: '#e08a6a' }}>
                  That doesn&apos;t look like an X, Instagram, TikTok, or YouTube link.
                </p>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="mt-6 w-full text-center text-[13px] underline underline-offset-2"
          style={{ color: SUBTLE }}
        >
          Show me what&apos;s trending
        </button>
      </div>
    </div>
  )
}
