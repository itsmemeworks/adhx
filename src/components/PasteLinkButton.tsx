'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clipboard, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { navigateToPastedLink } from '@/lib/utils/parse-share-url'

type Status = 'idle' | 'resolving' | 'error'

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
 * save. Reads the clipboard via `navigator.clipboard.readText()` — a
 * user-gesture-gated call, so it must fire directly inside the click handler,
 * never on mount — then hands the text to the shared `navigateToPastedLink`
 * helper (the same CodeQL-hardened navigation shape used by `LandingPage`'s
 * hero input and `PreviewAnotherLink`). This is the mobile equivalent of
 * desktop's ⌘V paste-to-preview, which has no paste gesture on touch Safari.
 *
 * Falls back to an inline URL input — mirroring `PreviewAnotherLink`'s
 * auto-navigate-on-type behavior — whenever the Clipboard API can't hand us
 * text at all (unsupported, denied permission bubble, or an empty clipboard),
 * so the flow never dead-ends. A recognized-but-unsupported clipboard value
 * gets a brief, self-clearing error instead, since we DID get an answer —
 * just not a useful one.
 */
export function PasteLinkButton({ className, iconOnly = false }: PasteLinkButtonProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [showInput, setShowInput] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState('')
  const router = useRouter()
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current)
    },
    [],
  )

  const flashError = () => {
    setStatus('error')
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current)
    errorTimeoutRef.current = setTimeout(() => setStatus('idle'), 3000)
  }

  const handleTap = async () => {
    if (!navigator.clipboard?.readText) {
      setShowInput(true)
      return
    }
    setStatus('resolving')
    let text: string
    try {
      text = (await navigator.clipboard.readText()).trim()
    } catch {
      // Permission denied, or an insecure-context/policy failure — offer
      // manual paste rather than dead-ending on a bare error.
      setStatus('idle')
      setShowInput(true)
      return
    }
    if (!text) {
      setStatus('idle')
      setShowInput(true)
      return
    }
    if (!navigateToPastedLink(router, text)) {
      flashError()
      return
    }
    // Navigation is underway — leave the spinner up until the page changes.
  }

  const handleInputChange = (value: string) => {
    setInputValue(value)
    setInputError('')
    if (
      /(?:x\.com|twitter\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\//i.test(value)
    ) {
      navigateToPastedLink(router, value)
    }
  }

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setInputError('')
    if (!navigateToPastedLink(router, inputValue)) {
      setInputError("That's not a link we recognize.")
    }
  }

  const form = (
    <form onSubmit={handleInputSubmit} data-testid="paste-link-input-fallback">
      <div className="flex gap-2">
        <input
          type="text"
          autoFocus
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Paste a link…"
          className={cn(
            'min-w-0 flex-1 rounded-xl border px-3 py-2.5 font-mono text-base outline-none sm:text-[12.5px]',
            iconOnly
              ? 'border-white/25 bg-white/[0.14] text-white placeholder:text-white/50 focus:border-white/50'
              : 'border-hairline bg-inset text-ink placeholder:text-ink-3 focus:border-clay/60 focus:ring-2 focus:ring-clay/40',
          )}
        />
        <button
          type="submit"
          className="flex-none rounded-xl bg-clay-grad px-[18px] text-[13.5px] font-semibold text-white shadow-glow transition-all hover:opacity-95"
        >
          Go
        </button>
      </div>
      {inputError && <p className="mt-1.5 text-xs text-[#EF4444]">{inputError}</p>}
    </form>
  )

  if (showInput) {
    // Icon-only mounts (the theater's packed top bar) render the fallback as
    // a floating panel anchored under the button instead of an inline
    // element — inline would reflow the whole top bar around a 256px input.
    if (iconOnly) {
      return (
        <div className={cn('relative', className)}>
          <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-white/15 bg-[#08070a]/95 p-2.5 shadow-lg backdrop-blur-md">
            {form}
          </div>
        </div>
      )
    }
    return <div className={cn('flex-1', className)}>{form}</div>
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => void handleTap()}
        disabled={status === 'resolving'}
        aria-label="Paste a link"
        title={status === 'error' ? "That's not a supported link" : 'Paste a link'}
        className={cn(
          'inline-flex h-10 w-10 flex-none items-center justify-center rounded-full border backdrop-blur-md transition-colors',
          status === 'error'
            ? 'border-red-400/50 bg-red-500/20 text-red-200'
            : 'border-white/25 bg-white/10 text-white hover:bg-white/20',
          className,
        )}
      >
        {status === 'resolving' ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Clipboard size={16} />
        )}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void handleTap()}
      disabled={status === 'resolving'}
      aria-label="Paste link"
      className={cn(
        'inline-flex min-h-[40px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13.5px] font-semibold transition-all disabled:opacity-70',
        status === 'error' ? 'bg-red-500/15 text-red-500' : 'bg-clay-grad text-white shadow-glow',
        className,
      )}
    >
      {status === 'resolving' ? (
        <Loader2 size={15} className="animate-spin" />
      ) : (
        <Clipboard size={15} />
      )}
      {status === 'error' ? "That's not a supported link" : 'Paste link'}
    </button>
  )
}
