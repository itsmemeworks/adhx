import { NextRequest, NextResponse } from 'next/server'
import { isValidReelId } from '@/lib/media/instafix'
import { resolveInstagramVideo } from '@/lib/media/instagram-video'
import { streamingResponse } from '@/lib/media/proxy'
import { mediaRateLimit } from '@/lib/rate-limit'

/** Stream a direct Instagram MP4, with a bounded mirror fallback. */
export async function GET(request: NextRequest) {
  const rateLimited = mediaRateLimit(request)
  if (rateLimited) return rateLimited

  const id = request.nextUrl.searchParams.get('id')
  if (!id || !isValidReelId(id)) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  }

  const upstream = await resolveInstagramVideo(id, {
    range: request.headers.get('range'),
    signal: request.signal,
  })
  if (upstream.kind === 'photo') {
    return NextResponse.json(
      {
        error: 'This Instagram post is a photo',
        contentType: 'photo',
        photoCount: upstream.photoCount,
      },
      { status: 409 },
    )
  }
  if (upstream.kind === 'unavailable') {
    return NextResponse.json({ error: 'Instagram video unavailable' }, { status: 502 })
  }

  // The mirror CDN labels the MP4 as application/octet-stream — force video/mp4
  // so the <video> element plays it.
  return streamingResponse(upstream.response, { contentType: 'video/mp4' })
}
