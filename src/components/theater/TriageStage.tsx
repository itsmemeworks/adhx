'use client'

/**
 * The triage-collection-tab stage dispatcher (docs/specs/unified-theater-triage.md
 * §2). `TheaterItem` (== `TrendingItem`) is deliberately narrower than the
 * authed `FeedItem` — no `media[]`, `quotedTweet`, or `quoteContext` — so
 * this renders straight off the ORIGINAL `FeedItem` (ported verbatim from the
 * deleted `CollectionTheater.tsx`'s `CollectionStage`/`StageQuoteCard`)
 * rather than round-tripping through `feedItemToTheaterItem()`, which would
 * drop quote cards entirely.
 */

import type { FeedItem } from '@/components/feed/types'
import { AuthorAvatar } from '@/components/feed/AuthorAvatar'
import { reelVideoSrc } from '@/components/feed/video-src'
import { Stage } from './Stage'
import { StageText } from './StageText'
import { TheaterLinkedText } from './TheaterText'
import { StageArticle } from './StageArticle'
import { StageInstagram, useInstagramStage } from './StageInstagram'
import { StageYouTube } from './StageYouTube'
import { StageVideo } from './StageVideo'
import type { TheaterItem } from './types'
import { feedItemToTheaterItem } from './collection-item'

/** Subtle tag-chip row (unified-theater-triage.md §B) for the text/quote
 * stage branches — display-only, nothing renders without tags. Muted styling
 * so it reads as metadata, not another CTA. */
function TriageTagChips({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="flex-none rounded-full border border-white/12 bg-white/[.06] px-2 py-0.5 text-[10.5px] text-white/55"
        >
          #{t}
        </span>
      ))}
    </div>
  )
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
  /**
   * A video finished playing (unified-theater-triage.md §2 — "My Collection
   * is just a different playlist in that same theater"): pure navigation to
   * the next queue item, never a read-state decision — see
   * `TheaterShell.triageAdvanceOnEnded`. Only ever wired to the video-
   * capable branches below (instagram/youtube/twitter+tiktok); text/photo/
   * quote/article still wait on a deliberate Done/Later/Delete, so they
   * never receive this prop.
   */
  onEnded?: () => void
  /** Current item's tags (unified-theater-triage.md §B), for the text/quote
   * branches below — media posts get their chips from the chrome's bottom-left
   * overlay instead, which already sits over the content. */
  tags?: string[]
}

/** Dispatches the right stage variant for the current triage `FeedItem`,
 * converting to `TheaterItem` for the shared theater stages — the SAME
 * players every other theater playlist uses. */
export function TriageStage({ feedItem, muted, onRequestUnmute, onEnded, tags }: TriageStageProps) {
  const theaterItem = feedItemToTheaterItem(feedItem)
  const platform = feedItem.platform ?? 'twitter'
  const primary = feedItem.media?.[0]
  const isVideo = primary?.mediaType === 'video' || primary?.mediaType === 'animated_gif'

  if (platform === 'instagram') {
    return (
      <TriageInstagramStage
        item={theaterItem}
        muted={muted}
        onRequestUnmute={onRequestUnmute}
        onEnded={onEnded}
      />
    )
  }

  if (platform === 'youtube') {
    // Videos in the Collection tab auto-advance on end just like every
    // other playlist now — `onEnded` flows through to the shell's
    // `triageAdvanceOnEnded` (pure navigation only; Done/Later/Delete still
    // decide read state), same as StageVideo's twitter/tiktok branch below.
    return (
      <StageYouTube
        item={theaterItem}
        muted={muted}
        onRequestUnmute={onRequestUnmute}
        onEnded={onEnded}
      />
    )
  }

  // Twitter and TikTok video both play through the SAME StageVideo the live
  // and tag theaters use — My Collection is just a different playlist in the
  // one theater, never a different player (owner directive after the legacy
  // VideoPlayer's native controls leaked into fullscreen here). Trade-off,
  // accepted for consistency: very long (>5min) Twitter videos stream the
  // plain MP4 proxy without the legacy player's HLS path — identical to how
  // the same post already behaves in the live theater.
  if ((platform === 'twitter' || platform === 'tiktok') && isVideo) {
    return (
      <StageVideo
        item={theaterItem}
        src={reelVideoSrc(theaterItem)}
        poster={theaterItem.thumbnailUrl ?? null}
        muted={muted}
        onRequestUnmute={onRequestUnmute}
        onEnded={onEnded}
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
        {/* Same "w-full max-w-2xl" sibling pattern TriageQuoteCard below uses
            to match the text column's width inside this flex-col parent —
            keeps the chip row left-aligned with the post text, not pinned to
            a viewport corner. */}
        {tags && tags.length > 0 && (
          <div className="mt-4 w-full max-w-2xl">
            <TriageTagChips tags={tags} />
          </div>
        )}
        <TriageQuoteCard item={feedItem} />
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <StageText item={theaterItem} />
      {/* StageText centers its own `max-w-2xl` text column via `flex
          justify-center` + `px-6 sm:px-10` on a full-bleed wrapper. Mirroring
          that exact recipe here — independently, as a sibling overlay —
          lands this row's `max-w-2xl` box at the same horizontal position as
          StageText's, without needing to reach into StageText itself. */}
      {tags && tags.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-6 sm:px-10">
          <div className="pointer-events-auto w-full max-w-2xl">
            <TriageTagChips tags={tags} />
          </div>
        </div>
      )}
    </div>
  )
}

/** Re-exported so callers never need to import the generic `<Stage/>` just to
 * fall back to it for the triage "All caught up" / null-item case. */
export { Stage }

/**
 * Instagram in the collection tab. The probe now lives in `useInstagramStage`
 * (so the main theater can play a confirmed reel through its shared <video>
 * element — see that hook), which means this stage has to own the hook and
 * pick between the player and the probing/embed UI itself.
 */
function TriageInstagramStage({
  item,
  muted,
  onRequestUnmute,
  onEnded,
}: {
  item: TheaterItem
  muted: boolean
  onRequestUnmute: () => void
  onEnded?: () => void
}) {
  const instagram = useInstagramStage({ item, active: true, onEnded })
  if (instagram.status === 'ready' && instagram.src) {
    return (
      <StageVideo
        item={item}
        src={instagram.src}
        poster={instagram.poster}
        muted={muted}
        onRequestUnmute={onRequestUnmute}
        onEnded={onEnded}
      />
    )
  }
  return <StageInstagram item={item} status={instagram.status} slow={instagram.slow} />
}
