import { NextRequest, NextResponse } from 'next/server'
import { TtlLruCache } from '@/lib/cache/ttl-lru'
import { captureException } from '@/lib/sentry'
import {
  fetchFreshInstagramMetadata,
  fetchInstagramMetadata,
  isAllowedImageUrl,
  isValidInstagramId,
  type InstagramMetadata,
} from '@/lib/media/instafix'
import { fetchWithAllowlistedRedirects, isUntrustedMediaRedirectError } from '@/lib/media/proxy'
import { downloadRateLimit, mediaRateLimit } from '@/lib/rate-limit'

const INSTAGRAM_THUMBNAIL_HOSTS = [
  'cdninstagram.com',
  '.cdninstagram.com',
  'fbcdn.net',
  '.fbcdn.net',
]

/**
 * Instagram image/poster proxy.
 *
 * GET /api/media/instagram/thumbnail?id={postId}&index={1-based}&download=1
 *
 * Resolves the selected image fresh from Instagram
 * and re-serves it from our origin. Two reasons for the proxy:
 *   1. The `og:image` CDN URL is signed and expires, so we can't store it on a
 *      bookmark — re-resolving on expiry keeps saved posts' images working.
 *   2. Keeps the (allowlisted) CDN host out of the client and gives us caching.
 *
 * Short in-memory cache of the resolved CDN URL avoids re-scraping Instagram
 * for every gallery view of the same post.
 */

const CACHE_TTL = 30 * 60 * 1000 // 30 min — under the signed-URL expiry window
const thumbnailUrlCache = new TtlLruCache<string, string>({
  maxSize: 1_000,
  ttlMs: CACHE_TTL,
})

function imageUrlAt(metadata: InstagramMetadata | null, index: number): string | undefined {
  return metadata?.media?.[index - 1]?.imageUrl || (index === 1 ? metadata?.imageUrl : undefined)
}

function fetchInstagramImage(url: string): Promise<Response> {
  return fetchWithAllowlistedRedirects(url, {
    hosts: INSTAGRAM_THUMBNAIL_HOSTS,
    timeoutMs: 10_000,
    init: {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Referer: 'https://www.instagram.com/',
      },
    },
  })
}

export async function GET(request: NextRequest) {
  const download = request.nextUrl.searchParams.get('download') === '1'
  const rateLimited = download ? downloadRateLimit(request) : mediaRateLimit(request)
  if (rateLimited) return rateLimited
  const id = request.nextUrl.searchParams.get('id')
  const rawIndex = request.nextUrl.searchParams.get('index')
  const index = rawIndex == null ? 1 : Number(rawIndex)

  if (!id || !isValidInstagramId(id) || !Number.isInteger(index) || index < 1 || index > 20) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  }

  try {
    const cacheKey = `${id}:${index}`
    let cdnUrl = thumbnailUrlCache.get(cacheKey)

    if (!cdnUrl) {
      const meta = await fetchInstagramMetadata(id)
      const resolvedUrl = imageUrlAt(meta, index)
      if (!resolvedUrl) {
        return NextResponse.json({ error: 'No Instagram image available' }, { status: 404 })
      }
      cdnUrl = resolvedUrl
      thumbnailUrlCache.set(cacheKey, cdnUrl)
    }

    // Defense-in-depth: never fetch a URL that isn't an allowlisted IG CDN host.
    if (!isAllowedImageUrl(cdnUrl)) {
      return NextResponse.json({ error: 'Untrusted thumbnail source' }, { status: 403 })
    }

    let imageResponse = await fetchInstagramImage(cdnUrl)

    if (!imageResponse.ok || !imageResponse.body) {
      await imageResponse.body?.cancel()
      // The signed URL may have expired in either cache layer. Bypass the
      // one-hour metadata cache and retry once with a freshly scraped URL.
      thumbnailUrlCache.delete(cacheKey)
      const freshUrl = imageUrlAt(await fetchFreshInstagramMetadata(id), index)
      if (!freshUrl || !isAllowedImageUrl(freshUrl)) {
        return NextResponse.json({ error: 'Failed to refresh thumbnail' }, { status: 502 })
      }
      thumbnailUrlCache.set(cacheKey, freshUrl)
      imageResponse = await fetchInstagramImage(freshUrl)
      if (!imageResponse.ok || !imageResponse.body) {
        await imageResponse.body?.cancel()
        thumbnailUrlCache.delete(cacheKey)
        return NextResponse.json({ error: 'Failed to fetch thumbnail' }, { status: 502 })
      }
    }

    const headers = new Headers({
      'Content-Type': imageResponse.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    })
    if (download) {
      headers.set('Content-Disposition', `attachment; filename="adhx-instagram-${id}-${index}.jpg"`)
    }
    return new Response(imageResponse.body, { headers })
  } catch (error) {
    if (isUntrustedMediaRedirectError(error)) {
      thumbnailUrlCache.delete(`${id}:${index}`)
      return NextResponse.json({ error: 'Untrusted thumbnail redirect' }, { status: 502 })
    }
    console.error('Instagram thumbnail proxy error:', error)
    captureException(error, { endpoint: '/api/media/instagram/thumbnail', id })
    return NextResponse.json({ error: 'Thumbnail proxy failed' }, { status: 500 })
  }
}
