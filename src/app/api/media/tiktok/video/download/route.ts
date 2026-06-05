import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'
import {
  fetchTikTokMetadata,
  isAllowedVideoUrl,
  isValidUsername,
  isValidVideoId,
} from '@/lib/media/tnktok'

/**
 * TikTok video download — streams the MP4 through the server with
 * `Content-Disposition: attachment` for instant browser downloads.
 *
 * GET /api/media/tiktok/video/download?username={handle}&id={videoId}
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

    if (!isAllowedVideoUrl(meta.videoUrl)) {
      return NextResponse.json({ error: 'Invalid video source' }, { status: 403 })
    }

    const videoResponse = await fetch(meta.videoUrl, {
      signal: AbortSignal.timeout(30_000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    })

    if (!videoResponse.ok || !videoResponse.body) {
      return NextResponse.json({ error: 'Failed to fetch video' }, { status: 502 })
    }

    const handle = username.startsWith('@') ? username.slice(1) : username
    const headers = new Headers()
    headers.set('Content-Type', 'video/mp4')
    headers.set('Content-Disposition', `attachment; filename="tiktok-${handle}-${videoId}.mp4"`)
    const contentLength = videoResponse.headers.get('Content-Length')
    if (contentLength) headers.set('Content-Length', contentLength)

    return new Response(videoResponse.body, { headers })
  } catch (error) {
    console.error('TikTok download error:', error)
    captureException(error, { endpoint: '/api/media/tiktok/video/download', username, videoId })
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
