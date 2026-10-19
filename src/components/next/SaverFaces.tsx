'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ChevronRight, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Saver } from '@/lib/people/types'
import { timeAgo } from './moments/live'
import { NxAvatar } from './primitives'
import { orderedSavers, saverHref, saverName, saversLine, savesOf } from './savers'

/**
 * Who saved this, for members: up to three overlapping faces and a short line
 * ("Ana and Ben saved this", "You and 2 others"). Never rendered for
 * strangers — the server only sends `savers` to signed-in members.
 *
 * `tone`: `scrim` (white words over media), `plate` (a dark chip over a
 * stage or tile), `cream` (ink words on a cream card).
 *
 * `linked`: tapping a face opens that friend's channel (yours: My saves).
 * Safe inside another link (a search tile): the faces are `role="link"`
 * spans that stop the tile's own click.
 */
export function SaverFaces({
  savers,
  tone = 'scrim',
  size = 22,
  compact = false,
  linked = false,
  className,
}: {
  savers: readonly Saver[]
  tone?: 'scrim' | 'plate' | 'cream'
  size?: number
  /** Faces only; the line is still spoken. */
  compact?: boolean
  /** Each face opens that person's channel. */
  linked?: boolean
  className?: string
}) {
  if (savers.length === 0) return null
  const line = saversLine(savers)
  const faces = orderedSavers(savers).slice(0, 3)
  const ring =
    tone === 'cream' ? 'border-nx-cream' : tone === 'plate' ? 'border-[#1c1b19]' : 'border-black/60'
  return (
    <span
      title={line}
      className={cn(
        'flex min-w-0 items-center gap-1.5',
        tone === 'plate' && 'nx-plate h-7 rounded-full pl-1 pr-2.5 text-white',
        tone === 'scrim' && 'text-white',
        tone === 'cream' && 'text-nx-ink',
        compact && tone === 'plate' && 'pr-1',
        className,
      )}
    >
      <span aria-hidden={linked ? undefined : true} className="flex shrink-0">
        {faces.map((s, i) => {
          const face = (
            <NxAvatar
              author={{ avatarUrl: s.avatarUrl, handle: s.username, name: saverName(s) }}
              size={size}
            />
          )
          const frame = cn('block rounded-full border-2', ring, i > 0 && '-ml-2')
          return linked ? (
            <FaceLink
              key={s.username}
              saver={s}
              className={cn(frame, 'pointer-events-auto cursor-pointer')}
              style={{ zIndex: faces.length - i }}
            >
              {face}
            </FaceLink>
          ) : (
            <span key={s.username} className={frame} style={{ zIndex: faces.length - i }}>
              {face}
            </span>
          )
        })}
      </span>
      <span className={cn('truncate text-[12px] font-bold', compact && 'sr-only')}>{line}</span>
    </span>
  )
}

/** The small lock on a post kept just for you. */
export function PrivateLock({
  className,
  tone = 'plate',
}: {
  className?: string
  tone?: 'plate' | 'scrim' | 'cream'
}) {
  return (
    <span
      role="img"
      aria-label="Just for me"
      title="Just for me"
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
        tone === 'plate' && 'nx-plate text-white',
        tone === 'scrim' && 'bg-black/35 text-white',
        tone === 'cream' && 'bg-nx-ink/10 text-nx-ink',
        className,
      )}
    >
      <Lock aria-hidden className="h-3 w-3" strokeWidth={2.6} />
    </span>
  )
}

/**
 * A face that opens that person's channel. A span with `role="link"`, so it
 * can sit inside a tile that is itself a link; it stops the tile's click.
 */
function FaceLink({
  saver,
  className,
  style,
  children,
}: {
  saver: Saver
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const go = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    window.location.assign(saverHref(saver))
  }
  return (
    <span
      role="link"
      tabIndex={0}
      aria-label={savesOf(saver)}
      title={savesOf(saver)}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter') go(e)
      }}
      className={cn(
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-nx-accent',
        className,
      )}
      style={style}
    >
      {children}
    </span>
  )
}

/**
 * The faces as a button that opens "Who saved it": each saver, when they
 * saved it, and a link to their channel (yours: My saves). For the theater.
 * `placement`: open above the faces (a byline at the bottom) or below (chips
 * at the top).
 */
export function SaversButton({
  savers,
  tone = 'scrim',
  placement = 'above',
  className,
  facesClassName,
}: {
  savers: readonly Saver[]
  tone?: 'scrim' | 'plate'
  placement?: 'above' | 'below'
  className?: string
  /** Passed to the faces themselves. */
  facesClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const root = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  // The popover lives on <body> (chip rows clip, blurred headers trap fixed
  // children), placed against the faces when it opens.
  const place = () => {
    const rect = root.current?.getBoundingClientRect()
    if (!rect) return
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - 348))
    setAt(
      placement === 'above'
        ? { left, bottom: window.innerHeight - rect.top + 12 }
        : { left, top: rect.bottom + 12 },
    )
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!root.current?.contains(target) && !panel.current?.contains(target)) setOpen(false)
    }
    const onMove = () => setOpen(false)
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  if (savers.length === 0) return null
  const list = orderedSavers(savers)
  const others = list.filter((s) => !s.isYou).length
  return (
    <span ref={root} className={cn('pointer-events-auto relative flex min-w-0', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (!open) place()
          setOpen((o) => !o)
        }}
        className="flex min-w-0 rounded-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-nx-accent"
      >
        <SaverFaces savers={savers} tone={tone} className={cn('max-w-full', facesClassName)} />
      </button>
      {open &&
        at &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="Who saved it"
            style={at}
            className="fixed z-[60] flex w-[min(336px,calc(100vw-24px))] flex-col gap-0.5 rounded-[22px] border border-white/10 bg-nx-surface p-2 font-nx-sans text-nx-cream shadow-[0_24px_60px_rgba(0,0,0,0.65)] [text-shadow:none]"
          >
            <span className="px-3 pb-1.5 pt-2.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white/55">
              Who saved it
            </span>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {list.map((s, i) => (
                <li
                  key={s.username}
                  className={cn(
                    'flex gap-3 rounded-[14px] px-3 py-2.5',
                    i === 0 && 'bg-white/[0.06]',
                  )}
                >
                  <NxAvatar
                    author={{ avatarUrl: s.avatarUrl, handle: s.username, name: saverName(s) }}
                    size={40}
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-[15px] font-extrabold">{saverName(s)}</span>
                      <span className="shrink-0 text-[13px] text-white/55">
                        {timeAgo(s.savedAt)}
                      </span>
                    </span>
                    <Link
                      href={saverHref(s)}
                      className="flex items-center gap-1 text-[13px] font-semibold text-nx-accent hover:underline"
                    >
                      <span>{s.isYou ? 'See your saves' : `See ${savesOf(s)}`}</span>
                      <ChevronRight aria-hidden className="h-3.5 w-3.5" />
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
            {others > 0 && list.length > 1 && (
              <span className="mt-1 flex items-center gap-2.5 border-t border-white/10 px-3 pb-2 pt-3 text-sm font-semibold text-white/70">
                <SaverFaces
                  savers={savers}
                  tone="plate"
                  size={18}
                  compact
                  className="!h-auto !bg-transparent !p-0"
                />
                <span>{`Saved by ${list.length} of your people`}</span>
              </span>
            )}
          </div>,
          document.body,
        )}
    </span>
  )
}
