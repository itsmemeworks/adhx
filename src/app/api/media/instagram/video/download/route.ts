import { NextRequest, NextResponse } from 'next/server'
import { isValidReelId } from '@/lib/media/instafix'
import { resolveInstagramVideo } from '@/lib/media/instagram-video'
import { downloadResponse } from '@/lib/media/proxy'
import { downloadRateLimit } from '@/lib/rate-limit'

/** Stream a direct Instagram MP4, with a bounded mirror fallback. */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id || !isValidReelId(id)) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  }

  const rateLimited = downloadRateLimit(request)
  if (rateLimited) return rateLimited

  const upstream = await resolveInstagramVideo(id, { signal: request.signal })
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

  return downloadResponse(upstream.response, `instagram-${id}.mp4`)
}
