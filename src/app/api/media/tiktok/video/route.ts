import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'
import {
  fetchTikTokMetadata,
  isAllowedVideoUrl,
  isValidUsername,
  isValidVideoId,
} from '@/lib/media/tnktok'
import {
  fetchWithAllowlistedRedirects,
  isUntrustedMediaRedirectError,
  streamingResponse,
} from '@/lib/media/proxy'
import { mediaRateLimit } from '@/lib/rate-limit'

const TIKTOK_VIDEO_HOSTS = [
  'tnktok.com',
  '.tnktok.com',
  'tiktokcdn.com',
  '.tiktokcdn.com',
  'tiktokcdn-us.com',
  '.tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  '.tiktokcdn-eu.com',
]

/**
 * TikTok video proxy — streams the MP4 through the server for inline playback
 * in a `<video>` tag. Supports Range requests for seeking.
 *
 * GET /api/media/tiktok/video?username={handle}&id={videoId}
 */
export async function GET(request: NextRequest) {
  const rateLimited = mediaRateLimit(request)
  if (rateLimited) return rateLimited

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
    const videoResponse = await fetchWithAllowlistedRedirects(meta.videoUrl, {
      hosts: TIKTOK_VIDEO_HOSTS,
      timeoutMs: 30_000,
      init: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          ...(rangeHeader ? { Range: rangeHeader } : {}),
        },
      },
    })

    if ((!videoResponse.ok && videoResponse.status !== 206) || !videoResponse.body) {
      await videoResponse.body?.cancel()
      return NextResponse.json({ error: 'Failed to fetch video' }, { status: 502 })
    }

    return streamingResponse(videoResponse)
  } catch (error) {
    if (isUntrustedMediaRedirectError(error)) {
      return NextResponse.json({ error: 'Untrusted video redirect' }, { status: 502 })
    }
    console.error('TikTok video proxy error:', error)
    captureException(error, { endpoint: '/api/media/tiktok/video', username, videoId })
    return NextResponse.json({ error: 'Stream failed' }, { status: 500 })
  }
}
