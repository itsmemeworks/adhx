'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  Bookmark,
  Check,
  CirclePlay,
  Clock,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  FEED_KINDS,
  FEED_KIND_LABELS,
  feedTypesSummary,
  waitingLine,
  type BlendMode,
  type FeedKind,
  type WhyKind,
} from '@/lib/feed/blend'
import type { FeedItem } from '@/components/feed/types'
import { Gob } from '../Gob'

/**
 * Pieces of the blended feed in the theater (`/play?feed=`): whose saves it
 * plays, why a post is here, and the end of New.
 */

/** Icon for a reason, as on the chip, Up next and "Why this one". */
export const WHY_ICON: Record<WhyKind, LucideIcon> = {
  together: Users,
  more: Plus,
  like: Bookmark,
  close: CirclePlay,
  fresh: Clock,
  yours: Bookmark,
}

export function WhyIcon({
  kind,
  className,
  strokeWidth = 2.2,
}: {
  kind: WhyKind
  className?: string
  strokeWidth?: number
}) {
  const Icon = WHY_ICON[kind]
  return <Icon aria-hidden className={className} strokeWidth={strokeWidth} />
}

/** The short label for a post's why: "Saved together", else the why line itself. */
export function whyLabel(post: Pick<FeedItem, 'why' | 'whyReasons'>): string {
  if (!post.why) return ''
  return post.whyReasons?.[0]?.kind === 'together' ? 'Saved together' : post.why
}

export function whyKind(post: Pick<FeedItem, 'whyReasons'>): WhyKind {
  return post.whyReasons?.[0]?.kind ?? 'fresh'
}

const SWITCH: { mode: Exclude<BlendMode, 'new'>; label: string }[] = [
  { mode: 'everyone', label: 'Everyone' },
  { mode: 'friends', label: 'Friends only' },
  { mode: 'mine', label: 'Mine' },
]

/**
 * Everyone · Friends only · Mine. New is everyone's saves you haven't seen,
 * so it lights Everyone.
 */
export function FeedSwitch({
  mode,
  onChange,
  className,
}: {
  mode: BlendMode
  onChange: (mode: BlendMode) => void
  className?: string
}) {
  const lit = mode === 'new' ? 'everyone' : mode
  return (
    <div
      role="radiogroup"
      aria-label="Whose saves"
      className={cn('flex shrink-0 gap-0.5 rounded-full bg-[#1c1b19] p-1', className)}
    >
      {SWITCH.map((option) => {
        const on = lit === option.mode
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              if (!on) onChange(option.mode)
            }}
            className={cn(
              'h-8 whitespace-nowrap rounded-full px-3 text-[13px] md:h-9 md:px-3.5',
              on ? 'bg-nx-cream font-extrabold text-black' : 'font-semibold text-white/80',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * "What's in your feed": a short summary ("Videos and photos") that opens four
 * toggle chips. At least one kind stays on.
 */
export function FeedTypesControl({
  types,
  onChange,
  className,
}: {
  types: readonly FeedKind[]
  onChange: (types: FeedKind[]) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])
  const summary = feedTypesSummary(types)
  return (
    <div ref={ref} className={cn('relative shrink-0', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`What’s in your feed: ${summary}`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 min-w-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#1c1b19] px-3 text-[13px] font-bold text-white sm:px-3.5"
      >
        <SlidersHorizontal aria-hidden className="h-4 w-4 shrink-0 text-nx-accent" />
        {/* Phones: the icon alone (the chips say what's on). */}
        <span className="hidden sm:inline">{summary}</span>
      </button>
      {open && (
        <div
          role="group"
          aria-label="What’s in your feed"
          className="absolute right-0 top-full z-50 mt-2 flex w-[260px] sm:left-0 sm:right-auto flex-col gap-2 rounded-2xl bg-[#1c1b19] p-3 shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
        >
          <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-white/60">
            What’s in your feed
          </span>
          <div className="flex flex-wrap gap-1.5">
            {FEED_KINDS.map((kind) => {
              const on = types.includes(kind)
              const last = on && types.length === 1
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={on}
                  disabled={last}
                  title={last ? 'Keep at least one on' : undefined}
                  onClick={() =>
                    onChange(
                      on
                        ? types.filter((k) => k !== kind)
                        : FEED_KINDS.filter((k) => k === kind || types.includes(k)),
                    )
                  }
                  className={cn(
                    'flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-bold disabled:cursor-not-allowed',
                    on ? 'bg-nx-cream text-black' : 'bg-white/10 text-white',
                  )}
                >
                  {on && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
                  <span>{FEED_KIND_LABELS[kind]}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** The chip at the stage's top-left that says why this post is here; opens "Why this one". */
export function WhyChip({
  post,
  onOpen,
  className,
}: {
  post: Pick<FeedItem, 'why' | 'whyReasons'>
  onOpen: () => void
  className?: string
}) {
  const label = whyLabel(post)
  if (!label) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Why this one: ${label}`}
      className={cn(
        'nx-plate pointer-events-auto flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-full pl-2.5 pr-3.5 text-[13px] font-bold',
        className,
      )}
    >
      <WhyIcon kind={whyKind(post)} className="h-4 w-4 shrink-0 text-nx-accent" />
      <span className="truncate">{label}</span>
    </button>
  )
}

/**
 * The end of New: everything your people saved has been on stage. Replaces
 * the stage (the player stays mounted underneath).
 */
export function CaughtUpStage({
  onWatchAgain,
  waiting = {},
  onShowWaiting,
  className,
}: {
  /** Play everyone's saves again, seen ones included (mode `everyone`). */
  onWatchAgain: () => void
  /** Unseen posts "What's in your feed" leaves out, by kind. */
  waiting?: Partial<Record<FeedKind, number>>
  onShowWaiting?: () => void
  className?: string
}) {
  const waits = waitingLine(waiting)
  return (
    <section
      aria-labelledby="nx-caught-up"
      className={cn(
        'flex flex-col items-center justify-center gap-0 bg-nx-stage px-6 pb-10 text-center font-nx-sans text-nx-cream',
        className,
      )}
    >
      <Gob size={72} className="drop-shadow-[0_18px_40px_rgba(255,210,63,0.18)]" />
      <h1
        id="nx-caught-up"
        className="m-0 mt-5 font-nx-serif text-[44px] font-normal leading-[0.95] md:text-[76px]"
      >
        <span className="block">You’re all caught up.</span>
        <span className="block text-nx-accent">Go touch grass.</span>
      </h1>
      <p className="m-0 mt-4 max-w-[460px] text-[15px] text-white/70 md:text-lg">
        That’s everything your people saved since you last looked.
      </p>
      {waits && onShowWaiting && (
        <p className="m-0 mt-2 text-[15px] text-white/70">
          <span>{`${waits} · `}</span>
          <button
            type="button"
            onClick={onShowWaiting}
            className="font-bold text-nx-accent underline underline-offset-2"
          >
            Show them
          </button>
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/channels"
          className="flex h-12 items-center rounded-full bg-nx-accent px-6 text-[15px] font-extrabold text-black md:h-[52px] md:px-7"
        >
          Browse channels
        </Link>
        <Link
          href="/now"
          className="flex h-12 items-center gap-2 rounded-full bg-[#262320] px-5 text-[15px] font-semibold text-nx-cream md:h-[52px] md:px-6"
        >
          <span aria-hidden className="block h-2 w-2 rounded-full bg-[#ff5a3c]" />
          <span>See what’s live</span>
        </Link>
        <button
          type="button"
          onClick={onWatchAgain}
          className="flex h-12 items-center gap-2 rounded-full border border-white/20 px-5 text-[15px] font-semibold text-nx-cream md:h-[52px] md:px-6"
        >
          <RotateCcw aria-hidden className="h-4 w-4" strokeWidth={2.2} />
          <span>Watch it all again</span>
        </button>
      </div>
    </section>
  )
}
