'use client'

/**
 * The triage-collection-tab stage dispatcher (docs/specs/unified-theater-triage.md
 * §2). `TheaterItem` (== `TrendingItem`) is deliberately narrower than the
 * authed `FeedItem` — no `media[]`, `quotedTweet`, or `quoteContext` — so
 * this renders straight off the ORIGINAL `FeedItem` (ported verbatim from the
 * deleted `CollectionTheater.tsx`'s `CollectionStage`/`StageQuoteCard`)
 * rather than round-tripping through `feedItemToTheaterItem()`, which would
 * downgrade long (>5min) tweet videos to plain MP4 (losing the HLS proxy
 * that avoids Fly.io's 60s timeout) and drop quote cards entirely.
 */

import type { FeedItem } from '@/components/feed/types'
import { VideoPlayer } from '@/components/feed/VideoPlayer'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { reelVideoSrc } from '@/components/feed/video-src'
import { Stage } from './Stage'
import { StageText } from './StageText'
import { TheaterLinkedText } from './TheaterText'
import { StageArticle } from './StageArticle'
import { StageInstagram } from './StageInstagram'
import { StageYouTube } from './StageYouTube'
import { StageVideo } from './StageVideo'
import { feedItemToTheaterItem } from './collection-item'

/** Fetch the sendable MP4 duration hint (seconds) for the VideoPlayer fast-path, if known. */
function durationSecondsOf(item: FeedItem): number | undefined {
  const ms = item.media?.[0]?.durationMs
  return typeof ms === 'number' && ms > 0 ? ms / 1000 : undefined
}

/** Minimal inline quote card for the stage — dark-themed, compact. There is no
 * exported `QuoteCard` (the equivalent view in `MediaCard.tsx` is a private,
 * light-surface-only component), so this is a small purpose-built variant. */
function TriageQuoteCard({ item }: { item: FeedItem }) {
  const q = item.quotedTweet
  const qc = item.quoteContext
  const qName = q?.authorName || q?.author || qc?.authorName || qc?.author || 'unknown'
  const qHandle = q?.author || qc?.author || ''
  const qText = q?.text || qc?.text || ''
  const qHasMedia = !!(q?.media?.length || qc?.media?.photos?.length || qc?.media?.videos?.length)
  if (!qText && !qHandle) return null
  return (
    <div className="mt-4 w-full max-w-2xl rounded-xl border border-white/15 bg-white/[0.04] p-4">
      <div className="mb-2 flex items-center gap-2">
        <AuthorAvatar
          src={q?.authorProfileImageUrl || qc?.authorProfileImageUrl}
          author={qHandle}
          size="sm"
        />
        <span className="truncate text-[13px] font-semibold text-white">{qName}</span>
        {qHandle && <span className="truncate font-mono text-xs text-white/50">@{qHandle}</span>}
      </div>
      {qText && (
        <p className="line-clamp-4 text-[13.5px] leading-snug text-white/80">
          <TheaterLinkedText text={qText} hasMedia={qHasMedia} platform="twitter" />
        </p>
      )}
    </div>
  )
}

export interface TriageStageProps {
  feedItem: FeedItem
  muted: boolean
  onRequestUnmute: () => void
}

/** Dispatches the right stage variant for the current triage `FeedItem`,
 * converting to `TheaterItem` for the read-only theater stages and using
 * `VideoPlayer` (HLS-aware) directly for twitter video. */
export function TriageStage({ feedItem, muted, onRequestUnmute }: TriageStageProps) {
  const theaterItem = feedItemToTheaterItem(feedItem)
  const platform = feedItem.platform ?? 'twitter'
  const primary = feedItem.media?.[0]
  const isVideo = primary?.mediaType === 'video' || primary?.mediaType === 'animated_gif'

  if (platform === 'instagram') {
    return <StageInstagram item={theaterItem} muted={muted} onRequestUnmute={onRequestUnmute} />
  }

  if (platform === 'youtube') {
    return <StageYouTube item={theaterItem} />
  }

  if (platform === 'twitter' && isVideo) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#08070a]">
        <VideoPlayer
          author={feedItem.author}
          tweetId={feedItem.id}
          tweetUrl={feedItem.tweetUrl}
          poster={primary?.thumbnailUrl}
          duration={durationSecondsOf(feedItem)}
          platform="twitter"
          loop
          autoPlay
          className="h-full max-h-full w-auto max-w-full object-contain"
        />
      </div>
    )
  }

  if (platform === 'tiktok' && isVideo) {
    return (
      <StageVideo
        item={theaterItem}
        src={reelVideoSrc(theaterItem)}
        poster={theaterItem.thumbnailUrl ?? null}
        muted={muted}
        onRequestUnmute={onRequestUnmute}
      />
    )
  }

  if (theaterItem.contentType === 'article') {
    return <StageArticle item={theaterItem} />
  }

  if (theaterItem.contentType === 'photo') {
    return <StageText item={theaterItem} photo />
  }

  if (theaterItem.contentType === 'quote') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center overflow-y-auto bg-[#08070a] px-6 py-10 sm:px-10">
        <StageText item={theaterItem} hideTweetLinks />
        <TriageQuoteCard item={feedItem} />
      </div>
    )
  }

  return <StageText item={theaterItem} />
}

/** Re-exported so callers never need to import the generic `<Stage/>` just to
 * fall back to it for the triage "Pile clear" / null-item case. */
export { Stage }
