import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Every person's face is the shape of Gob (brand/BRAND.md): a rounded square
 * with corners at 38% of its size, tilted −4°. One shape for photos and
 * generated faces alike; overlapping stacks put their ring (border or
 * box-shadow) on the shape itself so it follows the corners and the tilt.
 *
 * The frame tilts; what's inside is turned back upright and scaled a touch
 * so the tilted corners never show a sliver of background.
 *
 * `GobShape` does both; `gobMask` (the frame, `overflow-hidden` included)
 * and `gobContent` (its upright inside) are for an element that has to be
 * the frame itself, like a picker button. Status dots, live dots, round
 * buttons and badges stay circular.
 */
export const gobMask = 'shrink-0 overflow-hidden rounded-[38%] -rotate-[4deg]'
export const gobContent = 'block h-full w-full rotate-[4deg] scale-[1.04]'

export function GobShape({
  size,
  className,
  style,
  children,
}: {
  /** Pixels; leave out when `className` sizes it. */
  size?: number
  /** Rings and borders go here. */
  className?: string
  style?: CSSProperties
  /** Fills the shape (`h-full w-full`) and stays upright. */
  children: ReactNode
}) {
  return (
    <span
      data-shape="gob"
      className={cn('block', gobMask, className)}
      style={size ? { width: size, height: size, ...style } : style}
    >
      <span className={gobContent}>{children}</span>
    </span>
  )
}
