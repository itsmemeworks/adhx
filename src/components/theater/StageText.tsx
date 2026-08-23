'use client'

/**
 * Text/quote tweets typeset large (serif) on the near-black stage; the
 * `photo` variant reuses the same shell with the image full-bleed +
 * bottom-scrim caption (same treatment as `DiscoverCard`'s media cards).
 *
 * Both variants render body text through `TheaterLinkedText` (linkifies URLs,
 * strips media t.co tails, decodes entities) so long-form X posts — which can
 * run to thousands of characters — never dead-end in unreadable overflow:
 * a short typeset tweet floats in the middle of the stage; a long one
 * (or one with photos/video/a quote) starts below the chrome and scrolls.
 * Overflowing photo captions use Read (article mode), not tap-to-expand.
 */

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { PlatformChip } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { fallbackToOriginal } from '@/components/feed/media-actions'
import { proxiedPhotoSrc } from '@/lib/media/fxembed'
import { TheaterCaption } from './TheaterCaption'
import { TheaterLinkedText } from './TheaterText'
import { STAGE_TEXT_SCROLL_PAD, STAGE_TEXT_TOP_PAD, StageAuthorRow } from './stage-primitives'
import { StageInlineVideo } from './StageInlineVideo'
import { StageQuoteCard } from './StageQuoteCard'
import { useHydratedQuote } from './useHydratedQuote'
import type { TheaterItem } from './types'

/** Twitter photos go through `/api/media/image` — pbs.twimg.com often 403s off twitter.com. */
export function stagePhotoSrc(
  item: Pick<TheaterItem, 'platform' | 'author' | 'bookmarkId' | 'thumbnailUrl'>,
): string | null {
  if (item.platform === 'twitter' && item.author && item.bookmarkId) {
    return proxiedPhotoSrc(item.author, item.bookmarkId)
  }
  return item.thumbnailUrl ?? null
}

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
  /**
   * Extra bottom padding so the last lines clear the overlay action row.
   * Default true. Collection quote wraps StageText in its own scroller
   * (quote card is a sibling) and turns this off to avoid a double gap.
   */
  scrollPad?: boolean
  /**
   * Parent video is already playing in the band above this reader — don't
   * mount a second player.
   */
  omitParentVideo?: boolean
  /**
   * Sit under a live video band: skip the chrome-clearing top pad and
   * don't vertically center a short tweet.
   */
  flushTop?: boolean
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
  scrollPad = true,
  omitParentVideo = false,
  flushTop = false,
}: StageTextProps) {
  const text = (item.text || '').trim()
  const authorName = item.authorName || (item.author ? `@${item.author}` : 'Saved post')
  const { quote, parentPhotos, parentVideo } = useHydratedQuote(item)
  const captionRef = useRef<HTMLParagraphElement>(null)

  if (photo) {
    const src = stagePhotoSrc(item)
    return (
      <div className="relative flex h-full w-full items-center justify-center bg-[#08070a]">
        {src ? (
          <img
            src={src}
            alt=""
            referrerPolicy="no-referrer"
            onError={fallbackToOriginal(item.thumbnailUrl)}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {photoCaption ? (
              <p className="max-w-2xl px-8 text-center font-serif text-3xl text-white/80">
                {text || 'Photo'}
              </p>
            ) : (
              <p className="text-sm text-white/40">Photo</p>
            )}
          </div>
        )}

        {/* Bottom scrim: author + 2-line caption. Overflow goes through
            Read in the chrome, not tap-to-expand. Suppressed when
            `photoCaption` is false (TheaterShell) — chrome already shows
            the author + caption. */}
        {photoCaption && (
          <div
            className="absolute inset-x-0 bottom-0 px-6 pb-6 pt-16 sm:px-10 sm:pb-10"
            style={{
              background: 'linear-gradient(transparent, rgba(11,11,17,.84))',
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
              <TheaterCaption
                captionRef={captionRef}
                platform={item.platform}
                text={text}
                links={item.textLinks}
                hideTweetLinks={hideTweetLinks}
                className="text-[15px] leading-snug"
              />
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
  const hideLinks = hideTweetLinks || !!quote

  return (
    <div
      className={cn(
        'h-full w-full overflow-y-auto overscroll-contain bg-[#08070a]',
        scrollPad && STAGE_TEXT_SCROLL_PAD,
      )}
    >
      {/* min-h-full + justify-center: a couple of lines sit in the middle
          of the stage; once the column is taller than the viewport the
          flex box grows with it and this becomes a no-op (top-aligned
          scroll, with STAGE_TEXT_TOP_PAD clearing the chrome). */}
      <div className={cn('flex min-h-full flex-col', !flushTop && 'justify-center')}>
        <div
          className={cn(
            'mx-auto w-full max-w-2xl px-6 sm:px-10',
            flushTop ? 'pt-5' : STAGE_TEXT_TOP_PAD,
          )}
        >
          <StageAuthorRow item={item} />
          <p className={cn('font-serif leading-tight text-white', textSizeClass(text || ''))}>
            {text ? (
              <TheaterLinkedText
                platform={item.platform}
                text={text}
                hasMedia={parentPhotos.length > 0 || !!parentVideo}
                links={item.textLinks}
                hideTweetLinks={hideLinks}
              />
            ) : (
              'Saved post'
            )}
          </p>
          {parentVideo && !omitParentVideo ? (
            <StageInlineVideo
              author={parentVideo.author}
              bookmarkId={parentVideo.bookmarkId}
              poster={parentVideo.poster}
              testId="parent-inline-video"
            />
          ) : null}
          {parentPhotos.length > 0 ? (
            <div
              className={cn(
                'mt-5 grid gap-2',
                parentPhotos.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
              )}
            >
              {parentPhotos.map((src) => (
                <img
                  key={src}
                  src={src}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={fallbackToOriginal(item.thumbnailUrl)}
                  className="max-h-[60vh] w-full rounded-xl object-contain"
                />
              ))}
            </div>
          ) : null}
          {quote ? <StageQuoteCard quote={quote} /> : null}
        </div>
      </div>
    </div>
  )
}
