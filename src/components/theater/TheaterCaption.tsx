'use client'

/**
 * Media-post caption: two clamped lines with an ellipsis. Overflow is
 * Read (article mode) in the action row. When Read is offered, tapping
 * the truncated caption opens it too — Watch stays on the pill.
 */

import type { KeyboardEvent, MouseEvent, Ref } from 'react'
import { cn } from '@/lib/utils'
import { TheaterLinkedText } from './TheaterText'
import type { TextLinkRef } from './types'

export interface TheaterCaptionProps {
  captionRef: Ref<HTMLParagraphElement>
  platform: string
  text: string
  hasMedia?: boolean
  links?: TextLinkRef[]
  hideTweetLinks?: boolean
  className?: string
  /** Same as the Read pill. Omit when Read is not offered. */
  onOpenRead?: () => void
}

function eventOnLink(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('a')
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
  const onClick = (event: MouseEvent<HTMLParagraphElement>) => {
    if (!onOpenRead || eventOnLink(event.target)) return
    onOpenRead()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLParagraphElement>) => {
    if (!onOpenRead || eventOnLink(event.target)) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onOpenRead()
  }

  return (
    <p
      ref={captionRef}
      role={onOpenRead ? 'button' : undefined}
      tabIndex={onOpenRead ? 0 : undefined}
      aria-label={onOpenRead ? 'Read the full post' : undefined}
      title={onOpenRead ? 'Read the full post' : undefined}
      onClick={onOpenRead ? onClick : undefined}
      onKeyDown={onOpenRead ? onKeyDown : undefined}
      className={cn(
        'line-clamp-2 text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]',
        onOpenRead && 'cursor-pointer',
        className,
      )}
    >
      <TheaterLinkedText
        platform={platform}
        text={text}
        hasMedia={hasMedia}
        links={links}
        hideTweetLinks={hideTweetLinks}
        bionic={false}
      />
    </p>
  )
}
