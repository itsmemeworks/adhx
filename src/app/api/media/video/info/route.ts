import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'

// Cache video info for 1 hour. Separate caches for with/without HEAD-measured sizes
// so the fast playback path never pays for the slow size-measurement path.
const videoInfoCache = new Map<string, { data: VideoInfo; timestamp: number }>()
const videoInfoCacheWithSizes = new Map<string, { data: VideoInfo; timestamp: number }>()
const CACHE_TTL = 60 * 60 * 1000

// Videos longer than this use HLS (chunked) instead of a single long MP4 proxy stream.
// HLS parallelizes segment fetches and avoids tying up a Fly.io proxy connection.
// Below 10s, MP4 through the proxy wins — single range request beats HLS's
// extra playlist + segment round trips.
const HLS_DURATION_THRESHOLD_SECONDS = 10

interface VideoFormat {
  bitrate: number | null
  url: string
  container?: string
}

interface VideoInfo {
  duration: number // seconds
  hlsUrl: string | null
  formats: Array<{
    quality: 'preview' | 'hd' | 'full'
    bitrate: number
    url: string
    estimatedSize: number // bytes, estimated from duration * bitrate
  }>
  thumbnail: string | null
  requiresHls: boolean // true if video is long (>5 min) and needs HLS
}

// GET /api/media/video/info?author=xxx&tweetId=xxx
// Returns video metadata to help the client decide how to play
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const author = searchParams.get('author')
  const tweetId = searchParams.get('tweetId')
  // withSizes=true triggers HEAD requests to measure actual file sizes.
  // Only the download-gate flow needs this; playback decisions use bitrate estimation.
  const withSizes = searchParams.get('withSizes') === 'true'

  if (!author || !tweetId) {
    return NextResponse.json({ error: 'Missing author or tweetId' }, { status: 400 })
  }

  const cacheKey = `${author}/${tweetId}`
  const cache = withSizes ? videoInfoCacheWithSizes : videoInfoCache

  try {
    // Check cache
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }

    // Fetch from FxTwitter
    const response = await fetch(`https://api.fxtwitter.com/${author}/status/${tweetId}`, {
      headers: { 'User-Agent': 'ADHX/1.0' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new Error(`FxTwitter API returned ${response.status}`)
    }

    const data = await response.json()
    const video = data.tweet?.media?.videos?.[0]

    if (!video) {
      return NextResponse.json({ error: 'No video found' }, { status: 404 })
    }

    // Extract video info
    const duration = video.duration || 0
    const formats = (video.formats || []) as VideoFormat[]

    // Find HLS URL (m3u8 playlist)
    const hlsFormat = formats.find((f) => f.url?.includes('.m3u8'))
    const hlsUrl = hlsFormat?.url || null

    // Find MP4 formats sorted by bitrate
    const mp4Formats = formats
      .filter((f) => f.bitrate && f.url?.includes('.mp4'))
      .sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0))

    // Fetch actual file size via HEAD request (more accurate than bitrate estimation).
    // Only called when withSizes=true — otherwise we use bitrate estimation to avoid
    // adding 3 serial round trips to video.twimg.com on every playback.
    async function getActualSize(url: string): Promise<number> {
      try {
        const headResponse = await fetch(url, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            Referer: 'https://twitter.com/',
          },
          signal: AbortSignal.timeout(10_000),
        })
        if (headResponse.ok) {
          const contentLength = headResponse.headers.get('content-length')
          if (contentLength) {
            return parseInt(contentLength, 10)
          }
        }
      } catch {
        // Fallback to bitrate estimation if HEAD fails
      }
      return 0
    }

    function estimateSize(bitrate: number): number {
      // duration in seconds × bitrate in bits-per-second ÷ 8 = bytes
      return Math.round((duration * bitrate) / 8)
    }

    // Map to quality levels
    const qualityFormats: VideoInfo['formats'] = []
    const formatUrls: string[] = []

    if (mp4Formats.length > 0) {
      // Preview = lowest bitrate
      qualityFormats.push({
        quality: 'preview',
        bitrate: mp4Formats[0].bitrate!,
        url: mp4Formats[0].url,
        estimatedSize: estimateSize(mp4Formats[0].bitrate!),
      })
      formatUrls.push(mp4Formats[0].url)
    }

    if (mp4Formats.length > 1) {
      // HD = second highest (typically 720p)
      const hdIndex = Math.max(0, mp4Formats.length - 2)
      qualityFormats.push({
        quality: 'hd',
        bitrate: mp4Formats[hdIndex].bitrate!,
        url: mp4Formats[hdIndex].url,
        estimatedSize: estimateSize(mp4Formats[hdIndex].bitrate!),
      })
      formatUrls.push(mp4Formats[hdIndex].url)
    }

    if (mp4Formats.length > 0) {
      // Full = highest bitrate
      qualityFormats.push({
        quality: 'full',
        bitrate: mp4Formats[mp4Formats.length - 1].bitrate!,
        url: mp4Formats[mp4Formats.length - 1].url,
        estimatedSize: estimateSize(mp4Formats[mp4Formats.length - 1].bitrate!),
      })
      formatUrls.push(mp4Formats[mp4Formats.length - 1].url)
    }

    // Only measure actual sizes when the caller explicitly asks for them.
    // The download-gate flow passes withSizes=true; the video player does not.
    if (withSizes) {
      const sizes = await Promise.all(formatUrls.map(getActualSize))
      sizes.forEach((size, i) => {
        if (size > 0) qualityFormats[i].estimatedSize = size
      })
    }

    // Long videos should use HLS to avoid tying up a single Fly.io proxy connection
    const requiresHls = duration > HLS_DURATION_THRESHOLD_SECONDS && hlsUrl !== null

    const videoInfo: VideoInfo = {
      duration,
      hlsUrl,
      formats: qualityFormats,
      thumbnail: video.thumbnail_url || data.tweet?.media?.videos?.[0]?.thumbnail_url || null,
      requiresHls,
    }

    // Cache the result
    cache.set(cacheKey, { data: videoInfo, timestamp: Date.now() })

    // Cleanup old cache entries
    if (cache.size > 500) {
      const now = Date.now()
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          cache.delete(key)
        }
      }
    }

    return NextResponse.json(videoInfo)
  } catch (error) {
    console.error('Error fetching video info:', error)
    captureException(error, { endpoint: '/api/media/video/info', author, tweetId })
    return NextResponse.json({ error: 'Failed to fetch video info' }, { status: 500 })
  }
}
