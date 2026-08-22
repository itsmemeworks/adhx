'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Clipboard, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlatformGlyph } from '@/components/matter'
import { isIOSDevice } from '@/lib/platform'
import { navigateToPastedLink } from '@/lib/utils/parse-share-url'

// Copied from `TheaterAvatarMenu`'s dismissal machinery: while the overlay is
// open, keep the theater's window-level keydown handler from acting on these
// (harmless outside the theater — there's no such listener there to compete
// with). Escape is handled separately below (it closes the overlay).
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

type ReadResult = 'navigated' | 'unsupported' | 'no-text'

export interface PasteLinkButtonProps {
  className?: string
  /**
   * Icon-only chrome (no "Paste link" label, dark-scrim button styling) for
   * tight spaces like the theater's mobile top bar. Default renders the full
   * clay pill with a label — this is the primary mobile save affordance, so
   * it earns a short label rather than going icon-only everywhere (unlike
   * most Matter controls — see the "icons over text" rule).
   */
  iconOnly?: boolean
}

/**
 * One-tap mobile save: turns "Copy Link" in any share sheet into a two-tap
 * save.
 *
 * The flow is platform-branched (`isIOSDevice()`), because iOS Safari makes
 * `navigator.clipboard.readText()` unusable as the PRIMARY affordance:
 * every call summons a system permission callout that renders near
 * whatever's focused, so two independent `readText()` calls (button tap +
 * a retry button) produced two disconnected, confusing callouts on the
 * owner's phone. A version before that had a worse bug — an `autoFocus`ed,
 * empty fallback `<input>` — which summons iOS's native "Paste | Speak"
 * text-selection callout (that one only appears on a focused field), and a
 * mistaken tap on "Speak" dropped the visitor into dictation with no way
 * back out.
 *
 * - **iOS**: never calls `readText()`. Tap opens the helper overlay with the
 *   manual input deliberately autofocused — THIS is the paste surface now:
 *   iOS pops its one, familiar "Paste" callout on the focused field, the
 *   visitor taps it exactly like pasting anywhere else on their phone, and
 *   the `onPaste` handler resolves + navigates synchronously off the pasted
 *   text (not waiting on a keystroke/state round-trip). No separate retry
 *   button — two paste affordances is what produced the double-callout
 *   confusion.
 * - **Non-iOS** (desktop/Android): unchanged — tap reads the clipboard
 *   in-gesture and navigates instantly; on failure, the same overlay offers
 *   a "Paste" retry button (Chrome's clipboard permission prompt is a normal
 *   one-time dialog, not a per-read callout, so this flow is fine there).
 */
/**
 * The rectangle actually visible to the user, tracked live. On iOS the
 * software keyboard does NOT shrink the layout viewport — it overlays it and
 * Safari scrolls the page to reveal the focused field. A dialog anchored to
 * its trigger therefore slides off the top of the screen the moment the
 * keyboard opens (owner report, with a screenshot of exactly that). The
 * `visualViewport` API is the only thing that reports the space left over, so
 * the dialog is positioned in THAT box and re-centres itself as the keyboard
 * comes and goes.
 *
 * Falls back to the layout viewport where the API is missing — the dialog is
 * then simply centred on screen, which is the pre-keyboard behaviour anyway.
 */
function useVisibleViewport(active: boolean): { top: number; height: number } | null {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null)

  useEffect(() => {
    if (!active) return
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) {
      setBox(null)
      return
    }
    const update = () => setBox({ top: vv.offsetTop, height: vv.height })
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [active])

  return box
}

export function PasteLinkButton({ className, iconOnly = false }: PasteLinkButtonProps) {
  const [ios, setIos] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const [manualError, setManualError] = useState('')
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const viewport = useVisibleViewport(overlayOpen)
  // Portals need a client mount before `document.body` exists.
  const [portalReady, setPortalReady] = useState(false)
  useEffect(() => setPortalReady(true), [])

  // SSR-safe platform detection (matches the pattern CLAUDE.md documents for
  // src/lib/platform.ts): resolves after mount, well before any tap.
  useEffect(() => {
    setIos(isIOSDevice())
  }, [])

  useEffect(() => {
    if (!overlayOpen) return

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node
      // The panel is portalled to <body>, so it is NOT inside containerRef —
      // check it separately or every tap inside the dialog would close it.
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOverlayOpen(false)
    }

    function handleKeyDownCapture(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        setOverlayOpen(false)
        return
      }
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (THEATER_SHORTCUT_KEYS.has(e.key)) e.stopPropagation()
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDownCapture, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDownCapture, true)
    }
  }, [overlayOpen])

  // Non-iOS only. Must be invoked as the first thing a click handler does
  // (no render/await ahead of the actual `readText()` call) so it stays
  // inside the tap's user-activation window. An empty clipboard, a
  // denied/unsupported read, and real-but-unsupported text are surfaced
  // distinctly to the caller: the first two mean "we got no answer" (never
  // an error, see below), the third means "we got an answer and it wasn't
  // a link."
  const attemptRead = async (): Promise<ReadResult> => {
    if (!navigator.clipboard?.readText) return 'no-text'
    let text: string
    try {
      text = (await navigator.clipboard.readText()).trim()
    } catch {
      return 'no-text'
    }
    if (!text) return 'no-text'
    return navigateToPastedLink(router, text) ? 'navigated' : 'unsupported'
  }

  const handleTap = () => {
    // iOS never touches the clipboard from the button itself — the overlay's
    // autofocused input IS the read, via its native Paste callout.
    if (ios) {
      setManualError('')
      setOverlayOpen(true)
      return
    }
    void (async () => {
      setResolving(true)
      const result = await attemptRead()
      setResolving(false)
      if (result === 'navigated') return
      // Never show an error from this very first, automatic read — whether
      // the clipboard was empty/denied/unreadable OR just held non-link
      // text, the response is the same helper overlay, error-free. An error
      // only appears once the visitor takes an explicit action FROM the
      // overlay (the Paste retry button, or the manual Go) and that comes up
      // empty too.
      setManualError('')
      setOverlayOpen(true)
    })()
  }

  const handleRetry = async () => {
    setRetrying(true)
    const result = await attemptRead()
    setRetrying(false)
    if (result === 'navigated') return
    setManualError(result === 'unsupported' ? "That's not a supported link." : '')
  }

  const handleManualChange = (value: string) => {
    setManualValue(value)
    setManualError('')
    if (
      /(?:x\.com|twitter\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\//i.test(value)
    ) {
      navigateToPastedLink(router, value)
    }
  }

  // Resolves off the paste event itself — synchronously, not waiting on the
  // subsequent keystroke/state round-trip — which is what makes iOS's tap-
  // the-Paste-callout gesture feel instant. `preventDefault` only on a match
  // (we're navigating away, no need to also insert the text); a paste that
  // doesn't resolve falls through to the native paste + `handleManualChange`
  // as normal, deferring any error to an explicit Go submit.
  const handleManualPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!text) return
    if (navigateToPastedLink(router, text)) {
      e.preventDefault()
    }
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!navigateToPastedLink(router, manualValue)) {
      setManualError("That's not a link we recognize.")
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={handleTap}
        disabled={resolving}
        aria-label={iconOnly ? 'Paste a link' : 'Paste link'}
        aria-haspopup="dialog"
        aria-expanded={overlayOpen}
        className={cn(
          'transition-colors disabled:opacity-70',
          iconOnly
            ? 'flex h-10 w-10 flex-none items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-md hover:bg-white/20'
            : 'inline-flex min-h-[40px] w-full flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-clay-grad px-4 text-[13.5px] font-semibold text-white shadow-glow',
        )}
      >
        {resolving ? (
          <Loader2 size={iconOnly ? 16 : 15} className="animate-spin" />
        ) : (
          <Clipboard size={iconOnly ? 16 : 15} />
        )}
        {!iconOnly && <span>Paste link</span>}
      </button>

      {overlayOpen &&
        portalReady &&
        createPortal(
          <>
            {/* Scrim. Tap-to-dismiss lives here rather than relying on the
                document handler, since the portal counts as "inside". */}
            <div
              className="fixed inset-0 z-[90] bg-black/55"
              aria-hidden
              onClick={() => setOverlayOpen(false)}
            />
            {/* Centred in the VISIBLE viewport, so the keyboard pushes the
                dialog up instead of off the top of the screen. Portalled to
                <body> on purpose: `position: fixed` resolves against the
                nearest transformed ancestor, and this button sits inside the
                theater's transformed scrims. */}
            <div
              className="fixed left-0 right-0 z-[91] flex items-center justify-center px-4"
              style={
                viewport
                  ? { top: viewport.top, height: viewport.height }
                  : { top: 0, height: '100dvh' }
              }
            >
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Paste a link"
                className={cn(
                  'max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border p-4 shadow-2xl',
                  iconOnly ? 'border-white/15 bg-[#201b16]' : 'border-hairline bg-surface',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={cn(
                      'text-[13px] font-semibold',
                      iconOnly ? 'text-[#f3ece0]' : 'text-ink',
                    )}
                  >
                    Paste a link
                  </p>
                  <button
                    type="button"
                    onClick={() => setOverlayOpen(false)}
                    aria-label="Close"
                    className={cn(
                      'flex-none transition-colors',
                      iconOnly
                        ? 'text-[#857a69] hover:text-[#f3ece0]'
                        : 'text-ink-3 hover:text-ink',
                    )}
                  >
                    <X size={15} />
                  </button>
                </div>

                <p
                  className={cn(
                    'mt-1.5 text-[12px] leading-snug',
                    iconOnly ? 'text-[#b8ac99]' : 'text-ink-2',
                  )}
                >
                  Copy a link to a post on X, Instagram, TikTok, or YouTube,{' '}
                  {ios ? 'then tap Paste above the box.' : 'then come back and tap Paste.'}
                </p>

                <div
                  className={cn(
                    'mt-2.5 flex items-center gap-2.5',
                    iconOnly ? 'text-[#857a69]' : 'text-ink-3',
                  )}
                >
                  <PlatformGlyph platform="twitter" size={14} />
                  <PlatformGlyph platform="instagram" size={14} />
                  <PlatformGlyph platform="tiktok" size={14} />
                  <PlatformGlyph platform="youtube" size={14} />
                </div>

                {/* Non-iOS only — see the component doc comment for why iOS drops
              this: a second `readText()` call here would summon a second,
              disconnected system callout right after the one (if any) from
              the main button tap. */}
                {!ios && (
                  <button
                    type="button"
                    onClick={() => void handleRetry()}
                    disabled={retrying}
                    className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-clay-grad text-[13px] font-semibold text-white shadow-glow transition-opacity disabled:opacity-70"
                  >
                    {retrying ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Clipboard size={14} />
                    )}
                    Paste
                  </button>
                )}

                {!ios && (
                  <div className="my-3 flex items-center gap-2">
                    <div className={cn('h-px flex-1', iconOnly ? 'bg-white/15' : 'bg-hairline')} />
                    <span
                      className={cn(
                        'text-[10px] uppercase tracking-wide',
                        iconOnly ? 'text-[#857a69]' : 'text-ink-3',
                      )}
                    >
                      or type it
                    </span>
                    <div className={cn('h-px flex-1', iconOnly ? 'bg-white/15' : 'bg-hairline')} />
                  </div>
                )}

                {/* iOS: deliberately autofocused — this input IS the paste surface
              (see the component doc comment). Everywhere else: deliberately
              NOT autofocused — it's a secondary, type-it-yourself path the
              visitor opts into. Either way, `text-base` (16px) keeps iOS
              Safari from auto-zooming on focus (CLAUDE.md's mobile input
              zoom rule) — only shrinking back down at `sm`+, where that
              zoom behavior doesn't apply. */}
                <form onSubmit={handleManualSubmit} className={ios ? 'mt-3' : undefined}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      autoFocus={ios}
                      value={manualValue}
                      onChange={(e) => handleManualChange(e.target.value)}
                      onPaste={handleManualPaste}
                      placeholder="Paste a link…"
                      className={cn(
                        'min-w-0 flex-1 rounded-xl border px-3 py-2 text-base outline-none sm:text-[13px]',
                        iconOnly
                          ? 'border-white/20 bg-white/[0.08] text-white placeholder:text-white/40 focus:border-white/40'
                          : 'border-hairline bg-inset text-ink placeholder:text-ink-3 focus:border-clay/60',
                      )}
                    />
                    <button
                      type="submit"
                      className={cn(
                        'flex-none rounded-xl px-3 text-[12.5px] font-semibold transition-colors',
                        iconOnly
                          ? 'bg-white/10 text-white hover:bg-white/20'
                          : 'bg-inset text-ink-2 hover:bg-hairline',
                      )}
                    >
                      Go
                    </button>
                  </div>
                </form>
                {manualError && (
                  <p
                    className={cn(
                      'mt-1.5 text-[12px]',
                      iconOnly ? 'text-[#e08a6a]' : 'text-[#EF4444]',
                    )}
                  >
                    {manualError}
                  </p>
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
