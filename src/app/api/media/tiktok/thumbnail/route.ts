import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'
import { isValidUsername, isValidVideoId } from '@/lib/media/tnktok'

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
const thumbnailUrlCache = new Map<string, { url: string; ts: number }>()
const CACHE_TTL = 60 * 60 * 1000

const OG_IMAGE_RE = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username')
  const videoId = request.nextUrl.searchParams.get('id')

  if (!username || !isValidUsername(username) || !videoId || !isValidVideoId(videoId)) {
    return NextResponse.json({ error: 'Missing or invalid username/id' }, { status: 400 })
  }

  const handle = username.startsWith('@') ? username.slice(1) : username
  const cacheKey = `${handle}/${videoId}`

  try {
    // Step 1 — resolve the tiktokcdn-eu.com URL via tiktxk.com
    let cdnUrl: string | undefined
    const cached = thumbnailUrlCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      cdnUrl = cached.url
    }

    if (!cdnUrl) {
      const mirrorResponse = await fetch(`https://tiktxk.com/@${handle}/video/${videoId}`, {
        signal: AbortSignal.timeout(8_000),
        headers: { 'User-Agent': 'Twitterbot/1.0', Accept: 'text/html' },
        redirect: 'follow',
      })

      if (!mirrorResponse.ok) {
        return NextResponse.json({ error: 'Mirror unavailable' }, { status: 502 })
      }

      const html = await mirrorResponse.text()
      const match = html.match(OG_IMAGE_RE)
      if (!match) {
        return NextResponse.json({ error: 'No thumbnail in mirror response' }, { status: 404 })
      }

      cdnUrl = match[1].replace(/&amp;/g, '&').replace(/&#x27;/g, "'")
      thumbnailUrlCache.set(cacheKey, { url: cdnUrl, ts: Date.now() })

      // Trim cache if it grows
      if (thumbnailUrlCache.size > 1000) {
        const now = Date.now()
        for (const [k, v] of thumbnailUrlCache.entries()) {
          if (now - v.ts > CACHE_TTL) thumbnailUrlCache.delete(k)
        }
      }
    }

    // Step 2 — fetch the JPEG with browser-grade headers
    const imageResponse = await fetch(cdnUrl, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Referer: 'https://www.tiktok.com/',
      },
    })

    if (!imageResponse.ok || !imageResponse.body) {
      return NextResponse.json({ error: 'Failed to fetch thumbnail' }, { status: 502 })
    }

    return new Response(imageResponse.body, {
      headers: {
        'Content-Type': imageResponse.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    })
  } catch (error) {
    console.error('TikTok thumbnail proxy error:', error)
    captureException(error, { endpoint: '/api/media/tiktok/thumbnail', username, videoId })
    return NextResponse.json({ error: 'Thumbnail proxy failed' }, { status: 500 })
  }
}
