'use client'

/**
 * Media-post caption: two clamped lines with an ellipsis. Overflow is
 * opened in Read mode by tapping the truncated caption. Read mode keeps
 * a separate Watch control for returning to full-bleed playback.
 */

import type { Ref } from 'react'
import { cn } from '@/lib/utils'
import { TheaterLinkedText } from './TheaterText'
import type { TextLinkRef } from './types'

export interface TheaterCaptionProps {
  captionRef: Ref<HTMLParagraphElement | HTMLButtonElement | HTMLSpanElement>
  platform: string
  text: string
  hasMedia?: boolean
  links?: TextLinkRef[]
  hideTweetLinks?: boolean
  className?: string
  /** Turns the caption itself into the Read control. */
  onOpenRead?: () => void
}

export function TheaterCaption({
  captionRef,
  platform,
  text,
  hasMedia = true,
  links,
  hideTweetLinks,
  className,
  onOpenRead,
}: TheaterCaptionProps) {
  const classes = cn('line-clamp-2 text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]', className)
  const linkedText = (
    <TheaterLinkedText
      platform={platform}
      text={text}
      hasMedia={hasMedia}
      links={links}
      hideTweetLinks={hideTweetLinks}
      bionic={false}
      linkify={!onOpenRead}
    />
  )

  if (onOpenRead) {
    return (
      <button
        type="button"
        aria-label="Read the full post"
        title="Read the full post"
        onClick={onOpenRead}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
        }}
        className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left"
        data-theater-action="read"
      >
        <span ref={captionRef as Ref<HTMLSpanElement>} className={classes}>
          {linkedText}
        </span>
      </button>
    )
  }

  return (
    <p ref={captionRef as Ref<HTMLParagraphElement>} className={classes}>
      {linkedText}
    </p>
  )
}
