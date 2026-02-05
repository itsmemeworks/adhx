import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'

/**
 * Video Download Endpoint - Streams video with Content-Disposition for instant browser download
 *
 * Unlike the regular video proxy, this endpoint:
 * 1. Sets Content-Disposition: attachment to trigger browser's download manager
 * 2. Passes Content-Length for progress indication
 * 3. Streams directly without buffering in memory
 *
 * GET /api/media/video/download?author=xxx&tweetId=xxx&quality=full
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const author = searchParams.get('author')
  const tweetId = searchParams.get('tweetId')
  const quality = searchParams.get('quality') || 'hd'

  if (!author || !tweetId) {
    return NextResponse.json({ error: 'Missing author or tweetId' }, { status: 400 })
  }

  try {
    // Get video info to find the best MP4 URL
    const infoResponse = await fetch(
      `https://api.fxtwitter.com/${author}/status/${tweetId}`,
      { headers: { 'User-Agent': 'ADHX/1.0' }, signal: AbortSignal.timeout(10_000) }
    )

    if (!infoResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch video info' }, { status: 404 })
    }

    const data = await infoResponse.json()
    const video = data.tweet?.media?.videos?.[0]

    if (!video) {
      return NextResponse.json({ error: 'No video found' }, { status: 404 })
    }

    // Find the appropriate MP4 URL based on quality
    const formats = (video.formats || []) as Array<{ bitrate: number | null; url: string }>
    const mp4Formats = formats
      .filter((f) => f.bitrate && f.url?.includes('.mp4'))
      .sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0))

    if (mp4Formats.length === 0) {
      return NextResponse.json({ error: 'No MP4 format available' }, { status: 404 })
    }

    // Select quality: full = highest, hd = second highest, preview = lowest
    let selectedFormat = mp4Formats[mp4Formats.length - 1] // Default to highest
    if (quality === 'preview' && mp4Formats.length > 0) {
      selectedFormat = mp4Formats[0]
    } else if (quality === 'hd' && mp4Formats.length > 1) {
      selectedFormat = mp4Formats[Math.max(0, mp4Formats.length - 2)]
    }

    const videoUrl = selectedFormat.url

    // Fetch the video with streaming (30s timeout for large files)
    const videoResponse = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://twitter.com/',
      },
      signal: AbortSignal.timeout(30_000),
    })

    if (!videoResponse.ok || !videoResponse.body) {
      return NextResponse.json({ error: 'Failed to fetch video' }, { status: 502 })
    }

    // Generate filename
    const filename = `${author}-${tweetId}.mp4`

    // Stream the response with download headers
    const headers = new Headers()
    headers.set('Content-Type', 'video/mp4')
    headers.set('Content-Disposition', `attachment; filename="${filename}"`)

    // Pass through Content-Length for progress indication
    const contentLength = videoResponse.headers.get('Content-Length')
    if (contentLength) {
      headers.set('Content-Length', contentLength)
    }

    // Stream the video directly to the client
    return new Response(videoResponse.body, { headers })
  } catch (error) {
    console.error('Video download error:', error)
    captureException(error, { endpoint: '/api/media/video/download', author, tweetId })
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
