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
 *   - supported platform subdomains (`www.`, `mobile.`, `m.`, `vm.`, etc.)
 *   - Twitter also matches the `vxtwitter.com`/`fxtwitter.com` mirrors so a
 *     pasted mirror link resolves (same hosts `parseTweetUrl` accepted)
 *   - Instagram accepts `reel`, `reels`, and `p`
 *   - Twitter usernames are `\w{1,15}`; TikTok handles `[A-Za-z0-9._]{1,30}`
 *   - TikTok video ids are `\d{6,25}`; tweet ids are `\d+`
 *   - YouTube is resolved via `extractYouTubeId` (Shorts URLs only)
 *   - TikTok `@handle` may arrive URL-encoded as `%40handle` (Next.js params),
 *     so the first pathname segment is decoded before matching
 */

import { extractYouTubeId } from '@/lib/media/youtube'
import { isHostOrSubdomainOf } from '@/lib/utils/url-host'

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
 * Canonical per-platform pathname patterns. Host authorization is deliberately
 * separate: matching the whole input lets an unrelated host smuggle a platform
 * URL through its path, query, or userinfo.
 */
export const PLATFORM_PATTERNS = {
  twitter: /^\/(\w{1,15})\/status\/(\d+)(?:\/|$)/i,
  instagram: /^\/(?:reels?|p)\/([A-Za-z0-9_-]+)(?:\/|$)/i,
  tiktok: /^\/((?:@|%40)[A-Za-z0-9._]{1,30})\/video\/(\d{6,25})(?:\/|$)/i,
  youtube: /^\/shorts\/[A-Za-z0-9_-]{11}(?:\/|$)/i,
} as const

const TWITTER_HOSTS = ['x.com', 'twitter.com', 'vxtwitter.com', 'fxtwitter.com']
const INSTAGRAM_HOSTS = ['instagram.com']
const TIKTOK_HOSTS = ['tiktok.com']
const YOUTUBE_HOSTS = ['youtube.com']

function parseHttpUrl(input: string): URL | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('//')) return null

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) return null

  try {
    const parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.username || parsed.password) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Detect the platform post/video for a URL and build its ADHX preview path.
 * Returns null when the URL isn't a recognised post/video link.
 */
export function detectPlatformPost(url: string): PlatformPost | null {
  const parsed = parseHttpUrl(url)
  if (!parsed) return null

  const tweet = parsed.pathname.match(PLATFORM_PATTERNS.twitter)
  if (tweet && isHostOrSubdomainOf(parsed.href, TWITTER_HOSTS)) {
    const author = tweet[1]
    const id = tweet[2]
    return { platform: 'twitter', id, author, previewPath: `/${author}/status/${id}` }
  }

  const reel = parsed.pathname.match(PLATFORM_PATTERNS.instagram)
  if (reel && isHostOrSubdomainOf(parsed.href, INSTAGRAM_HOSTS)) {
    const id = reel[1]
    return { platform: 'instagram', id, previewPath: `/reels/${id}` }
  }

  const tiktok = parsed.pathname.match(PLATFORM_PATTERNS.tiktok)
  if (tiktok && isHostOrSubdomainOf(parsed.href, TIKTOK_HOSTS)) {
    let handleSegment: string
    try {
      handleSegment = decodeURIComponent(tiktok[1])
    } catch {
      return null
    }
    if (!handleSegment.startsWith('@')) return null

    const author = handleSegment.slice(1)
    if (!/^[A-Za-z0-9._]{1,30}$/.test(author)) return null

    const id = tiktok[2]
    return { platform: 'tiktok', id, author, previewPath: `/@${author}/video/${id}` }
  }

  if (
    PLATFORM_PATTERNS.youtube.test(parsed.pathname) &&
    isHostOrSubdomainOf(parsed.href, YOUTUBE_HOSTS)
  ) {
    const id = extractYouTubeId(parsed.href)
    if (id) return { platform: 'youtube', id, previewPath: `/shorts/${id}` }
  }

  return null
}
