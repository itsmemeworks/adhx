import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'
import { fetchReelMetadata, isAllowedVideoUrl, isValidReelId } from '@/lib/media/instafix'

/**
 * Instagram Reel video proxy — streams the Reel through the server for
 * inline playback in a <video> tag. Supports Range requests for seeking.
 *
 * Sibling of `/download/route.ts`: same upstream resolution, but no
 * Content-Disposition so browsers play inline instead of downloading.
 *
 * GET /api/media/instagram/video?id={reelId}
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')

  if (!id || !isValidReelId(id)) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  }

  try {
    const meta = await fetchReelMetadata(id)
    if (!meta) {
      return NextResponse.json({ error: 'Reel not found or not available' }, { status: 404 })
    }

    if (!isAllowedVideoUrl(meta.videoUrl)) {
      return NextResponse.json({ error: 'Invalid video source' }, { status: 403 })
    }

    const rangeHeader = request.headers.get('range')
    const videoResponse = await fetch(meta.videoUrl, {
      signal: AbortSignal.timeout(30_000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        ...(rangeHeader ? { Range: rangeHeader } : {}),
      },
    })

    if ((!videoResponse.ok && videoResponse.status !== 206) || !videoResponse.body) {
      return NextResponse.json({ error: 'Failed to fetch video' }, { status: 502 })
    }

    const responseHeaders: Record<string, string> = {
      'Content-Type': videoResponse.headers.get('content-type') || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    }
    const contentLength = videoResponse.headers.get('content-length')
    if (contentLength) responseHeaders['Content-Length'] = contentLength
    const contentRange = videoResponse.headers.get('content-range')
    if (contentRange) responseHeaders['Content-Range'] = contentRange

    return new Response(videoResponse.body, {
      status: videoResponse.status,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('Instagram video proxy error:', error)
    captureException(error, { endpoint: '/api/media/instagram/video', id })
    return NextResponse.json({ error: 'Stream failed' }, { status: 500 })
  }
}
