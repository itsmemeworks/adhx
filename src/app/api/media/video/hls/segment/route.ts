import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'

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
  const searchParams = request.nextUrl.searchParams
  const segmentUrl = searchParams.get('url')

  if (!segmentUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    // Validate URL is from Twitter's video CDN
    const url = new URL(segmentUrl)
    if (!url.hostname.includes('twimg.com') && !url.hostname.includes('twitter.com')) {
      return NextResponse.json({ error: 'Invalid segment URL' }, { status: 400 })
    }

    // Fetch the segment
    const response = await fetch(segmentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://twitter.com/',
        'Origin': 'https://twitter.com',
      },
    })

    if (!response.ok) {
      console.error(`Segment proxy failed: ${response.status} for ${segmentUrl}`)
      return NextResponse.json(
        { error: `Failed to fetch segment: ${response.status}` },
        { status: response.status }
      )
    }

    // Determine content type based on file extension
    let contentType = 'video/MP2T' // Default for .ts files
    if (segmentUrl.includes('.m4s')) {
      contentType = 'video/iso.segment'
    } else if (segmentUrl.includes('.mp4')) {
      contentType = 'video/mp4'
    } else if (segmentUrl.includes('.m4a')) {
      contentType = 'audio/mp4'
    } else if (segmentUrl.includes('.aac')) {
      contentType = 'audio/aac'
    }

    // Stream the segment data
    const data = await response.arrayBuffer()

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': data.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600', // Cache segments for 1 hour
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Segment proxy error:', error)
    captureException(error, { endpoint: '/api/media/video/hls/segment', segmentUrl })
    return NextResponse.json({ error: 'Failed to proxy segment' }, { status: 500 })
  }
}
