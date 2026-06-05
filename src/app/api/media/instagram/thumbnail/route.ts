import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'
import { fetchReelMetadata, isAllowedImageUrl, isValidReelId } from '@/lib/media/instafix'

/**
 * Instagram Reel thumbnail proxy.
 *
 * GET /api/media/instagram/thumbnail?id={reelId}
 *
 * Resolves the Reel's `og:image` fresh from Instagram (see fetchReelMetadata)
 * and re-serves it from our origin. Two reasons for the proxy:
 *   1. The `og:image` CDN URL is signed and expires, so we can't store it on a
 *      bookmark — re-resolving per request keeps saved Reels' posters working.
 *   2. Keeps the (allowlisted) CDN host out of the client and gives us caching.
 *
 * Short in-memory cache of the resolved CDN URL avoids re-scraping Instagram
 * for every gallery view of the same Reel.
 */

const thumbnailUrlCache = new Map<string, { url: string; ts: number }>()
const CACHE_TTL = 30 * 60 * 1000 // 30 min — under the signed-URL expiry window

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')

  if (!id || !isValidReelId(id)) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  }

  try {
    let cdnUrl: string | undefined
    const cached = thumbnailUrlCache.get(id)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      cdnUrl = cached.url
    }

    if (!cdnUrl) {
      const meta = await fetchReelMetadata(id)
      if (!meta?.imageUrl) {
        return NextResponse.json({ error: 'No thumbnail available' }, { status: 404 })
      }
      cdnUrl = meta.imageUrl
      thumbnailUrlCache.set(id, { url: cdnUrl, ts: Date.now() })

      if (thumbnailUrlCache.size > 1000) {
        const now = Date.now()
        for (const [k, v] of thumbnailUrlCache.entries()) {
          if (now - v.ts > CACHE_TTL) thumbnailUrlCache.delete(k)
        }
      }
    }

    // Defense-in-depth: never fetch a URL that isn't an allowlisted IG CDN host.
    if (!isAllowedImageUrl(cdnUrl)) {
      return NextResponse.json({ error: 'Untrusted thumbnail source' }, { status: 403 })
    }

    const imageResponse = await fetch(cdnUrl, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Referer: 'https://www.instagram.com/',
      },
    })

    if (!imageResponse.ok || !imageResponse.body) {
      // The signed URL may have expired between resolve and fetch — drop the
      // cache entry so the next request re-resolves.
      thumbnailUrlCache.delete(id)
      return NextResponse.json({ error: 'Failed to fetch thumbnail' }, { status: 502 })
    }

    return new Response(imageResponse.body, {
      headers: {
        'Content-Type': imageResponse.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    })
  } catch (error) {
    console.error('Instagram thumbnail proxy error:', error)
    captureException(error, { endpoint: '/api/media/instagram/thumbnail', id })
    return NextResponse.json({ error: 'Thumbnail proxy failed' }, { status: 500 })
  }
}
