'use client'

import { useCallback, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { usableAvatarUrl } from '@/lib/avatar/generated-avatar'
import { keptSrcSet, sizedSrc } from '@/lib/keep/src'
import { faceColour, faceInitial } from './faces'
import { GobShape } from './GobShape'
import type { PostAuthor } from './post'

/**
 * Low-level pieces shared by the next_ui cards and stages.
 *
 * Legibility contract (owner-approved design): text over media ALWAYS sits on
 * `.nx-scrim` (transparent → black .9) AND carries `.nx-text-shadow`; chips and
 * controls over media sit on `.nx-plate` (black .38 + shadow + blur).
 * Translation safety: no bare text node is ever the sibling of an element.
 */

export interface NxImageProps {
  src: string | null
  /** Tried once when `src` fails. */
  fallbackSrc?: string | null
  alt: string
  className?: string
  /** Pop in once loaded (rows/grids); stages fade instead. */
  reveal?: 'pop' | 'fade' | 'none'
  loading?: 'lazy' | 'eager'
  /**
   * How wide the picture is drawn (an `<img sizes>` value). Given, a kept
   * picture loads one of its smaller copies instead of the original (tiles,
   * covers); left out, the original (stages).
   */
  sizes?: string
  /** First on screen: fetch it before the rest (eager, high priority). */
  priority?: boolean
}

/** `sizes` for a row or grid tile (340 px tall, up to about 600 wide). */
export const TILE_SIZES = '(max-width: 640px) 70vw, 480px'

/**
 * An `<img>` that shows a shimmer until it loads, swaps to `fallbackSrc` once
 * on error, and leaves the bare surface behind if both fail.
 */
export function NxImage(props: NxImageProps) {
  // Keyed so a new src starts from a clean loading state.
  return <NxImageInner key={props.src ?? ''} {...props} />
}

function NxImageInner({
  src,
  fallbackSrc,
  alt,
  className,
  reveal = 'pop',
  loading = 'lazy',
  sizes,
  priority = false,
}: NxImageProps) {
  const [current, setCurrent] = useState(src)
  // A smaller copy for its box; the fallback (another address) stays whole.
  const srcSet = sizes && current && current === src ? keptSrcSet(current) : null
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(src ? 'loading' : 'failed')

  // A cached image can finish before hydration attaches onLoad.
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setState('loaded')
  }, [])

  return (
    <>
      {state === 'loading' && (
        <span aria-hidden className="nx-shimmer animate-nx-shimmer absolute inset-0" />
      )}
      {current && state !== 'failed' && (
        <img
          ref={ref}
          // srcset and sizes before src, so the browser picks once.
          srcSet={srcSet ?? undefined}
          sizes={srcSet ? sizes : undefined}
          src={srcSet && current ? sizedSrc(current, 640) : current}
          alt={alt}
          loading={priority ? 'eager' : loading}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={() => {
            if (fallbackSrc && current !== fallbackSrc) {
              setCurrent(fallbackSrc)
            } else {
              setState('failed')
            }
          }}
          className={cn(
            'block',
            className,
            state === 'loaded'
              ? reveal === 'pop'
                ? 'animate-nx-pop'
                : reveal === 'fade'
                  ? 'opacity-100 transition-opacity duration-300'
                  : ''
              : 'opacity-0',
          )}
        />
      )}
    </>
  )
}

/**
 * A person's face, Gob shaped (see `GobShape`): their photo, else their
 * initial on their colour (`faceColour`, the same on every screen and app).
 */
export function NxAvatar({
  author,
  size,
  className,
  style,
}: {
  author: Pick<PostAuthor, 'avatarUrl' | 'handle' | 'name'>
  size: number
  /** On the Gob-shaped frame: rings, borders, margins. */
  className?: string
  style?: CSSProperties
}) {
  const remote = usableAvatarUrl(author.avatarUrl)
  const [broken, setBroken] = useState(false)
  const username = author.handle || author.name
  return (
    <GobShape size={size} className={className} style={style}>
      {remote && !broken ? (
        <img
          src={remote}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="block h-full w-full object-cover"
        />
      ) : (
        // The letter is drawn, not text: faces are decorative (the name is said
        // beside them) and a page translator must not touch it.
        <span
          aria-hidden
          data-face="initial"
          data-initial={faceInitial(author.name, username)}
          className="flex h-full w-full items-center justify-center font-nx-sans font-extrabold leading-none text-black before:content-[attr(data-initial)]"
          style={{
            background: faceColour(username),
            fontSize: Math.max(8, Math.round(size * 0.42)),
          }}
        />
      )}
    </GobShape>
  )
}

/** The X logo, sized and coloured by the caller. Decorative. */
/**
 * The one switch's look (the design system's Switch): 48×28, a 22 knob inset
 * 3 that slides. On is the accent with a black knob; off is `line` with a
 * cream knob, so the knob carries the state. The row or button around it
 * carries the role.
 */
export function SwitchLook({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative block h-7 w-12 shrink-0 rounded-full transition-colors duration-150',
        on ? 'bg-nx-accent' : 'bg-nx-line',
        className,
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] h-[22px] w-[22px] rounded-full shadow-nx-knob transition-[left] duration-150',
          on ? 'left-[23px] bg-nx-on-accent' : 'left-[3px] bg-nx-cream',
        )}
      />
    </span>
  )
}

export function XLogo({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.2 2h3.4l-7.4 8.5L23 22h-6.8l-5.3-6.9L4.8 22H1.4l7.9-9.1L1 2h7l4.8 6.3zM17 20h1.9L7.1 3.9H5.1z" />
    </svg>
  )
}

/** Bottom gradient that every run of text over media sits on. */
export function Scrim({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'nx-scrim nx-text-shadow absolute inset-x-0 bottom-0 flex flex-col text-nx-ink',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Small label over media (`0:41`, `1 / 3`, `GIF · loops`). */
export function MediaChip({
  children,
  className,
  tone = 'plate',
}: {
  children: string
  className?: string
  /** `accent` = yellow (e.g. Playing). */
  tone?: 'plate' | 'accent'
}) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute whitespace-nowrap rounded-[7px] px-2 py-[5px] text-[11px] font-bold leading-none',
        tone === 'accent'
          ? 'bg-nx-accent text-black shadow-nx-plate'
          : 'nx-plate text-nx-ink tabular-nums',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Avatar + name, small, for tile footers. */
export function AuthorLine({
  author,
  className,
  label,
}: {
  author: PostAuthor
  className?: string
  /** Defaults to the display name. */
  label?: string
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5 text-[11px]', className)}>
      <NxAvatar author={author} size={18} />
      <span className="truncate">{label ?? author.name}</span>
    </span>
  )
}

/** Thin progress line used by stages (dwell timer / playback). 0–1. */
export function StageProgress({
  value,
  tone = 'light',
  className,
}: {
  value: number
  tone?: 'light' | 'dark'
  className?: string
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      aria-hidden
      className={cn(
        'h-1 rounded-full',
        tone === 'light' ? 'bg-nx-cream/25' : 'bg-nx-bg/15',
        className,
      )}
    >
      <div
        className={cn('h-1 rounded-full', tone === 'light' ? 'bg-nx-accent' : 'bg-nx-bg')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
