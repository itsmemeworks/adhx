import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'
import { isValidReelId } from '@/lib/media/instafix'
import { instagramVideoUrls } from '@/lib/media/mirrors'
import { streamingResponse } from '@/lib/media/proxy'

/**
 * Instagram Reel video proxy — streams the MP4 through the server for inline
 * playback in a `<video>` tag. Supports Range requests for seeking.
 *
 * Resolves through the pluggable mirror registry (`@/lib/media/mirrors`),
 * trying each mirror in order and falling back to the next on failure — these
 * mirrors are flaky, so on a total miss we 502 and the client degrades to the
 * poster (the metadata/thumbnail path is independent and still works).
 *
 * GET /api/media/instagram/video?id={reelId}
 */
const STREAM_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id || !isValidReelId(id)) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  }

  const rangeHeader = request.headers.get('range')

  for (const url of instagramVideoUrls(id)) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        redirect: 'follow',
        headers: {
          'User-Agent': STREAM_UA,
          ...(rangeHeader ? { Range: rangeHeader } : {}),
        },
      })
      if ((res.ok || res.status === 206) && res.body) {
        // The mirror CDN labels the MP4 as application/octet-stream — force
        // video/mp4 so the <video> element plays it.
        return streamingResponse(res, { contentType: 'video/mp4' })
      }
      await res.body?.cancel()
    } catch (error) {
      captureException(error, { endpoint: '/api/media/instagram/video', id, url })
    }
  }

  return NextResponse.json({ error: 'Instagram video unavailable' }, { status: 502 })
}
