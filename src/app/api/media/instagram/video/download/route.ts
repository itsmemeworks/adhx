import { NextRequest, NextResponse } from 'next/server'
import { isValidReelId } from '@/lib/media/instafix'
import { resolveInstagramVideo } from '@/lib/media/mirrors'
import { downloadResponse } from '@/lib/media/proxy'

/**
 * Instagram Reel download — streams the MP4 with `Content-Disposition:
 * attachment` so the browser saves it. Resolves through the pluggable mirror
 * registry (`@/lib/media/mirrors`, with retry/fallback); 502 on a total miss.
 *
 * GET /api/media/instagram/video/download?id={reelId}
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id || !isValidReelId(id)) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  }

  const upstream = await resolveInstagramVideo(id)
  if (!upstream) {
    return NextResponse.json({ error: 'Instagram video unavailable' }, { status: 502 })
  }

  return downloadResponse(upstream, `instagram-${id}.mp4`)
}
