'use client'

/**
 * Text/quote tweets typeset large (serif) on the near-black stage; the
 * `photo` variant reuses the same shell with the image full-bleed +
 * bottom-scrim caption (same treatment as `DiscoverCard`'s media cards).
 *
 * Both variants render body text through `TheaterLinkedText` (linkifies URLs,
 * strips media t.co tails, decodes entities) so long-form X posts — which can
 * run to thousands of characters — never dead-end in unreadable overflow:
 * the typeset variant scrolls within a capped region once it outgrows the
 * stage, and the photo caption gets a "more" toggle into a scrollable panel.
 */

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { PlatformChip } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { TheaterLinkedText } from './TheaterText'
import type { TheaterItem } from './types'

export interface StageTextProps {
  item: TheaterItem
  /** When set, render the photo variant (image full-bleed + caption). */
  photo?: boolean
  /**
   * Photo variant only: show the author+caption scrim over the image.
   * Default true (CollectionTheater's stages, whose rail has no now-playing
   * text of its own). TheaterShell passes false since its rail (desktop) and
   * mobile chrome already render the author + caption — the stage's own
   * scrim would just duplicate them.
   */
  photoCaption?: boolean
  /**
   * The surface below already renders the referenced tweet content (e.g. a
   * quote card), so tweet-resolving links in `item.text` should be stripped
   * (spec §6b). Defaults to false — most stages render no quote card of
   * their own, so a tweet link is the only path to that content.
   */
  hideTweetLinks?: boolean
}

/**
 * Compact quote card for the typeset stage, shown under the main text when
 * `item.quote` is present — same dark vocabulary as CollectionTheater's
 * `StageQuoteCard` (bordered rounded box, avatar-or-initial + name + @handle,
 * up-to-4-line clamped text), rebuilt locally since CollectionTheater isn't
 * shared code.
 */
function StageQuoteCard({ quote }: { quote: NonNullable<TheaterItem['quote']> }) {
  const name = quote.authorName || quote.author || 'unknown'
  const handle = quote.author || ''
  const text = (quote.text || '').trim()
  if (!text && !handle) return null

  return (
    <div className="mt-4 w-full max-w-2xl rounded-xl border border-white/15 bg-white/[0.04] p-4">
      <div className="mb-2 flex items-center gap-2">
        <AuthorAvatar src={quote.authorAvatarUrl ?? undefined} author={handle} size="sm" />
        <span className="truncate text-[13px] font-semibold text-white">{name}</span>
        {handle && <span className="truncate font-mono text-xs text-white/50">@{handle}</span>}
      </div>
      {text && (
        <p className="line-clamp-4 text-[13.5px] leading-snug text-white/80">
          <TheaterLinkedText text={text} />
        </p>
      )}
    </div>
  )
}

/**
 * Pure: type size for the typeset variant, scaling down as the text gets
 * longer — a 4th tier for very long (>600 char) posts reads like an article
 * body (smaller, relaxed leading) rather than a shouty wall of large serif
 * type. Exported for unit testing.
 */
export function textSizeClass(text: string): string {
  const len = text.length
  if (len <= 80) return 'text-4xl sm:text-5xl lg:text-6xl'
  if (len <= 180) return 'text-3xl sm:text-4xl lg:text-5xl'
  if (len <= 600) return 'text-xl sm:text-2xl lg:text-3xl'
  return 'text-lg sm:text-xl leading-relaxed'
}

export function StageText({
  item,
  photo,
  photoCaption = true,
  hideTweetLinks = false,
}: StageTextProps) {
  const text = (item.text || '').trim()
  const authorName = item.authorName || (item.author ? `@${item.author}` : 'Saved post')

  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const captionRef = useRef<HTMLParagraphElement>(null)

  // New item — collapse back to the clamped caption.
  useEffect(() => {
    setExpanded(false)
  }, [text])

  // Overflow detection only makes sense against the clamped (2-line) layout,
  // so skip while expanded — the expand effect above will flip `expanded`
  // back to false on the next item, re-triggering this via the dependency.
  useEffect(() => {
    if (expanded) return
    const el = captionRef.current
    setOverflowing(!!el && el.scrollHeight > el.clientHeight + 1)
  }, [text, expanded])

  if (photo) {
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-[#08070a]">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <p className="max-w-2xl px-8 text-center font-serif text-3xl text-white/80">
              {text || 'Photo'}
            </p>
          </div>
        )}

        {/* Bottom scrim: author + up-to-2-line caption. Padding on the
            wrapper, line-clamp on a child with no vertical padding, so the
            clamp doesn't let a clipped extra line peek through. Expanding
            grows the caption into a scrollable panel over a stronger scrim.
            Suppressed when `photoCaption` is false (TheaterShell) — its rail
            (desktop) and mobile chrome already show the author + caption, so
            the stage's own scrim would just duplicate them. */}
        {photoCaption && (
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 px-6 pt-16 sm:px-10',
              expanded ? 'pb-4 sm:pb-6' : 'pb-6 sm:pb-10',
            )}
            style={{
              background: expanded
                ? 'linear-gradient(transparent, rgba(8,7,10,.94) 25%, rgba(8,7,10,.94))'
                : 'linear-gradient(transparent, rgba(11,11,17,.84))',
            }}
          >
            <div className="mb-2 flex items-center gap-2.5">
              <AuthorAvatar
                src={item.authorAvatarUrl ?? undefined}
                author={item.author}
                size="sm"
              />
              <span className="truncate text-[13.5px] font-semibold text-white">{authorName}</span>
              <PlatformChip platform={item.platform} />
            </div>
            {text && (
              <div>
                <p
                  ref={captionRef}
                  data-theater-scroll={expanded || undefined}
                  className={cn(
                    'text-[15px] leading-snug text-white/90',
                    expanded
                      ? 'max-h-[45vh] touch-pan-y overflow-y-auto overscroll-contain pr-1'
                      : 'line-clamp-2',
                  )}
                >
                  <TheaterLinkedText
                    text={text}
                    hasMedia
                    links={item.textLinks}
                    hideTweetLinks={hideTweetLinks}
                  />
                </p>
                {overflowing && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpanded((v) => !v)
                    }}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className="mt-1 flex min-h-[44px] items-center text-[13px] font-semibold text-clay"
                  >
                    {expanded ? 'less' : 'more'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // When the post carries a quote (spec §6b), the quote card below the text
  // already renders the referenced tweet, so its trailing tweet-resolving
  // link in `item.text` is stripped too — OR'd with any caller-supplied
  // `hideTweetLinks` rather than replacing it.
  const hideLinks = hideTweetLinks || !!item.quote

  return (
    <div className="flex h-full w-full items-center justify-center bg-[#08070a] px-6 sm:px-10">
      <div className="max-h-full w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <AuthorAvatar src={item.authorAvatarUrl ?? undefined} author={item.author} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold text-white">{authorName}</div>
            {item.author && (
              <div className="truncate font-mono text-sm text-white/50">@{item.author}</div>
            )}
          </div>
          <PlatformChip platform={item.platform} />
        </div>
        {/* Capped + scrollable so a long-form post never overflows off-stage;
            short posts (the common case) size to content and stay centered
            by the outer flex, exactly as before. `data-theater-scroll` opts
            this out of the stage swipe gesture unconditionally — even a
            short, non-overflowing post should support native text selection
            and copying, not just long ones. */}
        <div
          data-theater-scroll
          className="max-h-[70vh] touch-pan-y overflow-y-auto overscroll-contain pr-2 sm:pr-3"
        >
          <p className={cn('font-serif leading-tight text-white', textSizeClass(text || ''))}>
            {text ? (
              <TheaterLinkedText
                text={text}
                hasMedia={false}
                links={item.textLinks}
                hideTweetLinks={hideLinks}
              />
            ) : (
              'Saved post'
            )}
          </p>
          {item.quote && <StageQuoteCard quote={item.quote} />}
        </div>
      </div>
    </div>
  )
}
