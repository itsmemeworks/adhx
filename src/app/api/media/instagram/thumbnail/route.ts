import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'
import { isValidReelId } from '@/lib/media/instafix'

/**
 * Instagram Reel thumbnail proxy.
 *
 * GET /api/media/instagram/thumbnail?id={reelId}
 *
 * Two-mirror reality: `toinstagram.com` (our primary metadata source) only
 * exposes `og:video`. `uuinstagram.com` only exposes `og:image` (pointing
 * at `scontent-*.cdninstagram.com`). So we use toinstagram for video URLs
 * (see `fetchReelMetadata`) and uuinstagram here for thumbnails.
 *
 * Instagram CDN returns 403 to cross-origin browser image loads, so the
 * server fetches with proper UA + Referer and re-serves from our origin.
 *
 * In-memory cache for the resolved CDN URL avoids hammering uuinstagram
 * for every gallery view of the same Reel.
 */

const thumbnailUrlCache = new Map<string, { url: string; ts: number }>()
const CACHE_TTL = 60 * 60 * 1000

const OG_IMAGE_RE =
  /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i

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
      // Try uuinstagram /p/{id} first (more reliable than /reels/ per upstream)
      const mirrorResponse = await fetch(`https://uuinstagram.com/p/${id}`, {
        signal: AbortSignal.timeout(8_000),
        headers: { 'User-Agent': 'Twitterbot/1.0', Accept: 'text/html' },
        redirect: 'follow',
      })

      if (!mirrorResponse.ok) {
        return NextResponse.json({ error: 'Mirror unavailable' }, { status: 502 })
      }

      // uuinstagram returns the full IG page (~850KB) — bail early at </head>
      const reader = mirrorResponse.body?.getReader()
      if (!reader) return NextResponse.json({ error: 'No body' }, { status: 502 })
      let html = ''
      const decoder = new TextDecoder()
      const maxBytes = 512 * 1024
      while (html.length < maxBytes) {
        const { done, value } = await reader.read()
        if (done) break
        html += decoder.decode(value, { stream: true })
        if (html.includes('</head>')) break
      }
      reader.cancel().catch(() => {})

      const match = html.match(OG_IMAGE_RE)
      if (!match) {
        return NextResponse.json({ error: 'No thumbnail in mirror response' }, { status: 404 })
      }

      cdnUrl = match[1].replace(/&amp;/g, '&').replace(/&#x27;/g, "'")
      thumbnailUrlCache.set(id, { url: cdnUrl, ts: Date.now() })

      if (thumbnailUrlCache.size > 1000) {
        const now = Date.now()
        for (const [k, v] of thumbnailUrlCache.entries()) {
          if (now - v.ts > CACHE_TTL) thumbnailUrlCache.delete(k)
        }
      }
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
