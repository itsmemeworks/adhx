import { NextRequest, NextResponse } from 'next/server'
import { captureException, metrics } from '@/lib/sentry'
import {
  goneResponse,
  fetchWithAllowlistedRedirects,
  isAllowedTwitterMediaUrl,
  isFxTwitterGoneStatus,
  isTweetGoneCached,
  isUntrustedMediaRedirectError,
  isValidTweetAuthor,
  isValidTweetId,
  markTweetGone,
  parseTweetMediaIndex,
  streamingResponse,
  TWITTER_MEDIA_HOSTS,
} from '@/lib/media/proxy'
import { mediaRateLimit } from '@/lib/rate-limit'
import { fetchWithTimeout } from '@/lib/utils/fetch-timeout'

// Simple in-memory cache for video URLs (survives for 1 hour)
// Cache key includes quality for different variants
const videoUrlCache = new Map<string, { url: string; timestamp: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

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
  const rateLimited = mediaRateLimit(request)
  if (rateLimited) return rateLimited

  const searchParams = request.nextUrl.searchParams
  const author = searchParams.get('author')
  const tweetId = searchParams.get('tweetId')
  const quality = searchParams.get('quality') || 'hd' // Default to 720p
  const index = parseTweetMediaIndex(searchParams.get('index'))

  if (!author || !tweetId) {
    return NextResponse.json({ error: 'Missing author or tweetId' }, { status: 400 })
  }

  // Sanitise the user-provided params before interpolating them into the
  // FxTwitter API URL (prevents request-forgery via a crafted author/tweetId).
  if (!isValidTweetAuthor(author) || !isValidTweetId(tweetId)) {
    return NextResponse.json({ error: 'Invalid author or tweetId' }, { status: 400 })
  }

  const cacheKey = `${author}/${tweetId}/${quality}/${index}`

  try {
    // Check cache for resolved URL
    let videoUrl: string | undefined
    const cached = videoUrlCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      videoUrl = cached.url
    }

    // If not cached, resolve from FxTwitter API
    if (!videoUrl) {
      const goneKey = `${author}/${tweetId}`
      if (isTweetGoneCached(goneKey)) {
        return goneResponse()
      }

      const response = await fetchWithTimeout(
        `https://api.fxtwitter.com/${author}/status/${tweetId}`,
        10_000,
        {
          headers: {
            'User-Agent': 'ADHX/1.0',
          },
        },
      )

      if (!response.ok) {
        await response.body?.cancel()
        if (isFxTwitterGoneStatus(response.status)) {
          // Deleted/private/suspended — not a proxy error, and it won't come
          // back on a retry. Cache it so the theater's video stage doesn't
          // hammer FxTwitter every time this tweet is viewed or retried.
          markTweetGone(goneKey)
          metrics.mediaUnavailable('video', response.status)
          return goneResponse()
        }
        throw new Error(`fxtwitter API returned ${response.status}`)
      }

      const data = await response.json()
      const videos = data.tweet?.media?.videos
      const video = Array.isArray(videos) ? videos[index - 1] : undefined

      if (!video) {
        return NextResponse.json({ error: 'No video found for this tweet' }, { status: 404 })
      }

      // Select video URL based on quality preference
      videoUrl = video.url as string // Default to highest quality

      if (video.formats && Array.isArray(video.formats)) {
        const formats = video.formats.filter(
          (f: VideoFormat) => f.container === 'mp4' && f.bitrate,
        ) as VideoFormat[]

        if (formats.length > 0) {
          // Sort by bitrate ascending
          formats.sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0))

          // Index-based selection matches /api/media/video/info so the "hd" label
          // points at the same format in both endpoints. That keeps download-gate
          // size estimates consistent with what actually streams, and avoids pushing
          // a 720p file through the proxy when the player asks for "hd".
          switch (quality) {
            case 'preview':
              // Lowest bitrate
              videoUrl = formats[0]?.url || videoUrl
              break
            case 'hd':
              // Second-highest bitrate (typically ~360p for 3-format tweets,
              // ~720p for 4-format tweets). Matches info endpoint.
              videoUrl = formats[Math.max(0, formats.length - 2)]?.url || videoUrl
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
    if (!isAllowedTwitterMediaUrl(videoUrl)) {
      console.error(`SSRF blocked: Video URL from untrusted domain: ${videoUrl}`)
      return NextResponse.json({ error: 'Invalid video source' }, { status: 403 })
    }

    // Stream video through server instead of redirecting
    // This avoids 403 errors from direct browser requests to video.twimg.com
    const rangeHeader = request.headers.get('range')
    // Large file download — if the upstream CDN hangs, don't tie up the proxy forever
    const videoResponse = await fetchWithAllowlistedRedirects(videoUrl, {
      hosts: TWITTER_MEDIA_HOSTS,
      timeoutMs: 30_000,
      init: {
        headers: {
          'User-Agent': 'ADHX/1.0',
          ...(rangeHeader && { Range: rangeHeader }),
        },
      },
    })

    if (!videoResponse.ok && videoResponse.status !== 206) {
      await videoResponse.body?.cancel()
      throw new Error(`Video fetch failed with status ${videoResponse.status}`)
    }

    // Stream the upstream response through with range-aware headers
    return streamingResponse(videoResponse)
  } catch (error) {
    if (isUntrustedMediaRedirectError(error)) {
      return NextResponse.json({ error: 'Untrusted video redirect' }, { status: 502 })
    }
    console.error('Error fetching video:', error)
    captureException(error, { endpoint: '/api/media/video', author, tweetId })
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 })
  }
}
