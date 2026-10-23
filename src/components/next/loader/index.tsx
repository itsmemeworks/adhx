'use client'

import type { CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NxImage } from '../primitives'
import { Gob } from '../Gob'

/**
 * The ADHX loader family: Gob (the mark), shimmer skeletons and paste toasts.
 * All motion is CSS keyframes (`animate-nx-*`, tailwind.config.ts) and is
 * switched off under `prefers-reduced-motion` (globals.css).
 */

export interface AdhxFaceProps {
  /** Edge length in px. */
  size?: number
  /** Bounce + squash (the full-size loader); off for toast icons. */
  bounce?: boolean
  /** `look` = eyes glance left/right and blink; `shut` = can't help (flat eyes, dark tile). */
  mood?: 'look' | 'shut'
  className?: string
}

/**
 * Gob, the ADHX mark, as the loader face. Decorative. `bounce` (loading)
 * bobs and looks around; `shut` closes its eyes; otherwise it blinks.
 */
export function AdhxFace({ size = 110, bounce = false, mood = 'look', className }: AdhxFaceProps) {
  return (
    <Gob
      size={size}
      mood={mood === 'shut' ? 'shut' : bounce ? 'busy' : 'idle'}
      className={className}
    />
  )
}

/** Three dots that pulse in turn. Each dot is its own span (translation-safe). */
function LoadingDots() {
  return (
    <>
      {[0, 200, 400].map((delay) => (
        <span key={delay} className="animate-nx-dot" style={{ animationDelay: `${delay}ms` }}>
          .
        </span>
      ))}
    </>
  )
}

/**
 * Full loader for a first fetch: the face bounces over its shadow, looks
 * around, blinks, and says "grabbing it…".
 */
export function AdhxLoader({
  size = 110,
  label = 'grabbing it',
  className,
}: {
  size?: number
  label?: string
  className?: string
}) {
  return (
    <div
      role="status"
      className={cn('flex flex-col items-center gap-[22px] text-nx-ink', className)}
    >
      <span className="flex flex-col items-center">
        <AdhxFace size={size} bounce />
        <span
          aria-hidden
          style={{ width: size * 0.73, height: Math.max(6, size * 0.11), marginTop: size * 0.13 }}
          className="block animate-nx-shadow rounded-[50%] bg-nx-accent/35"
        />
      </span>
      <span
        className="flex items-baseline font-nx-serif"
        style={{ fontSize: Math.round(Math.max(22, size * 0.27)) }}
      >
        <span>{label}</span>
        <LoadingDots />
      </span>
    </div>
  )
}

/** A shimmering placeholder block. Size it with className. */
export function Shimmer({
  className,
  delayMs = 0,
  style,
}: {
  className?: string
  /** Stagger neighbours in a row (0.1s steps look right). */
  delayMs?: number
  style?: CSSProperties
}) {
  return (
    <span
      aria-hidden
      style={delayMs ? { ...style, animationDelay: `${delayMs}ms` } : style}
      className={cn('nx-shimmer block animate-nx-shimmer rounded-[12px]', className)}
    />
  )
}

/** The stage while a post loads: shimmer ground, face, caption bars and rail ghosts hold the layout. */
export function StageSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading post"
      className={cn('relative h-full w-full overflow-hidden bg-nx-stage', className)}
    >
      <Shimmer className="absolute inset-0 rounded-none [background-image:linear-gradient(90deg,#121110_0%,#201e1b_50%,#121110_100%)]" />
      <span className="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2">
        <AdhxFace size={64} bounce />
      </span>
      <span
        aria-hidden
        className="absolute bottom-[30px] left-3.5 right-[60px] flex flex-col gap-2"
      >
        <span className="block h-3 w-1/2 rounded-md bg-nx-placeholder" />
        <span className="block h-3 w-[90%] rounded-md bg-nx-placeholder" />
        <span className="block h-3 w-[70%] rounded-md bg-nx-placeholder" />
      </span>
      <span aria-hidden className="absolute bottom-[120px] right-2.5 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="block h-10 w-10 rounded-full bg-nx-placeholder" />
        ))}
      </span>
    </div>
  )
}

export type PasteToastState = 'grabbing' | 'saved' | 'failed'

/** `https://www.x.com/a/status/1` → `x.com/a/status/1`. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
}

export interface PasteToastProps {
  state: PasteToastState
  /** The pasted link (grabbing). */
  url?: string
  /** Thumbnail of the saved post (saved); the face is used without one. */
  thumbSrc?: string | null
  /** Second line when saved, e.g. "@JamesMelville · playing now". */
  savedDetail?: string
  /** Optional follow-up button on a saved toast (e.g. "Add to channel"). */
  action?: { label: string; onClick: () => void }
  className?: string
}

const TOAST_COPY: Record<PasteToastState, string> = {
  grabbing: 'Grabbing it…',
  saved: 'Saved',
  failed: 'That link isn’t a post we can save',
}

/** Feedback after a paste: grabbing → saved, or the face shuts its eyes when it can't help. */
export function PasteToast({
  state,
  url,
  thumbSrc,
  savedDetail,
  action,
  className,
}: PasteToastProps) {
  const detail =
    state === 'grabbing'
      ? url
        ? displayUrl(url)
        : null
      : state === 'saved'
        ? (savedDetail ?? null)
        : 'Links from most social apps work'

  return (
    <div
      role="status"
      aria-live="polite"
      data-state={state}
      className={cn(
        'flex w-full max-w-[380px] animate-nx-drop items-center gap-3 rounded-2xl bg-nx-surface/[.97] py-2.5 pl-2.5 pr-3.5 font-nx-sans text-nx-ink shadow-nx-toast',
        className,
      )}
    >
      {state === 'saved' && thumbSrc ? (
        // In the toast's corner: 16 − 10 leaves the 8 px floor (its button too).
        <span className="relative block h-11 w-11 shrink-0 overflow-hidden rounded-[8px] bg-nx-placeholder">
          <NxImage src={thumbSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </span>
      ) : (
        <AdhxFace size={44} mood={state === 'failed' ? 'shut' : 'look'} />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold leading-tight">{TOAST_COPY[state]}</span>
        {detail && (
          <span
            className={cn(
              'text-[12px] text-nx-ink-faint',
              state === 'grabbing' ? 'truncate' : 'line-clamp-2',
            )}
          >
            {detail}
          </span>
        )}
      </span>
      {state === 'grabbing' && (
        <span
          aria-hidden
          className="block h-[22px] w-[22px] shrink-0 animate-nx-spin rounded-full border-[3px] border-[#333] border-t-nx-accent"
        />
      )}
      {state === 'saved' && action && (
        <button
          type="button"
          onClick={action.onClick}
          className="h-9 shrink-0 rounded-[8px] bg-nx-accent px-3 text-[13px] font-extrabold text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {action.label}
        </button>
      )}
      {state === 'saved' && !action && (
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 animate-nx-pop items-center justify-center rounded-full bg-nx-accent text-black"
        >
          <Check className="h-[15px] w-[15px]" strokeWidth={3.2} />
        </span>
      )}
    </div>
  )
}
