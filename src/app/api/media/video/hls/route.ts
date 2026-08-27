import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'
import {
  buildAllowlistedUrl,
  fetchWithAllowlistedRedirects,
  isMediaResponseTooLargeError,
  isUntrustedMediaRedirectError,
  readResponseBodyWithLimit,
  TWITTER_HLS_HOSTS,
  UntrustedMediaRedirectError,
} from '@/lib/media/proxy'
import { mediaRateLimit } from '@/lib/rate-limit'

export const MAX_HLS_PLAYLIST_BYTES = 1024 * 1024
const HLS_OPERATION_TIMEOUT_MS = 10_000

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
  const rateLimited = mediaRateLimit(request)
  if (rateLimited) return rateLimited

  const searchParams = request.nextUrl.searchParams
  const hlsUrl = searchParams.get('url')

  if (!hlsUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    // Validate URL is from Twitter's video CDN (strict domain check + https-only
    // via the shared SSRF allowlist factory, to prevent SSRF) and rebuild the
    // fetch target from the validated URL's own parsed components — never the
    // raw query-param string — so the fetched URL is provably safe.
    const safeHlsUrl = buildAllowlistedUrl(hlsUrl, TWITTER_HLS_HOSTS)
    if (!safeHlsUrl || !isPlaylistUrl(safeHlsUrl)) {
      return NextResponse.json({ error: 'Invalid HLS URL' }, { status: 400 })
    }

    // Fetch the m3u8 playlist
    const response = await fetchWithAllowlistedRedirects(safeHlsUrl, {
      hosts: TWITTER_HLS_HOSTS,
      timeoutMs: HLS_OPERATION_TIMEOUT_MS,
      init: {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://twitter.com/',
          Origin: 'https://twitter.com',
        },
      },
    })

    if (!response.ok) {
      await response.body?.cancel()
      console.error(`HLS proxy failed: ${response.status} for ${hlsUrl}`)
      return NextResponse.json(
        { error: `Failed to fetch HLS playlist: ${response.status}` },
        { status: response.status },
      )
    }

    const playlistBytes = await readResponseBodyWithLimit(response, MAX_HLS_PLAYLIST_BYTES)
    const playlistText = new TextDecoder().decode(playlistBytes)

    // Rewrite URLs in the playlist to use our segment proxy
    const rewrittenPlaylist = rewritePlaylistUrls(playlistText, safeHlsUrl)

    return new NextResponse(rewrittenPlaylist, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    })
  } catch (error) {
    if (isMediaResponseTooLargeError(error)) {
      return NextResponse.json({ error: 'HLS playlist exceeds maximum size' }, { status: 413 })
    }
    if (isUntrustedMediaRedirectError(error)) {
      return NextResponse.json({ error: 'Untrusted URL in HLS playlist' }, { status: 502 })
    }
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
          const absoluteUrl = safeResolvedUrl(uri, baseUrlObj)
          // Check if it's a playlist (m3u8) or a segment
          if (isPlaylistUrl(absoluteUrl)) {
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
        const absoluteUrl = safeResolvedUrl(trimmedLine, baseUrlObj)

        // Check if it's a nested playlist (.m3u8) or a segment (.ts, .m4s, etc.)
        if (isPlaylistUrl(absoluteUrl)) {
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

function safeResolvedUrl(url: string, baseUrl: URL): string {
  let resolved: string
  try {
    resolved = new URL(url, baseUrl).toString()
  } catch {
    throw new UntrustedMediaRedirectError('Invalid URL in HLS playlist')
  }

  const safeUrl = buildAllowlistedUrl(resolved, TWITTER_HLS_HOSTS)
  if (!safeUrl) {
    throw new UntrustedMediaRedirectError('Untrusted URL in HLS playlist')
  }
  return safeUrl
}

function isPlaylistUrl(url: string): boolean {
  return new URL(url).pathname.toLowerCase().endsWith('.m3u8')
}
