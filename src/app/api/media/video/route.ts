import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'

// Simple in-memory cache for video URLs (survives for 1 hour)
// Cache key includes quality for different variants
const videoUrlCache = new Map<string, { url: string; timestamp: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

// SSRF Protection: Only allow fetching from trusted Twitter video domains
const ALLOWED_VIDEO_DOMAINS = [
  'video.twimg.com',
  'pbs.twimg.com',
  'abs.twimg.com',
]

/**
 * Validate that a URL is from an allowed domain (SSRF protection)
 */
function isAllowedVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_VIDEO_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    )
  } catch {
    return false
  }
}

interface VideoFormat {
  url: string
  bitrate?: number
  container?: string
  codec?: string
}

// GET /api/media/video?author=xxx&tweetId=xxx&quality=preview|hd|full
// Resolves video URL from FxTwitter and streams it through the server
// This avoids 403 errors from direct browser requests to video.twimg.com
// Quality options:
//   - preview: 360p (~832kbps) - best for hover previews
//   - hd: 720p (~2Mbps) - default, good balance
//   - full: 1080p (~10Mbps) - highest quality
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const author = searchParams.get('author')
  const tweetId = searchParams.get('tweetId')
  const quality = searchParams.get('quality') || 'hd' // Default to 720p

  if (!author || !tweetId) {
    return NextResponse.json({ error: 'Missing author or tweetId' }, { status: 400 })
  }

  const cacheKey = `${author}/${tweetId}/${quality}`

  try {
    // Check cache for resolved URL
    let videoUrl: string | undefined
    const cached = videoUrlCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      videoUrl = cached.url
    }

    // If not cached, resolve from FxTwitter API
    if (!videoUrl) {
      const response = await fetch(`https://api.fxtwitter.com/${author}/status/${tweetId}`, {
        headers: {
          'User-Agent': 'ADHX/1.0',
        },
      })

      if (!response.ok) {
        throw new Error(`fxtwitter API returned ${response.status}`)
      }

      const data = await response.json()
      const video = data.tweet?.media?.videos?.[0]

      if (!video) {
        return NextResponse.json({ error: 'No video found for this tweet' }, { status: 404 })
      }

      // Select video URL based on quality preference
      videoUrl = video.url as string // Default to highest quality

      if (video.formats && Array.isArray(video.formats)) {
        const formats = video.formats.filter((f: VideoFormat) => f.container === 'mp4' && f.bitrate) as VideoFormat[]

        if (formats.length > 0) {
          // Sort by bitrate ascending
          formats.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0))

          switch (quality) {
            case 'preview':
              // Pick ~360p (lowest MP4) for fast preview
              videoUrl = formats[0]?.url || videoUrl
              break
            case 'hd':
              // Pick ~720p (second highest or middle quality)
              // Typically: 256k, 832k, 2176k, 10368k
              // We want 2176k (720p)
              const hdFormat = formats.find((f: VideoFormat) => (f.bitrate || 0) >= 1500000 && (f.bitrate || 0) <= 3000000)
              videoUrl = hdFormat?.url || formats[formats.length - 2]?.url || videoUrl
              break
            case 'full':
            default:
              // Highest quality
              videoUrl = formats[formats.length - 1]?.url || videoUrl
              break
          }
        }
      }

      // Ensure we have a video URL
      if (!videoUrl) {
        return NextResponse.json({ error: 'No video URL found' }, { status: 404 })
      }

      // Cache the URL
      videoUrlCache.set(cacheKey, { url: videoUrl, timestamp: Date.now() })

      // Clean old cache entries periodically
      if (videoUrlCache.size > 1000) {
        const now = Date.now()
        for (const [key, value] of videoUrlCache.entries()) {
          if (now - value.timestamp > CACHE_TTL) {
            videoUrlCache.delete(key)
          }
        }
      }
    }

    // SSRF Protection: Validate video URL is from trusted domain before fetching
    if (!isAllowedVideoUrl(videoUrl)) {
      console.error(`SSRF blocked: Video URL from untrusted domain: ${videoUrl}`)
      return NextResponse.json({ error: 'Invalid video source' }, { status: 403 })
    }

    // Stream video through server instead of redirecting
    // This avoids 403 errors from direct browser requests to video.twimg.com
    const rangeHeader = request.headers.get('range')
    const videoResponse = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'ADHX/1.0',
        ...(rangeHeader && { 'Range': rangeHeader }),
      },
    })

    if (!videoResponse.ok && videoResponse.status !== 206) {
      throw new Error(`Video fetch failed with status ${videoResponse.status}`)
    }

    // Build response headers
    const responseHeaders: Record<string, string> = {
      'Content-Type': videoResponse.headers.get('content-type') || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    }

    const contentLength = videoResponse.headers.get('content-length')
    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength
    }

    const contentRange = videoResponse.headers.get('content-range')
    if (contentRange) {
      responseHeaders['Content-Range'] = contentRange
    }

    return new Response(videoResponse.body, {
      status: videoResponse.status,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('Error fetching video:', error)
    captureException(error, { endpoint: '/api/media/video', author, tweetId })
    return NextResponse.json(
      { error: 'Failed to fetch video' },
      { status: 500 }
    )
  }
}
