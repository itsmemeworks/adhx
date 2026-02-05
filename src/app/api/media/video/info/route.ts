import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'

// Cache video info for 1 hour
const videoInfoCache = new Map<string, { data: VideoInfo; timestamp: number }>()
const CACHE_TTL = 60 * 60 * 1000

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

  if (!author || !tweetId) {
    return NextResponse.json({ error: 'Missing author or tweetId' }, { status: 400 })
  }

  const cacheKey = `${author}/${tweetId}`

  try {
    // Check cache
    const cached = videoInfoCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data)
    }

    // Fetch from FxTwitter
    const response = await fetch(`https://api.fxtwitter.com/${author}/status/${tweetId}`, {
      headers: { 'User-Agent': 'ADHX/1.0' },
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

    // Helper to estimate file size from bitrate and duration
    // bitrate is in bits/sec, so divide by 8 for bytes, multiply by duration
    const estimateSize = (bitrate: number) => Math.round((bitrate / 8) * duration)

    // Map to quality levels
    const qualityFormats: VideoInfo['formats'] = []

    if (mp4Formats.length > 0) {
      // Preview = lowest bitrate
      const previewBitrate = mp4Formats[0].bitrate!
      qualityFormats.push({
        quality: 'preview',
        bitrate: previewBitrate,
        url: mp4Formats[0].url,
        estimatedSize: estimateSize(previewBitrate),
      })
    }

    if (mp4Formats.length > 1) {
      // HD = second highest (typically 720p)
      const hdIndex = Math.max(0, mp4Formats.length - 2)
      const hdBitrate = mp4Formats[hdIndex].bitrate!
      qualityFormats.push({
        quality: 'hd',
        bitrate: hdBitrate,
        url: mp4Formats[hdIndex].url,
        estimatedSize: estimateSize(hdBitrate),
      })
    }

    if (mp4Formats.length > 0) {
      // Full = highest bitrate
      const fullBitrate = mp4Formats[mp4Formats.length - 1].bitrate!
      qualityFormats.push({
        quality: 'full',
        bitrate: fullBitrate,
        url: mp4Formats[mp4Formats.length - 1].url,
        estimatedSize: estimateSize(fullBitrate),
      })
    }

    // Videos > 5 minutes (300s) should use HLS to avoid proxy timeout
    const requiresHls = duration > 300 && hlsUrl !== null

    const videoInfo: VideoInfo = {
      duration,
      hlsUrl,
      formats: qualityFormats,
      thumbnail: video.thumbnail_url || data.tweet?.media?.videos?.[0]?.thumbnail_url || null,
      requiresHls,
    }

    // Cache the result
    videoInfoCache.set(cacheKey, { data: videoInfo, timestamp: Date.now() })

    // Cleanup old cache entries
    if (videoInfoCache.size > 500) {
      const now = Date.now()
      for (const [key, value] of videoInfoCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          videoInfoCache.delete(key)
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
