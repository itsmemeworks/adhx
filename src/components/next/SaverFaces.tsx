'use client'

import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Saver } from '@/lib/people/types'
import { NxAvatar } from './primitives'
import { orderedSavers, saverName, saversLine } from './savers'

/**
 * Who saved this, for members: up to three overlapping faces and a short line
 * ("Ana and Ben saved this", "You and 2 others"). Never rendered for
 * strangers — the server only sends `savers` to signed-in members.
 *
 * `tone`: `scrim` (white words over media), `plate` (a dark chip over a
 * stage or tile), `cream` (ink words on a cream card).
 */
export function SaverFaces({
  savers,
  tone = 'scrim',
  size = 22,
  compact = false,
  className,
}: {
  savers: readonly Saver[]
  tone?: 'scrim' | 'plate' | 'cream'
  size?: number
  /** Faces only; the line is still spoken. */
  compact?: boolean
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
      <span aria-hidden className="flex shrink-0">
        {faces.map((s, i) => (
          <span
            key={s.username}
            className={cn('block rounded-full border-2', ring, i > 0 && '-ml-2')}
            style={{ zIndex: faces.length - i }}
          >
            <NxAvatar
              author={{ avatarUrl: s.avatarUrl, handle: s.username, name: saverName(s) }}
              size={size}
            />
          </span>
        ))}
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
