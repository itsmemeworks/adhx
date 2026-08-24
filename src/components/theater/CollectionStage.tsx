'use client'

/**
 * The collection-collection-tab stage dispatcher (docs/specs/unified-theater-collection.md
 * §2). `TheaterItem` (== `TrendingItem`) is deliberately narrower than the
 * authed `FeedItem` — no `media[]`, `quotedTweet`, or `quoteContext` — so
 * this renders straight off the ORIGINAL `FeedItem` (ported verbatim from the
 * deleted `CollectionTheater.tsx`'s `CollectionStage`/`StageQuoteCard`)
 * rather than round-tripping through `feedItemToTheaterItem()`, which now
 * carries the quoted post on `TheaterItem.quote`.
 */

import type { FeedItem } from '@/components/feed/types'
import { reelVideoSrc } from '@/components/feed/video-src'
import { Stage } from './Stage'
import { StageText } from './StageText'
import { StageArticle } from './StageArticle'
import { StageInstagram, useInstagramStage } from './StageInstagram'
import { StageYouTube } from './StageYouTube'
import { StageVideo } from './StageVideo'
import {
  STAGE_ARTICLE_ROOT,
  STAGE_ARTICLE_TEXT_PANE,
  STAGE_ARTICLE_VIDEO_BAND,
  StageArticleVideoFade,
} from './stage-primitives'
import { isQuoteReader, type TheaterItem } from './types'
import { feedItemToTheaterItem } from './collection-item'

/** Subtle tag-chip row (unified-theater-collection.md §B) for the text/quote
 * stage branches — display-only, nothing renders without tags. Muted styling
 * so it reads as metadata, not another CTA. */
function CollectionTagChips({ tags }: { tags?: string[] }) {
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

export interface CollectionStageProps {
  feedItem: FeedItem
  muted: boolean
  onRequestUnmute: () => void
  /**
   * A video finished playing (unified-theater-collection.md §2 — "My Collection
   * is just a different playlist in that same theater"): pure navigation to
   * the next queue item, never a read-state decision — see
   * `TheaterShell.personalAdvanceOnEnded`. Only ever wired to the video-
   * capable branches below (instagram/youtube/twitter+tiktok); text/photo/
   * quote/article still wait on a deliberate Done/Later/Delete, so they
   * never receive this prop.
   */
  onEnded?: () => void
  /** Current item's tags (unified-theater-collection.md §B), for the text/quote
   * branches below — media posts get their chips from the chrome's bottom-left
   * overlay instead, which already sits over the content. */
  tags?: string[]
  /** Repeat-one / single-item loop — same player `loop` the live Stage uses. */
  repeat?: boolean
  /** Video/photo + quote: stacked reader instead of full-bleed parent media. */
  articleMode?: boolean
}

/** Dispatches the right stage variant for the current collection `FeedItem`,
 * converting to `TheaterItem` for the shared theater stages — the SAME
 * players every other theater playlist uses. */
export function CollectionStage({
  feedItem,
  muted,
  onRequestUnmute,
  onEnded,
  tags,
  repeat,
  articleMode = false,
}: CollectionStageProps) {
  const theaterItem = feedItemToTheaterItem(feedItem)
  const platform = feedItem.platform ?? 'twitter'
  const primary = feedItem.media?.[0]
  const isVideo = primary?.mediaType === 'video' || primary?.mediaType === 'animated_gif'
  const quoteReader = isQuoteReader(theaterItem, false)

  if (platform === 'instagram') {
    return (
      <CollectionInstagramStage
        item={theaterItem}
        muted={muted}
        onRequestUnmute={onRequestUnmute}
        onEnded={onEnded}
        repeat={repeat}
        articleMode={articleMode}
      />
    )
  }

  if (platform === 'youtube') {
    // Same keep-playing split as live Stage: the iframe stays in one slot so
    // Read does not restart the Short. `onEnded` still flows through to
    // `personalAdvanceOnEnded` (pure navigation).
    if (articleMode) {
      return (
        <div className={STAGE_ARTICLE_ROOT}>
          <div className={STAGE_ARTICLE_VIDEO_BAND}>
            <StageYouTube
              item={theaterItem}
              muted={muted}
              onRequestUnmute={onRequestUnmute}
              onEnded={onEnded}
              repeat={repeat}
            />
          </div>
          <StageArticleVideoFade />
          <div className={STAGE_ARTICLE_TEXT_PANE}>
            <StageText item={theaterItem} hideTweetLinks omitParentVideo flushTop underBand />
          </div>
        </div>
      )
    }
    return (
      <StageYouTube
        item={theaterItem}
        muted={muted}
        onRequestUnmute={onRequestUnmute}
        onEnded={onEnded}
        repeat={repeat}
      />
    )
  }

  // Video + Read: keep the same StageVideo playing in a top band and put
  // the article underneath. Checked before the full-bleed / swap-to-text
  // branches so the player is not remounted.
  if (articleMode && isVideo && (platform === 'twitter' || platform === 'tiktok')) {
    return (
      <div className={STAGE_ARTICLE_ROOT}>
        <div className={STAGE_ARTICLE_VIDEO_BAND}>
          <StageVideo
            item={theaterItem}
            src={reelVideoSrc(theaterItem)}
            poster={theaterItem.thumbnailUrl ?? null}
            muted={muted}
            onRequestUnmute={onRequestUnmute}
            onEnded={onEnded}
            repeat={repeat}
          />
        </div>
        <StageArticleVideoFade />
        <div className={STAGE_ARTICLE_TEXT_PANE}>
          <StageText item={theaterItem} hideTweetLinks omitParentVideo flushTop underBand />
        </div>
      </div>
    )
  }

  // Photo + quote in article mode, or a text-only quote: stacked reader.
  // Checked BEFORE the full-bleed video branch — otherwise a parent video
  // hides the essay and the quoted clip.
  if (quoteReader) {
    return <StageText item={theaterItem} hideTweetLinks />
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
        repeat={repeat}
      />
    )
  }

  if (theaterItem.contentType === 'article') {
    return <StageArticle item={theaterItem} />
  }

  if (theaterItem.contentType === 'photo') {
    if (articleMode) {
      return <StageText item={theaterItem} hideTweetLinks />
    }
    // Chrome already paints author + caption (same as Live's `photoCaption={false}`).
    return <StageText item={theaterItem} photo photoCaption={false} />
  }

  if (theaterItem.contentType === 'quote') {
    return <StageText item={theaterItem} hideTweetLinks />
  }

  return (
    <div className="relative h-full w-full">
      <StageText item={theaterItem} />
      {/* StageText's typeset column is `max-w-2xl` + `px-6 sm:px-10`.
          Mirroring that here lands the tag row on the same horizontal
          ruler, without reaching into StageText. */}
      {tags && tags.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-6 sm:px-10">
          <div className="pointer-events-auto w-full max-w-2xl">
            <CollectionTagChips tags={tags} />
          </div>
        </div>
      )}
    </div>
  )
}

/** Re-exported so callers never need to import the generic `<Stage/>` just to
 * fall back to it for the collection "All caught up" / null-item case. */
export { Stage }

/**
 * Instagram in the collection tab. The probe now lives in `useInstagramStage`
 * (so the main theater can play a confirmed reel through its shared <video>
 * element — see that hook), which means this stage has to own the hook and
 * pick between the player and the probing/embed UI itself.
 */
function CollectionInstagramStage({
  item,
  muted,
  onRequestUnmute,
  onEnded,
  repeat,
  articleMode = false,
}: {
  item: TheaterItem
  muted: boolean
  onRequestUnmute: () => void
  onEnded?: () => void
  repeat?: boolean
  articleMode?: boolean
}) {
  const instagram = useInstagramStage({ item, active: true, onEnded, repeat })
  if (instagram.status === 'ready' && instagram.src) {
    const player = (
      <StageVideo
        item={item}
        src={instagram.src}
        poster={instagram.poster}
        muted={muted}
        onRequestUnmute={onRequestUnmute}
        onEnded={onEnded}
        repeat={repeat}
      />
    )
    if (articleMode) {
      return (
        <div className={STAGE_ARTICLE_ROOT}>
          <div className={STAGE_ARTICLE_VIDEO_BAND}>{player}</div>
          <StageArticleVideoFade />
          <div className={STAGE_ARTICLE_TEXT_PANE}>
            <StageText item={item} hideTweetLinks omitParentVideo flushTop underBand />
          </div>
        </div>
      )
    }
    return player
  }
  if (articleMode) {
    return <StageText item={item} hideTweetLinks omitParentVideo flushTop />
  }
  return <StageInstagram item={item} status={instagram.status} slow={instagram.slow} />
}
