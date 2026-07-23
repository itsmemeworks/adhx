import { NextRequest, NextResponse } from 'next/server'
import { isValidReelId } from '@/lib/media/instafix'
import { resolveInstagramVideo } from '@/lib/media/mirrors'
import { streamingResponse } from '@/lib/media/proxy'
import { mediaRateLimit } from '@/lib/rate-limit'

/**
 * Instagram Reel video proxy — streams the MP4 through the server for inline
 * playback in a `<video>` tag. Supports Range requests for seeking.
 *
 * Resolves through the pluggable mirror registry (`@/lib/media/mirrors`), which
 * tries each mirror and retries transient rate-limits/5xx — on a total miss we
 * 502 and the client degrades to the poster (the metadata/thumbnail path is
 * independent and still works).
 *
 * GET /api/media/instagram/video?id={reelId}
 */
export async function GET(request: NextRequest) {
  const rateLimited = mediaRateLimit(request)
  if (rateLimited) return rateLimited

  const id = request.nextUrl.searchParams.get('id')
  if (!id || !isValidReelId(id)) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  }

  const upstream = await resolveInstagramVideo(id, { range: request.headers.get('range') })
  if (!upstream) {
    return NextResponse.json({ error: 'Instagram video unavailable' }, { status: 502 })
  }

  // The mirror CDN labels the MP4 as application/octet-stream — force video/mp4
  // so the <video> element plays it.
  return streamingResponse(upstream, { contentType: 'video/mp4' })
}
