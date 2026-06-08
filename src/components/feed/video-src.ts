import type { FeedItem } from './types'

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

/** Full-quality inline playback src (focus/triage). */
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
