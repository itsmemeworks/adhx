import { NextRequest, NextResponse } from 'next/server'
import { TtlLruCache } from '@/lib/cache/ttl-lru'
import { captureException } from '@/lib/sentry'
import { isValidUsername, isValidVideoId } from '@/lib/media/tnktok'
import {
  buildAllowlistedUrl,
  fetchWithAllowlistedRedirects,
  isMediaResponseTooLargeError,
  isUntrustedMediaRedirectError,
  readResponseBodyWithLimit,
} from '@/lib/media/proxy'
import { mediaRateLimit } from '@/lib/rate-limit'

/**
 * TikTok thumbnail proxy.
 *
 * GET /api/media/tiktok/thumbnail?username={handle}&id={videoId}
 *
 * Why a proxy: tnktok.com (our primary metadata mirror) returns only
 * og:video — no thumbnail. tiktxk.com DOES expose og:image on
 * `tiktokcdn-eu.com`, but the CDN 503s direct browser requests.
 *
 * Two-hop fetch: tiktxk.com (for the signed CDN URL) → tiktokcdn-eu.com
 * (for the actual JPEG), both server-side with proper UA. We re-serve
 * from our origin with a long Cache-Control so the FeedCard <img> tag
 * just works.
 */

// In-memory cache for resolved CDN URLs (1 hour). Avoids hammering tiktxk
// for every gallery view of the same TikTok.
const CACHE_TTL = 60 * 60 * 1000
const thumbnailUrlCache = new TtlLruCache<string, string>({
  maxSize: 1_000,
  ttlMs: CACHE_TTL,
})
const MAX_MIRROR_HTML_BYTES = 256 * 1024
const THUMBNAIL_REQUEST_TIMEOUT_MS = 10_000
const MIRROR_TIMEOUT_MS = 8_000
const IMAGE_TIMEOUT_MS = 10_000

const OG_IMAGE_RE = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i

/**
 * The og:image URL is scraped from tiktxk.com's HTML — untrusted content, not
 * something we control. Unlike every sibling proxy (video/route.ts, the HLS
 * routes, the Instagram routes), this route had no host allowlist on the
 * resolved CDN URL before fetching it — a classic SSRF gap. Same CDN hosts
 * the TikTok video proxy allows (`src/lib/media/tnktok.ts`'s
 * ALLOWED_VIDEO_HOSTS), minus the mirror's own host (tnktok.com — not
 * relevant here, this route talks to tiktxk.com for metadata only).
 */
const TIKTOK_IMAGE_CDN_HOSTS = ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com'].flatMap(
  (host) => [host, `.${host}`],
)
const TIKTOK_THUMBNAIL_MIRROR_HOSTS = ['tiktxk.com', '.tiktxk.com']

// HTML entities that appear in og:image URLs (mostly `&amp;` between query
// params, occasionally an escaped apostrophe).
const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  '#x27': "'",
  '#39': "'",
  quot: '"',
  lt: '<',
  gt: '>',
}

/**
 * Decode HTML entities in a single pass. A single pass (rather than chained
 * `.replace()` calls) avoids double-unescaping — e.g. `&amp;#x27;` decodes to
 * the literal `&#x27;`, never to `'`.
 */
function decodeHtmlEntities(input: string): string {
  return input.replace(
    /&(amp|#x27|#39|quot|lt|gt);/g,
    (match, entity) => HTML_ENTITIES[entity] ?? match,
  )
}

type ThumbnailResolution = { ok: true; url: string } | { ok: false; response: NextResponse }

function remainingTimeoutMs(deadline: number, phaseLimitMs: number): number {
  const remaining = deadline - Date.now()
  if (remaining <= 0) {
    throw new DOMException('TikTok thumbnail request deadline exceeded', 'TimeoutError')
  }
  return Math.min(phaseLimitMs, remaining)
}

async function resolveThumbnailUrl(
  handle: string,
  videoId: string,
  deadline: number,
): Promise<ThumbnailResolution> {
  const mirrorResponse = await fetchWithAllowlistedRedirects(
    `https://tiktxk.com/@${handle}/video/${videoId}`,
    {
      hosts: TIKTOK_THUMBNAIL_MIRROR_HOSTS,
      timeoutMs: remainingTimeoutMs(deadline, MIRROR_TIMEOUT_MS),
      init: {
        headers: { 'User-Agent': 'Twitterbot/1.0', Accept: 'text/html' },
      },
    },
  )

  if (!mirrorResponse.ok) {
    await mirrorResponse.body?.cancel()
    return {
      ok: false,
      response: NextResponse.json({ error: 'Mirror unavailable' }, { status: 502 }),
    }
  }

  const html = new TextDecoder().decode(
    await readResponseBodyWithLimit(mirrorResponse, MAX_MIRROR_HTML_BYTES),
  )
  const match = html.match(OG_IMAGE_RE)
  if (!match) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No thumbnail in mirror response' }, { status: 404 }),
    }
  }

  // Validate the resolved host against the CDN allowlist and rebuild the URL
  // from validated parsed components before it is cached or fetched.
  const decoded = decodeHtmlEntities(match[1])
  const safeCdnUrl = buildAllowlistedUrl(decoded, TIKTOK_IMAGE_CDN_HOSTS)
  if (!safeCdnUrl) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Untrusted thumbnail CDN host' }, { status: 502 }),
    }
  }

  return { ok: true, url: safeCdnUrl }
}

export async function GET(request: NextRequest) {
  const rateLimited = mediaRateLimit(request)
  if (rateLimited) return rateLimited

  const username = request.nextUrl.searchParams.get('username')
  const videoId = request.nextUrl.searchParams.get('id')

  if (!username || !isValidUsername(username) || !videoId || !isValidVideoId(videoId)) {
    return NextResponse.json({ error: 'Missing or invalid username/id' }, { status: 400 })
  }

  const handle = username.startsWith('@') ? username.slice(1) : username
  const cacheKey = `${handle}/${videoId}`
  const deadline = Date.now() + THUMBNAIL_REQUEST_TIMEOUT_MS

  try {
    // Step 1 — resolve the tiktokcdn-eu.com URL via tiktxk.com
    let cdnUrl = thumbnailUrlCache.get(cacheKey)
    const startedWithCachedUrl = cdnUrl !== undefined
    const maxAttempts = startedWithCachedUrl ? 2 : 1

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (!cdnUrl) {
        const resolution = await resolveThumbnailUrl(handle, videoId, deadline)
        if (!resolution.ok) return resolution.response
        cdnUrl = resolution.url
        thumbnailUrlCache.set(cacheKey, cdnUrl)
      }

      try {
        // Step 2 — fetch the JPEG with browser-grade headers.
        const imageResponse = await fetchWithAllowlistedRedirects(cdnUrl, {
          hosts: TIKTOK_IMAGE_CDN_HOSTS,
          timeoutMs: remainingTimeoutMs(deadline, IMAGE_TIMEOUT_MS),
          init: {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
              Referer: 'https://www.tiktok.com/',
            },
          },
        })

        if (imageResponse.ok && imageResponse.body) {
          return new Response(imageResponse.body, {
            headers: {
              'Content-Type': imageResponse.headers.get('content-type') || 'image/jpeg',
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            },
          })
        }

        await imageResponse.body?.cancel()
        thumbnailUrlCache.delete(cacheKey)
        if (attempt + 1 < maxAttempts) {
          cdnUrl = undefined
          continue
        }
        return NextResponse.json({ error: 'Failed to fetch thumbnail' }, { status: 502 })
      } catch (error) {
        if (!isUntrustedMediaRedirectError(error)) throw error

        thumbnailUrlCache.delete(cacheKey)
        if (attempt + 1 < maxAttempts) {
          cdnUrl = undefined
          continue
        }
        return NextResponse.json({ error: 'Untrusted thumbnail redirect' }, { status: 502 })
      }
    }

    return NextResponse.json({ error: 'Failed to fetch thumbnail' }, { status: 502 })
  } catch (error) {
    if (isMediaResponseTooLargeError(error)) {
      return NextResponse.json({ error: 'Mirror response exceeds maximum size' }, { status: 502 })
    }
    if (isUntrustedMediaRedirectError(error)) {
      return NextResponse.json({ error: 'Untrusted thumbnail redirect' }, { status: 502 })
    }
    console.error('TikTok thumbnail proxy error:', error)
    captureException(error, { endpoint: '/api/media/tiktok/thumbnail', username, videoId })
    return NextResponse.json({ error: 'Thumbnail proxy failed' }, { status: 500 })
  }
}
