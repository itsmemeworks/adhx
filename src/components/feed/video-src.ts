import type { FeedItem } from './types'
import type { TrendingItem } from '@/lib/trending/query'

/**
 * Per-platform video source resolution for the in-app feed surfaces — the
 * SINGLE source of truth, so the cards can't drift per platform again (a bug
 * we hit: Instagram fell through to the Twitter proxy because each component
 * special-cased only TikTok).
 *
 * - **Twitter** → the FxTwitter proxy, quality-keyed (`hd` for playback, a light
 *   `preview` tier for hover).
 * - **TikTok / Instagram** → their own proxy. The feed (`/api/feed`) already
 *   built the correct stream URL into the media row, so we use `media[0].url`.
 * - **YouTube** → no MP4 (official iframe embed only); not handled here.
 */

const twitterProxy = (item: FeedItem, quality: 'hd' | 'preview') =>
  `/api/media/video?author=${encodeURIComponent(item.author)}&tweetId=${encodeURIComponent(item.id)}&quality=${quality}`

/** Full-quality inline playback src (focus/collection). */
export function feedVideoSrc(item: FeedItem): string {
  const primary = item.media?.[0]
  if ((item.platform === 'tiktok' || item.platform === 'instagram') && primary?.url) {
    return primary.url
  }
  return twitterProxy(item, 'hd')
}

/**
 * Hover-to-play src for the gallery card, or null when hover-play isn't
 * supported (YouTube has no MP4; a video row missing its proxy URL).
 */
export function feedHoverSrc(item: FeedItem): string | null {
  if (item.platform === 'twitter' || !item.platform) return twitterProxy(item, 'preview')
  if (item.platform === 'tiktok' || item.platform === 'instagram') {
    return item.media?.[0]?.url ?? null
  }
  return null
}

/**
 * Full-quality inline MP4 stream for a `TrendingItem` (the trending Reel and
 * the theater's video stage). Twitter/TikTok/Instagram only — YouTube has no
 * MP4 (see the module note above); resolved from `bookmarkId`+`author`
 * because trending items don't carry a pre-built media row like `FeedItem`.
 */
export function reelVideoSrc(item: TrendingItem, videoIndex = 1): string {
  const id = encodeURIComponent(item.bookmarkId ?? '')
  const author = encodeURIComponent(item.author ?? '')
  if (item.platform === 'tiktok') {
    return `/api/media/tiktok/video?username=${author}&id=${id}`
  }
  if (item.platform === 'instagram') {
    return `/api/media/instagram/video?id=${id}`
  }
  const index = videoIndex > 1 ? `&index=${videoIndex}` : ''
  return `/api/media/video?author=${author}&tweetId=${id}&quality=hd${index}`
}
