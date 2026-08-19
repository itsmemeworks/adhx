'use client'

/**
 * Linkified text for the theater's dark surfaces — the shared primitive every
 * theater text site renders through (StageText, the rails' now-playing, the
 * mobile caption, the quote card), so URLs are clickable everywhere and the
 * styling stays consistent. Mirrors what `renderTextWithLinks` does for the
 * light feed surfaces (`src/components/feed/utils.tsx`) but styled for the
 * near-black stage (clay links) and built on a pure, unit-testable splitter.
 *
 * Media `t.co` tails are stripped when the post carries media (same
 * `stripMediaUrls` the feed cards use) — a video caption ending in its own
 * media link reads like a bug.
 */

import React from 'react'
import { cn } from '@/lib/utils'
import { decodeHtmlEntities, stripMediaUrls } from '@/components/feed/utils'

const URL_PATTERN = /(https?:\/\/[^\s]+)/g
const DISPLAY_URL_MAX = 40

export type TextPart = { type: 'text'; value: string } | { type: 'link'; href: string }

/**
 * Pure: split a line into text/link parts. Exported for tests — the component
 * below is a thin renderer over this.
 */
export function splitTextParts(line: string): TextPart[] {
  const parts: TextPart[] = []
  for (const piece of line.split(URL_PATTERN)) {
    if (!piece) continue
    URL_PATTERN.lastIndex = 0
    if (URL_PATTERN.test(piece)) {
      parts.push({ type: 'link', href: piece })
    } else {
      parts.push({ type: 'text', value: piece })
    }
    URL_PATTERN.lastIndex = 0
  }
  return parts
}

/** Pure: the shortened label a link renders as. */
export function displayUrl(href: string): string {
  return href.length > DISPLAY_URL_MAX ? `${href.slice(0, DISPLAY_URL_MAX)}...` : href
}

export interface TheaterLinkedTextProps {
  text: string
  /** Strip trailing media t.co links (pass true when the post has media). */
  hasMedia?: boolean
  className?: string
  /** Link styling override — defaults to clay-on-dark. */
  linkClassName?: string
}

/**
 * Renders text with URLs as real anchors. Clicks on links stop propagation so
 * they never trigger the surrounding stage/rail tap handlers (unmute, play,
 * row select, swipe taps).
 */
export function TheaterLinkedText({
  text,
  hasMedia = false,
  className,
  linkClassName,
}: TheaterLinkedTextProps) {
  const cleaned = stripMediaUrls(decodeHtmlEntities(text), hasMedia)
  const lines = cleaned.split('\n')

  return (
    <span className={className}>
      {lines.map((line, lineIndex) => (
        <React.Fragment key={lineIndex}>
          {lineIndex > 0 && <br />}
          {splitTextParts(line).map((part, i) =>
            part.type === 'link' ? (
              <a
                key={i}
                href={part.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                className={cn(
                  'break-all underline decoration-clay/50 underline-offset-2 transition-colors hover:decoration-clay',
                  linkClassName ?? 'text-clay',
                )}
              >
                {displayUrl(part.href)}
              </a>
            ) : (
              <React.Fragment key={i}>{part.value}</React.Fragment>
            ),
          )}
        </React.Fragment>
      ))}
    </span>
  )
}
