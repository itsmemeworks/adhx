import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'

/**
 * HLS Proxy - Fetches m3u8 playlists from Twitter and rewrites segment URLs
 *
 * Twitter's video CDN blocks direct browser requests (403 Forbidden).
 * This proxy:
 * 1. Fetches the m3u8 playlist with proper headers
 * 2. Rewrites segment URLs to point to our segment proxy
 * 3. Returns the modified playlist to the browser
 *
 * GET /api/media/video/hls?url=<encoded-m3u8-url>
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const hlsUrl = searchParams.get('url')

  if (!hlsUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    // Validate URL is from Twitter's video CDN (strict domain check to prevent SSRF)
    const url = new URL(hlsUrl)
    const isAllowed = url.hostname === 'video.twimg.com'
      || url.hostname.endsWith('.twimg.com')
      || url.hostname === 'twitter.com'
      || url.hostname.endsWith('.twitter.com')
    if (!isAllowed) {
      return NextResponse.json({ error: 'Invalid HLS URL' }, { status: 400 })
    }

    // Fetch the m3u8 playlist
    const response = await fetch(hlsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://twitter.com/',
        'Origin': 'https://twitter.com',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      console.error(`HLS proxy failed: ${response.status} for ${hlsUrl}`)
      return NextResponse.json(
        { error: `Failed to fetch HLS playlist: ${response.status}` },
        { status: response.status }
      )
    }

    const playlistText = await response.text()

    // Rewrite URLs in the playlist to use our segment proxy
    const rewrittenPlaylist = rewritePlaylistUrls(playlistText, hlsUrl)

    return new NextResponse(rewrittenPlaylist, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    })
  } catch (error) {
    console.error('HLS proxy error:', error)
    captureException(error, { endpoint: '/api/media/video/hls', hlsUrl })
    return NextResponse.json({ error: 'Failed to proxy HLS playlist' }, { status: 500 })
  }
}

/**
 * Rewrites URLs in an m3u8 playlist to use our segment proxy.
 *
 * m3u8 playlists can contain:
 * - Relative URLs (e.g., "segment0.ts")
 * - Absolute URLs (e.g., "https://video.twimg.com/.../segment0.ts")
 * - Nested playlist URLs for different quality levels
 */
function rewritePlaylistUrls(playlist: string, baseUrl: string): string {
  const baseUrlObj = new URL(baseUrl)
  const lines = playlist.split('\n')

  return lines
    .map((line) => {
      const trimmedLine = line.trim()

      // Skip empty lines and comments (except #EXT-X-MAP which has URIs)
      if (!trimmedLine || (trimmedLine.startsWith('#') && !trimmedLine.includes('URI='))) {
        return line
      }

      // Handle URI="..." attributes in #EXT-X-MEDIA and #EXT-X-MAP tags
      if (trimmedLine.includes('URI=')) {
        return line.replace(/URI="([^"]+)"/, (match, uri) => {
          const absoluteUrl = resolveUrl(uri, baseUrlObj)
          // Check if it's a playlist (m3u8) or a segment
          if (absoluteUrl.includes('.m3u8')) {
            // Nested playlist - use main HLS proxy
            const proxyUrl = `/api/media/video/hls?url=${encodeURIComponent(absoluteUrl)}`
            return `URI="${proxyUrl}"`
          } else {
            // Segment file (mp4, m4s, ts) - use segment proxy
            const proxyUrl = `/api/media/video/hls/segment?url=${encodeURIComponent(absoluteUrl)}`
            return `URI="${proxyUrl}"`
          }
        })
      }

      // Non-comment lines are URLs (segments or nested playlists)
      if (!trimmedLine.startsWith('#')) {
        const absoluteUrl = resolveUrl(trimmedLine, baseUrlObj)

        // Check if it's a nested playlist (.m3u8) or a segment (.ts, .m4s, etc.)
        if (absoluteUrl.includes('.m3u8')) {
          // Nested playlist - use the main HLS proxy
          return `/api/media/video/hls?url=${encodeURIComponent(absoluteUrl)}`
        } else {
          // Segment file - use the segment proxy
          return `/api/media/video/hls/segment?url=${encodeURIComponent(absoluteUrl)}`
        }
      }

      return line
    })
    .join('\n')
}

/**
 * Resolves a potentially relative URL against a base URL
 */
function resolveUrl(url: string, baseUrl: URL): string {
  // Already absolute
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  // Relative URL - resolve against base
  return new URL(url, baseUrl).toString()
}
