import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'
import {
  fetchTikTokMetadata,
  isAllowedVideoUrl,
  isValidUsername,
  isValidVideoId,
} from '@/lib/media/tnktok'

/**
 * TikTok video proxy — streams the MP4 through the server for inline playback
 * in a `<video>` tag. Supports Range requests for seeking.
 *
 * GET /api/media/tiktok/video?username={handle}&id={videoId}
 */
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username')
  const videoId = request.nextUrl.searchParams.get('id')

  if (!username || !isValidUsername(username) || !videoId || !isValidVideoId(videoId)) {
    return NextResponse.json({ error: 'Missing or invalid username/id' }, { status: 400 })
  }

  try {
    const meta = await fetchTikTokMetadata(username, videoId)
    if (!meta) {
      return NextResponse.json({ error: 'TikTok not found or not available' }, { status: 404 })
    }

    // Defense in depth: re-validate even though fetchTikTokMetadata already filters.
    // Mirror HTML is third-party and must not be trusted transitively.
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
    console.error('TikTok video proxy error:', error)
    captureException(error, { endpoint: '/api/media/tiktok/video', username, videoId })
    return NextResponse.json({ error: 'Stream failed' }, { status: 500 })
  }
}
