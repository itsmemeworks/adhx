import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'
import { isValidReelId } from '@/lib/media/instafix'
import { instagramVideoUrls } from '@/lib/media/mirrors'
import { downloadResponse } from '@/lib/media/proxy'

/**
 * Instagram Reel download — streams the MP4 with `Content-Disposition:
 * attachment` so the browser saves it. Resolves through the pluggable mirror
 * registry (`@/lib/media/mirrors`), falling back across mirrors; 502 on a
 * total miss.
 *
 * GET /api/media/instagram/video/download?id={reelId}
 */
const STREAM_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id || !isValidReelId(id)) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  }

  for (const url of instagramVideoUrls(id)) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        redirect: 'follow',
        headers: { 'User-Agent': STREAM_UA },
      })
      if (res.ok && res.body) {
        return downloadResponse(res, `instagram-${id}.mp4`)
      }
      await res.body?.cancel()
    } catch (error) {
      captureException(error, { endpoint: '/api/media/instagram/video/download', id, url })
    }
  }

  return NextResponse.json({ error: 'Instagram video unavailable' }, { status: 502 })
}
