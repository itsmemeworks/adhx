'use client'

/**
 * Media-post caption: two clamped lines with an ellipsis, tap anywhere on
 * the text to expand, tap again to collapse. Same gesture as X. Links
 * inside still navigate (`TheaterLinkedText` stops those clicks). The
 * surrounding chrome dims the media while this is expanded.
 */

import type { MouseEvent, Ref } from 'react'
import { cn } from '@/lib/utils'
import { TheaterLinkedText } from './TheaterText'
import type { TextLinkRef } from './types'

export interface TheaterCaptionProps {
  captionRef: Ref<HTMLParagraphElement>
  expanded: boolean
  overflowing: boolean
  onToggle: () => void
  platform: string
  text: string
  hasMedia?: boolean
  links?: TextLinkRef[]
  hideTweetLinks?: boolean
  className?: string
  /** Scroll cap once expanded. Desktop uses vh; mobile uses dvh. */
  expandedMaxClass?: string
}

export function TheaterCaption({
  captionRef,
  expanded,
  overflowing,
  onToggle,
  platform,
  text,
  hasMedia = true,
  links,
  hideTweetLinks,
  className,
  expandedMaxClass = 'max-h-[38vh]',
}: TheaterCaptionProps) {
  const expandable = overflowing || expanded

  function handleClick(e: MouseEvent<HTMLParagraphElement>) {
    if (!expandable) return
    e.stopPropagation()
    onToggle()
  }

  return (
    <p
      ref={captionRef}
      aria-expanded={expandable ? expanded : undefined}
      className={cn(
        'text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]',
        expanded ? cn(expandedMaxClass, 'overflow-y-auto overscroll-contain') : 'line-clamp-2',
        expandable && 'cursor-pointer',
        className,
      )}
      onClick={handleClick}
    >
      <TheaterLinkedText
        platform={platform}
        text={text}
        hasMedia={hasMedia}
        links={links}
        hideTweetLinks={hideTweetLinks}
      />
    </p>
  )
}
