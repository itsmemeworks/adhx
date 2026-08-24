'use client'

/**
 * Text/quote tweets typeset large (serif) on the near-black stage; the
 * `photo` variant reuses the same shell with the image full-bleed +
 * bottom-scrim caption (same treatment as `DiscoverCard`'s media cards).
 *
 * Both variants render body text through `TheaterLinkedText` (linkifies URLs,
 * strips media t.co tails, decodes entities, applies Bionic Reading when the
 * preference is on) so long-form X posts — which can run to thousands of
 * characters — never dead-end in unreadable overflow:
 * a short typeset tweet floats in the middle of the stage; a long one
 * (or one with photos/video/a quote) starts below the chrome and scrolls.
 * Overflowing photo captions use Read (article mode), not tap-to-expand.
 */

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { PlatformChip } from '@/components/matter'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { fallbackToOriginal } from '@/components/feed/media-actions'
import { proxiedPhotoSrc } from '@/lib/media/fxembed'
import { TheaterCaption } from './TheaterCaption'
import { TheaterLinkedText } from './TheaterText'
import { dispatchTheaterStageTap } from './useTheaterStageEvents'
import {
  STAGE_ARTICLE_UNDER_BAND_PAD,
  STAGE_TEXT_SCROLL_PAD,
  STAGE_TEXT_TOP_PAD,
  StageAuthorRow,
} from './stage-primitives'
import { StageInlineVideo } from './StageInlineVideo'
import { StageQuoteCard } from './StageQuoteCard'
import { StageLinkCard } from './StageLinkCard'
import { useHydratedQuote } from './useHydratedQuote'
import { stripPreviewUrls, visibleTextForSizing } from '@/lib/theater/link-preview'
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
  /**
   * Full-bleed scroller under the keep-playing video. Transparent so the
   * essay can tuck under the band, with extra top pad so the first line
   * starts below the fade.
   */
  underBand?: boolean
}

/** Compact document type — long notes / numbered lists. Exported for tests. */
export const TYPESET_COMPACT = 'text-[15px] sm:text-base leading-[1.45]'

/**
 * Pure: type size for the typeset variant, scaling down as the text gets
 * longer — a 4th tier for very long (>600 char) posts reads like an article
 * body (smaller, relaxed leading) rather than a shouty wall of large serif
 * type. A 5th compact tier kicks in for X notes and lists (many line breaks
 * or >1500 visible chars) so each line stays a line and the column reads as
 * a scrollable document instead of a truncated shout. Exported for unit testing.
 */
export function textSizeClass(text: string): string {
  const visible = visibleTextForSizing(text)
  // A URL-only tweet is not a short slogan — don't typeset the link at 6xl.
  if (!visible && /https?:\/\//i.test(text)) return 'text-lg sm:text-xl leading-relaxed'
  const len = visible.length
  const lines = text.split(/\r?\n/).length
  if (len > 1500 || lines > 12) return TYPESET_COMPACT
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
  underBand = false,
}: StageTextProps) {
  const text = (item.text || '').trim()
  const authorName = item.authorName || (item.author ? `@${item.author}` : 'Saved post')
  const { quote, parentPhotos, parentVideo } = useHydratedQuote(item)
  const captionRef = useRef<HTMLParagraphElement>(null)

  if (photo) {
    const fallback = stagePhotoSrc(item)
    const photos = parentPhotos.length > 0 ? parentPhotos : fallback ? [fallback] : []
    return (
      <div
        className="relative flex h-full w-full items-center justify-center bg-[#08070a]"
        onClick={() => dispatchTheaterStageTap()}
      >
        {photos.length > 0 ? (
          <StagePhotoBleed photos={photos} fallbackThumb={item.thumbnailUrl ?? null} />
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
  const linkPreview = item.linkPreview
  const bodyText = stripPreviewUrls(text, linkPreview, item.textLinks)
  const typesetClass = textSizeClass(bodyText)
  const compact = typesetClass === TYPESET_COMPACT

  return (
    <div className="relative h-full w-full">
      <div
        className={cn(
          'h-full w-full overflow-y-auto overscroll-contain',
          underBand ? 'bg-transparent' : 'bg-[#08070a]',
          scrollPad && STAGE_TEXT_SCROLL_PAD,
        )}
        data-theater-scroll
      >
        {/* min-h-full + justify-center: a couple of lines sit in the middle
            of the stage; once the column is taller than the viewport the
            flex box grows with it and this becomes a no-op (top-aligned
            scroll, with STAGE_TEXT_TOP_PAD clearing the chrome). Compact
            notes skip the center so a list starts as a document. */}
        <div
          className={cn(
            'flex min-h-full flex-col',
            !compact && !flushTop && !underBand && 'justify-center',
          )}
        >
          <div
            className={cn(
              'mx-auto w-full max-w-2xl px-6 sm:px-10',
              underBand ? STAGE_ARTICLE_UNDER_BAND_PAD : flushTop ? 'pt-5' : STAGE_TEXT_TOP_PAD,
            )}
          >
            <StageAuthorRow item={item} />
            {bodyText ? (
              <p className={cn('break-words font-serif leading-tight text-white', typesetClass)}>
                <TheaterLinkedText
                  platform={item.platform}
                  text={bodyText}
                  hasMedia={parentPhotos.length > 0 || !!parentVideo}
                  links={item.textLinks}
                  hideTweetLinks={hideLinks}
                />
              </p>
            ) : !linkPreview ? (
              <p className={cn('font-serif leading-tight text-white', textSizeClass(''))}>
                <span>Saved post</span>
              </p>
            ) : null}
            {linkPreview ? <StageLinkCard preview={linkPreview} /> : null}
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
      {compact && !underBand ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#08070a] to-transparent"
          aria-hidden
        />
      ) : null}
    </div>
  )
}

/** Full-bleed album: one photo fills the stage; extra photos snap sideways. */
function StagePhotoBleed({
  photos,
  fallbackThumb,
}: {
  photos: string[]
  fallbackThumb: string | null
}) {
  const [index, setIndex] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const scrolledRef = useRef(false)

  if (photos.length === 1) {
    return (
      <img
        src={photos[0]}
        alt=""
        referrerPolicy="no-referrer"
        onError={fallbackToOriginal(fallbackThumb)}
        className="h-full w-full object-contain"
      />
    )
  }

  function goTo(i: number) {
    const el = scrollerRef.current
    const next = Math.max(0, Math.min(photos.length - 1, i))
    // Instant: a smooth scroll fires `onScroll` at 0 first and snaps back.
    if (el?.scrollTo) el.scrollTo({ left: next * el.clientWidth, behavior: 'auto' })
    setIndex(next)
  }

  function goNextPhoto() {
    goTo(index >= photos.length - 1 ? 0 : index + 1)
  }

  return (
    <>
      <div
        ref={scrollerRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={`Photos, ${photos.length}`}
        onPointerDown={() => {
          scrolledRef.current = false
        }}
        onScroll={(e) => {
          const el = e.currentTarget
          scrolledRef.current = true
          if (!el.clientWidth) return
          const next = Math.round(el.scrollLeft / el.clientWidth)
          setIndex(Math.max(0, Math.min(photos.length - 1, next)))
        }}
        onClick={(e) => {
          // Don't also toggle chrome (parent onClick). A swipe's leftover
          // click is ignored so it doesn't jump a photo or hide overlays.
          e.stopPropagation()
          if (scrolledRef.current) return
          const rect = e.currentTarget.getBoundingClientRect()
          const x = (e.clientX - rect.left) / rect.width
          if (x > 0.66) goTo(index + 1)
          else if (x < 0.33) goTo(index - 1)
          else dispatchTheaterStageTap()
        }}
        className="flex h-full w-full snap-x snap-mandatory touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {photos.map((src) => (
          <div key={src} className="h-full w-full min-w-full shrink-0 snap-center">
            <img
              src={src}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
              onError={fallbackToOriginal(fallbackThumb)}
              className="pointer-events-none h-full w-full object-contain"
            />
          </div>
        ))}
      </div>
      {/* Below the mobile top scrim so the control isn't under the header.
          One button — tap advances — with a subtle plate on mobile and a
          stronger frost on desktop (dots vanish on a dark photo otherwise). */}
      <div className="pointer-events-none absolute inset-x-0 top-[max(6.75rem,calc(env(safe-area-inset-top)+5.75rem))] z-10 flex justify-center lg:top-auto lg:bottom-8">
        <button
          type="button"
          aria-label={`Next photo, ${index + 1} of ${photos.length}`}
          onClick={(e) => {
            e.stopPropagation()
            goNextPhoto()
          }}
          className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/20 bg-black/40 px-2.5 py-1.5 backdrop-blur-md lg:border-white/30 lg:bg-black/80"
        >
          {photos.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                'rounded-full',
                i === index ? 'h-1.5 w-1.5 bg-white' : 'h-1.5 w-1.5 bg-white/40',
              )}
            />
          ))}
        </button>
      </div>
    </>
  )
}
