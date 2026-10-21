import type { CSSProperties } from 'react'
import { cn } from './cn'

/**
 * A classic top-and-bottom meme caption over an illustrated post: real text
 * (so it translates and reads out), uppercase, white with a thick black
 * outline. Sized to the post (`size` is a percentage of its width). Styles
 * are `.nx-meme` in app/globals.css.
 */
export function Meme({
  top,
  bottom,
  size = 8,
  inset,
  className,
}: {
  top?: string
  bottom?: string
  /** Font size as a percentage of the post's width. */
  size?: number
  /** Extra room at the top and bottom (for a byline or a chip), in px. */
  inset?: { top?: number; bottom?: number }
  className?: string
}) {
  return (
    <span
      className={cn('nx-meme', className)}
      style={
        {
          '--meme': size,
          paddingTop: inset?.top,
          paddingBottom: inset?.bottom,
        } as CSSProperties
      }
    >
      <span className="nx-meme-line">{top}</span>
      <span className="nx-meme-line">{bottom}</span>
    </span>
  )
}
