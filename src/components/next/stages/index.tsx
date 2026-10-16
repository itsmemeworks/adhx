'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { feedItemAccessibleDescription } from '@/components/feed/feedItemMeta'
import type { FeedItem } from '@/components/feed/types'
import {
  articleHeadline,
  articleLede,
  mediaFallbackSrc,
  mediaImageSrc,
  postAuthor,
  postCoverSrc,
  postText,
} from '../post'
import { NxAvatar, NxImage, Scrim, StageProgress } from '../primitives'
import { ArticleKicker } from '../cards/ArticleTile'

/**
 * Theater stages for the redesign — every kind of post gets its own stage,
 * never a black box. Stages fill their parent (the theater decides the size)
 * and draw the post's cover; pass `media` to swap in a live player.
 */
export interface StageProps {
  item: FeedItem
  /** Replaces the cover image, e.g. a `<video>` element. */
  media?: ReactNode
  /** 0–1 playback / dwell progress; omitted = no bar. */
  progress?: number
  /** Overlay controls (rail, transport) layered above the scrim. */
  children?: ReactNode
  className?: string
}

function StageFrame({
  item,
  className,
  children,
}: {
  item: FeedItem
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={feedItemAccessibleDescription(item)}
      className={cn('relative h-full w-full overflow-hidden font-nx-sans', className)}
    >
      {children}
    </section>
  )
}

/** Author + two-line caption on the scrim at the foot of a media stage. */
function StageCaption({ item, progress }: { item: FeedItem; progress?: number }) {
  const author = postAuthor(item)
  const caption = postText(item)
  return (
    <Scrim className="gap-1.5 px-4 pb-5 pt-40 sm:px-6 sm:pb-6">
      <span className="text-[15px] font-bold">{author.handle || author.name}</span>
      {caption && (
        <span className="line-clamp-2 max-w-[640px] text-[15px] leading-[1.35]">{caption}</span>
      )}
      {progress !== undefined && <StageProgress value={progress} className="mt-2" />}
    </Scrim>
  )
}

/** A tall (portrait) video: full-bleed cover on the pure-black stage. */
export function TallVideoStage({ item, media, progress, children, className }: StageProps) {
  return (
    <StageFrame item={item} className={cn('bg-nx-stage', className)}>
      {media ?? (
        <NxImage
          src={postCoverSrc(item)}
          fallbackSrc={mediaFallbackSrc(item)}
          alt=""
          reveal="fade"
          loading="eager"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <StageCaption item={item} progress={progress} />
      {children}
    </StageFrame>
  )
}

/**
 * Wide video or photo: shown whole (contain), with its own blurred, dimmed
 * colours filling the rest of the stage. `index` picks an album photo.
 */
export function WideMediaStage({
  item,
  media,
  progress,
  children,
  className,
  index = 0,
}: StageProps & { index?: number }) {
  const src = index === 0 ? postCoverSrc(item) : mediaImageSrc(item, index)
  return (
    <StageFrame item={item} className={cn('bg-nx-stage', className)}>
      {src && (
        <img
          src={src}
          alt=""
          aria-hidden
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute -inset-10 h-[calc(100%+80px)] w-[calc(100%+80px)] max-w-none object-cover blur-[34px] brightness-[.45] saturate-[1.2]"
        />
      )}
      {media ?? (
        <NxImage
          src={src}
          fallbackSrc={mediaFallbackSrc(item, index)}
          alt=""
          reveal="fade"
          loading="eager"
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}
      <StageCaption item={item} progress={progress} />
      {children}
    </StageFrame>
  )
}

/** Serif size for the post stage — short posts get poster-sized type. */
export function postStageTypeScale(length: number): string {
  if (length <= 80) return 'text-[clamp(34px,6vw,64px)] leading-[1.05]'
  if (length <= 200) return 'text-[clamp(28px,4.4vw,48px)] leading-[1.1]'
  if (length <= 400) return 'text-[clamp(22px,3.2vw,36px)] leading-[1.15]'
  return 'text-[clamp(19px,2.4vw,28px)] leading-[1.25]'
}

/** A text post: cream, full-bleed, big serif type. Progress is the dark dwell bar. */
export function PostStage({ item, progress, children, className }: Omit<StageProps, 'media'>) {
  const author = postAuthor(item)
  const text = postText(item) || item.quoteContext?.text || ''
  const quote = item.isQuote ? item.quoteContext : null
  return (
    <StageFrame item={item} className={cn('bg-nx-cream text-nx-ink', className)}>
      {/* Scroll box + min-h-full column: centres short posts without clipping the top of long ones. */}
      <div className="h-full w-full overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[880px] flex-col justify-center gap-[18px] px-6 py-9 sm:px-11">
          <span className="flex items-center gap-2.5">
            <NxAvatar author={author} size={38} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-bold">{author.name}</span>
              {author.handle && (
                <span className="truncate text-[13px] text-nx-on-cream">{author.handle}</span>
              )}
            </span>
          </span>
          <p
            className={cn('m-0 whitespace-pre-line font-nx-serif', postStageTypeScale(text.length))}
          >
            {text}
          </p>
          {quote && (
            <span className="flex flex-col gap-1 rounded-2xl border border-nx-bone px-4 py-3">
              <span className="text-[12px] font-semibold text-nx-on-cream">{`@${quote.author}`}</span>
              <span className="line-clamp-3 text-[14px] leading-[1.4]">{quote.text}</span>
            </span>
          )}
          {progress !== undefined && <StageProgress value={progress} tone="dark" />}
        </div>
      </div>
      {children}
    </StageFrame>
  )
}

const READ_BUTTON =
  'inline-flex h-[42px] items-center rounded-full px-4 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nx-accent'

/**
 * An article: cover on the left (top on phones), headline + first lines on the
 * right, and it waits for "Read it here" instead of auto-skipping.
 */
export function ArticleStage({
  item,
  children,
  className,
  onRead,
  onSkip,
}: Omit<StageProps, 'media' | 'progress'> & {
  /** Opens the reader; without it "Read it here" links to the article. */
  onRead?: () => void
  /** Shows "Skip for now". */
  onSkip?: () => void
}) {
  const cover = postCoverSrc(item)
  const href = item.articlePreview?.url || item.tweetUrl
  return (
    <StageFrame
      item={item}
      className={cn('flex flex-col bg-nx-ink text-nx-cream sm:flex-row', className)}
    >
      {cover && (
        <span className="relative block h-[38%] shrink-0 overflow-hidden sm:h-full sm:w-[42%]">
          <NxImage
            src={cover}
            alt=""
            reveal="fade"
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </span>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-6 sm:p-7">
        <ArticleKicker />
        <h2 className="m-0 font-nx-serif text-[clamp(26px,3vw,40px)] font-normal leading-[1.08]">
          {articleHeadline(item)}
        </h2>
        <p className="m-0 line-clamp-6 text-[14px] leading-[1.5] text-nx-soft sm:text-[15px]">
          {articleLede(item)}
        </p>
        <span className="mt-auto flex flex-wrap gap-2 pt-2">
          {onRead ? (
            <button
              type="button"
              onClick={onRead}
              className={cn(READ_BUTTON, 'bg-nx-cream font-bold text-nx-ink')}
            >
              Read it here
            </button>
          ) : (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(READ_BUTTON, 'bg-nx-cream font-bold text-nx-ink')}
            >
              Read it here
            </a>
          )}
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className={cn(READ_BUTTON, 'border border-nx-muted/40 text-nx-cream')}
            >
              Skip for now
            </button>
          )}
        </span>
      </div>
      {children}
    </StageFrame>
  )
}
