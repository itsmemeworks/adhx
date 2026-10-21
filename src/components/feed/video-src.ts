import { keptSrc } from '@/lib/keep/src'
import type { FeedItem } from './types'
import type { TrendingItem } from '@/lib/trending/query'

/**
 * Video sources for the feed and theater — the SINGLE source of truth, so the
 * cards can't drift per platform again (a bug we hit: Instagram fell through to
 * the Twitter proxy because each component special-cased only TikTok).
 *
 * Every network goes through `/api/files`: ADHX's own downloaded copy, or the
 * network's proxy until that copy exists.
 */

/** Full-quality inline playback src (focus/collection). */
export function feedVideoSrc(item: FeedItem): string {
  return keptSrc(item.platform || 'twitter', item.id, 'video-1', item.author)
}

/** Hover-to-play src for the gallery card. */
export function feedHoverSrc(item: FeedItem): string | null {
  return keptSrc(item.platform || 'twitter', item.id, 'video-1', item.author)
}

/**
 * Inline video for a `TrendingItem` (the theater's video stage), resolved from
 * `bookmarkId` + `author` because trending items don't carry a media row.
 */
export function reelVideoSrc(item: TrendingItem, videoIndex = 1): string {
  return keptSrc(
    item.platform || 'twitter',
    item.bookmarkId ?? '',
    `video-${videoIndex}`,
    item.author,
  )
}
