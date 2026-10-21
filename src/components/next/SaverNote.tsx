'use client'

import { cn } from '@/lib/utils'
import type { Saver } from '@/lib/people/types'
import { personColour } from './moments/people'
import { NxAvatar } from './primitives'
import { saverName } from './savers'

/**
 * A saver's note ("making this Sunday"), for members only: the server only
 * puts `note` on a `Saver` it sends to a signed-in member. Always rendered as
 * text, never HTML.
 *
 * `bubble`: a speech-bubble chip with their face, ringed in their colour, for
 * the theater byline. `quote`: the note under their name in "Who saved it".
 */
export function SaverNote({
  saver,
  variant = 'bubble',
  className,
}: {
  saver: Saver
  variant?: 'bubble' | 'quote'
  className?: string
}) {
  if (!saver.note) return null
  const name = saverName(saver)
  if (variant === 'quote') {
    return (
      <span
        className={cn(
          'block break-words border-l-2 border-nx-accent pl-2.5 text-[14px] leading-[1.35] text-nx-cream',
          className,
        )}
      >
        <span className="sr-only">{saver.isYou ? 'Your note: ' : `${name}’s note: `}</span>
        <span>{`“${saver.note}”`}</span>
      </span>
    )
  }
  const colour = personColour(saver.username)
  return (
    <figure
      className={cn(
        'pointer-events-none m-0 flex max-w-[min(300px,100%)] flex-col items-start self-start [text-shadow:none]',
        className,
      )}
    >
      <span className="flex min-w-0 max-w-full -rotate-[1.5deg] items-center gap-2 rounded-[18px_18px_18px_6px] bg-nx-cream py-1.5 pl-1.5 pr-3.5 text-nx-ink shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
        <span aria-hidden className="block shrink-0">
          <NxAvatar
            author={{ avatarUrl: saver.avatarUrl, handle: saver.username, name }}
            size={26}
            style={{ boxShadow: `0 0 0 2px ${colour}` }}
          />
        </span>
        <figcaption className="line-clamp-2 min-w-0 break-words font-nx-serif text-[19px] leading-[1.1]">
          <span className="sr-only">{saver.isYou ? 'Your note: ' : `${name}’s note: `}</span>
          <span>{saver.note}</span>
        </figcaption>
      </span>
    </figure>
  )
}

/** The note a byline shows: the newest friend's, else your own. */
export function bylineNote(savers: readonly Saver[]): Saver | undefined {
  return savers.find((s) => !s.isYou && s.note) ?? savers.find((s) => s.isYou && s.note)
}
