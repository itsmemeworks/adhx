import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'
import {
  buildAllowlistedUrl,
  fetchWithAllowlistedRedirects,
  isUntrustedMediaRedirectError,
  limitResponseBody,
  TWITTER_HLS_HOSTS,
} from '@/lib/media/proxy'
import { mediaRateLimit } from '@/lib/rate-limit'

export const MAX_HLS_SEGMENT_BYTES = 25 * 1024 * 1024
const HLS_SEGMENT_TIMEOUT_MS = 10_000
const SEGMENT_CONTENT_TYPES = new Set([
  'application/octet-stream',
  'audio/aac',
  'audio/mp4',
  'video/iso.segment',
  'video/mp2t',
  'video/mp4',
])

/**
 * HLS Segment Proxy - Fetches individual video segments from Twitter's CDN
 *
 * HLS video is split into small .ts (MPEG-TS) or .m4s (fMP4) segments.
 * Each segment is typically 2-10 seconds of video.
 *
 * This endpoint streams segments through our server to bypass Twitter's
 * CORS restrictions and 403 blocks on direct browser requests.
 *
 * GET /api/media/video/hls/segment?url=<encoded-segment-url>
 */
export async function GET(request: NextRequest) {
  const rateLimited = mediaRateLimit(request)
  if (rateLimited) return rateLimited

  const searchParams = request.nextUrl.searchParams
  const segmentUrl = searchParams.get('url')

  if (!segmentUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    // Validate URL is from Twitter's video CDN (strict domain check + https-only
    // via the shared SSRF allowlist factory, to prevent SSRF) and rebuild the
    // fetch target from the validated URL's own parsed components — never the
    // raw query-param string — so the fetched URL is provably safe.
    const safeSegmentUrl = buildAllowlistedUrl(segmentUrl, TWITTER_HLS_HOSTS)
    const contentType = safeSegmentUrl ? segmentContentType(safeSegmentUrl) : null
    if (!safeSegmentUrl || !contentType) {
      return NextResponse.json({ error: 'Invalid segment URL' }, { status: 400 })
    }

    // Fetch the segment
    const range = request.headers.get('range')
    const response = await fetchWithAllowlistedRedirects(safeSegmentUrl, {
      hosts: TWITTER_HLS_HOSTS,
      timeoutMs: HLS_SEGMENT_TIMEOUT_MS,
      init: {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://twitter.com/',
          Origin: 'https://twitter.com',
          ...(range ? { Range: range } : {}),
        },
      },
    })

    if (!response.ok) {
      await response.body?.cancel()
      console.error(`Segment proxy failed: ${response.status} for ${segmentUrl}`)
      return NextResponse.json(
        { error: `Failed to fetch segment: ${response.status}` },
        { status: response.status },
      )
    }

    if (!response.body) {
      return NextResponse.json({ error: 'Failed to fetch segment' }, { status: 502 })
    }

    const declaredLength = response.headers.get('content-length')
    if (/^\d+$/.test(declaredLength || '') && Number(declaredLength) > MAX_HLS_SEGMENT_BYTES) {
      await response.body.cancel()
      return NextResponse.json({ error: 'HLS segment exceeds maximum size' }, { status: 413 })
    }

    const upstreamType = response.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase()
    if (upstreamType && !SEGMENT_CONTENT_TYPES.has(upstreamType)) {
      await response.body.cancel()
      return NextResponse.json({ error: 'Invalid HLS segment content type' }, { status: 502 })
    }

    const boundedBody = limitResponseBody(response, MAX_HLS_SEGMENT_BYTES)
    if (!boundedBody) {
      return NextResponse.json({ error: 'Failed to fetch segment' }, { status: 502 })
    }

    const headers = new Headers({
      'Content-Type': upstreamType || contentType,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    })
    for (const header of ['content-length', 'content-range', 'accept-ranges']) {
      const value = response.headers.get(header)
      if (value) headers.set(header, value)
    }

    return new NextResponse(boundedBody, { status: response.status, headers })
  } catch (error) {
    if (isUntrustedMediaRedirectError(error)) {
      return NextResponse.json({ error: 'Untrusted HLS segment redirect' }, { status: 502 })
    }
    console.error('Segment proxy error:', error)
    captureException(error, { endpoint: '/api/media/video/hls/segment', segmentUrl })
    return NextResponse.json({ error: 'Failed to proxy segment' }, { status: 500 })
  }
}

function segmentContentType(url: string): string | null {
  const pathname = new URL(url).pathname.toLowerCase()
  if (pathname.endsWith('.ts')) return 'video/mp2t'
  if (pathname.endsWith('.m4s')) return 'video/iso.segment'
  if (pathname.endsWith('.mp4')) return 'video/mp4'
  if (pathname.endsWith('.m4a')) return 'audio/mp4'
  if (pathname.endsWith('.aac')) return 'audio/aac'
  return null
}
