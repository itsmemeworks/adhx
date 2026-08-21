'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clipboard, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlatformGlyph } from '@/components/matter'
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
 * iOS constraint this is built around: the clipboard cannot be inspected
 * ahead of a user gesture — `navigator.clipboard.readText()` only works
 * called directly inside the tap (any intervening `await`/state update
 * before it is fine; what's fatal is deferring the CALL itself, e.g. behind
 * a render). A prior version's fallback path rendered an `autoFocus`ed
 * `<input>` whenever the read came up empty — on iOS that's what actually
 * fired: focusing an empty text field summons Safari's native "Paste |
 * Speak" callout, and a mistaken tap on "Speak" dropped the visitor into
 * dictation with no way to back out (the fallback had no dismissal at all).
 * The fix: never autofocus anything, and give the fallback a real dismiss
 * story (outside-click / Escape / explicit close, copied from
 * `TheaterAvatarMenu`).
 */
export function PasteLinkButton({ className, iconOnly = false }: PasteLinkButtonProps) {
  const [resolving, setResolving] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [manualValue, setManualValue] = useState('')
  const [manualError, setManualError] = useState('')
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!overlayOpen) return

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOverlayOpen(false)
      }
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

  // The only place that touches the clipboard. Must be invoked as the first
  // thing a click handler does (no render/await ahead of the actual
  // `readText()` call) so it stays inside the tap's user-activation window.
  // An empty clipboard, a denied/unsupported read, and real-but-unsupported
  // text are surfaced distinctly to the caller: the first two mean "we got
  // no answer" (never an error, see below), the third means "we got an
  // answer and it wasn't a link."
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

  const handleTap = async () => {
    setResolving(true)
    const result = await attemptRead()
    setResolving(false)
    if (result === 'navigated') return
    // Never show an error from this very first, automatic read — whether
    // the clipboard was empty/denied/unreadable OR just held non-link text,
    // the response is the same helper overlay, error-free. An error only
    // appears once the visitor takes an explicit action FROM the overlay
    // (the Paste retry button, or the manual Go) and that comes up empty too.
    setManualError('')
    setOverlayOpen(true)
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
        onClick={() => void handleTap()}
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
        {!iconOnly && 'Paste link'}
      </button>

      {overlayOpen && (
        <div
          role="dialog"
          aria-label="Paste a link"
          className={cn(
            'absolute top-full z-20 mt-2 w-72 rounded-2xl border p-4 shadow-2xl',
            iconOnly
              ? 'right-0 border-white/15 bg-[#201b16] backdrop-blur-md'
              : 'left-1/2 -translate-x-1/2 border-hairline bg-surface',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn('text-[13px] font-semibold', iconOnly ? 'text-[#f3ece0]' : 'text-ink')}
            >
              Paste a link
            </p>
            <button
              type="button"
              onClick={() => setOverlayOpen(false)}
              aria-label="Close"
              className={cn(
                'flex-none transition-colors',
                iconOnly ? 'text-[#857a69] hover:text-[#f3ece0]' : 'text-ink-3 hover:text-ink',
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
            Copy a link to a post on X, Instagram, TikTok, or YouTube, then come back and tap Paste.
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

          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={retrying}
            className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-clay-grad text-[13px] font-semibold text-white shadow-glow transition-opacity disabled:opacity-70"
          >
            {retrying ? <Loader2 size={14} className="animate-spin" /> : <Clipboard size={14} />}
            Paste
          </button>

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

          {/* Deliberately no `autoFocus` — see the component doc comment.
              This is the SECONDARY path; the visitor taps into it on
              purpose if they want to type instead of using the clipboard. */}
          <form onSubmit={handleManualSubmit}>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualValue}
                onChange={(e) => handleManualChange(e.target.value)}
                placeholder="Paste a link…"
                className={cn(
                  'min-w-0 flex-1 rounded-xl border px-3 py-2 text-[13px] outline-none',
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
            <p className={cn('mt-1.5 text-[12px]', iconOnly ? 'text-[#e08a6a]' : 'text-[#EF4444]')}>
              {manualError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
