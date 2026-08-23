'use client'

import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { authorProfileUrl } from '@/lib/activity/preview-path'
import { cn } from '@/lib/utils'
import { StageInlineVideo } from './StageInlineVideo'
import { TheaterLinkedText } from './TheaterText'
import type { TheaterQuoteRef } from './types'

export function StageQuoteCard({
  quote,
  className,
}: {
  quote: TheaterQuoteRef
  className?: string
}) {
  const name = quote.authorName || quote.author || 'unknown'
  const handle = (quote.author || '').replace(/^@+/, '')
  const text = (quote.text || '').trim()
  const photos = quote.hasVideo
    ? (quote.photoUrls ?? [])
    : quote.photoUrls?.length
      ? quote.photoUrls
      : quote.thumbnailUrl
        ? [quote.thumbnailUrl]
        : []
  const quoteVideo =
    quote.hasVideo && handle && quote.bookmarkId
      ? { author: handle, bookmarkId: quote.bookmarkId, poster: quote.thumbnailUrl }
      : null
  const profileUrl = authorProfileUrl('twitter', handle)
  if (!text && !handle && photos.length === 0 && !quoteVideo) return null

  const inner = (
    <>
      <AuthorAvatar src={quote.authorAvatarUrl ?? undefined} author={handle} size="sm" />
      <span className="min-w-0 truncate text-[13px] font-semibold text-white">{name}</span>
      {handle ? <span className="truncate font-mono text-xs text-white/50">@{handle}</span> : null}
    </>
  )

  return (
    <div
      className={cn('mt-5 w-full rounded-xl border border-white/15 bg-white/[0.04] p-4', className)}
    >
      <div className="mb-2 flex items-center gap-2">
        {profileUrl ? (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-85"
            title={`View @${handle} on X`}
          >
            {inner}
          </a>
        ) : (
          <div className="flex min-w-0 items-center gap-2">{inner}</div>
        )}
      </div>
      {text ? (
        <p className="text-[15px] leading-relaxed text-white/90">
          <TheaterLinkedText
            text={text}
            platform="twitter"
            hasMedia={photos.length > 0 || !!quoteVideo}
          />
        </p>
      ) : null}
      {quoteVideo ? (
        <StageInlineVideo
          author={quoteVideo.author}
          bookmarkId={quoteVideo.bookmarkId}
          poster={quoteVideo.poster}
          testId="quote-inline-video"
        />
      ) : null}
      {photos.length > 0 ? (
        <div className={cn('mt-3 grid gap-2', photos.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {photos.map((src) => (
            <img
              key={src}
              src={src}
              alt=""
              referrerPolicy="no-referrer"
              data-testid="quote-photo"
              className="max-h-[52vh] w-full rounded-lg object-contain"
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
