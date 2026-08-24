'use client'

/**
 * Media-post caption: two clamped lines with an ellipsis. Overflow is
 * Read (article mode) in the action row — no tap-to-expand, no dim overlay.
 */

import type { Ref } from 'react'
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
}

export function TheaterCaption({
  captionRef,
  platform,
  text,
  hasMedia = true,
  links,
  hideTweetLinks,
  className,
}: TheaterCaptionProps) {
  return (
    <p
      ref={captionRef}
      className={cn('line-clamp-2 text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,.6)]', className)}
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
