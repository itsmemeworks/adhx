'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { FeedItem } from '@/components/feed/types'
import { feedItemAccessibleDescription } from '@/components/feed/feedItemMeta'
import { cn } from '@/lib/utils'

export interface TileProps {
  item: FeedItem
  /** Makes the whole tile one button (opens the post). */
  onClick?: () => void
  className?: string
}

/**
 * Outer box shared by every tile. Tiles in a row share one height
 * (`--nx-tile-h`, default 340px) and take their width from `aspect`, so a
 * row reads as one strip while each shape follows its post.
 */
export function TileFrame({
  item,
  onClick,
  className,
  aspect,
  clip = true,
  children,
}: TileProps & {
  /** width / height at the default 340px height, e.g. `200 / 340`. */
  aspect: number
  /** Off for the photo album, whose stacked edges sit outside the card. */
  clip?: boolean
  children: ReactNode
}) {
  // Width is derived from the shared height (not `aspect-ratio`), so a
  // stretching or shrinking flex parent can't squeeze the tile.
  const style: CSSProperties = { width: `calc(var(--nx-tile-h, 340px) * ${aspect.toFixed(4)})` }
  const base = cn(
    'relative block h-[var(--nx-tile-h,340px)] shrink-0 rounded-nx-tile text-left font-nx-sans',
    clip && 'overflow-hidden',
    className,
  )
  const label = feedItemAccessibleDescription(item)
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        style={style}
        className={cn(
          base,
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nx-accent',
        )}
      >
        {children}
      </button>
    )
  }
  return (
    <article aria-label={label} style={style} className={base}>
      {children}
    </article>
  )
}
