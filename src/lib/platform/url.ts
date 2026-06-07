/**
 * Platform post/video URL detection — ONE source of truth.
 *
 * Replaces the duplicated regexes scattered across `parse-share-url`,
 * the bookmark-add route, etc. Detects which platform a link belongs to
 * (X/Twitter, Instagram, TikTok, YouTube), pulls out its canonical id (and
 * author where the platform exposes one), and returns the on-ADHX preview
 * path to redirect to.
 *
 * Behaviour preserved from the prior call sites:
 *   - protocol optional (`https?://` or bare host)
 *   - `www.`/`mobile.` for Twitter; `vm.`/`m.` for TikTok; `m.` for YouTube
 *   - Twitter also matches the `vxtwitter.com`/`fxtwitter.com` mirrors so a
 *     pasted mirror link resolves (same hosts `parseTweetUrl` accepted)
 *   - Instagram accepts `reel`, `reels`, and `p`
 *   - Twitter usernames are `\w{1,15}`; TikTok handles `[A-Za-z0-9._]{1,30}`
 *   - TikTok video ids are `\d{6,25}`; tweet ids are `\d+`
 *   - YouTube is resolved via `extractYouTubeId` (shorts / youtu.be / watch?v= /
 *     embed), so the 11-char id rules live there
 *   - TikTok `@handle` may arrive URL-encoded as `%40handle` (Next.js params),
 *     so we decode a leading `%40` before matching
 */

import { extractYouTubeId } from '@/lib/media/youtube'

export type PlatformId = 'twitter' | 'instagram' | 'tiktok' | 'youtube'

export interface PlatformPost {
  platform: PlatformId
  /** Canonical post/video id. */
  id: string
  /** Author handle when the platform's URL carries one (twitter, tiktok). */
  author?: string
  /** On-ADHX preview path to redirect to. */
  previewPath: string
}

/**
 * Canonical per-platform URL patterns. YouTube intentionally has no regex
 * here — its many id forms are owned by `extractYouTubeId`.
 */
export const PLATFORM_PATTERNS = {
  twitter:
    /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter|vxtwitter|fxtwitter)\.com\/(\w{1,15})\/status\/(\d+)/i,
  instagram: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/i,
  tiktok:
    /(?:https?:\/\/)?(?:www\.|vm\.|m\.)?tiktok\.com\/@([A-Za-z0-9._]{1,30})\/video\/(\d{6,25})/i,
  youtube: /(?:youtube\.com|youtu\.be)/i,
} as const

/**
 * Detect the platform post/video for a URL and build its ADHX preview path.
 * Returns null when the URL isn't a recognised post/video link.
 */
export function detectPlatformPost(url: string): PlatformPost | null {
  if (!url) return null
  // Decode a leading `%40` so Next.js-encoded TikTok handles still match.
  const trimmed = url.trim().replace(/%40/gi, '@')

  const tweet = trimmed.match(PLATFORM_PATTERNS.twitter)
  if (tweet) {
    const author = tweet[1]
    const id = tweet[2]
    return { platform: 'twitter', id, author, previewPath: `/${author}/status/${id}` }
  }

  const reel = trimmed.match(PLATFORM_PATTERNS.instagram)
  if (reel) {
    const id = reel[1]
    return { platform: 'instagram', id, previewPath: `/reels/${id}` }
  }

  const tiktok = trimmed.match(PLATFORM_PATTERNS.tiktok)
  if (tiktok) {
    const author = tiktok[1]
    const id = tiktok[2]
    return { platform: 'tiktok', id, author, previewPath: `/@${author}/video/${id}` }
  }

  if (PLATFORM_PATTERNS.youtube.test(trimmed)) {
    const id = extractYouTubeId(trimmed)
    if (id) return { platform: 'youtube', id, previewPath: `/shorts/${id}` }
  }

  return null
}
