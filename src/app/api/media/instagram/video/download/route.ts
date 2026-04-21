import { NextRequest, NextResponse } from 'next/server'
import { captureException } from '@/lib/sentry'
import { fetchReelMetadata, isAllowedVideoUrl, isValidReelId } from '@/lib/media/instafix'

/**
 * Instagram Reel download — streams the Meta CDN video through the server
 * with `Content-Disposition: attachment` to trigger an instant browser download.
 *
 * GET /api/media/instagram/video/download?id={reelId}
 *
 * No auth: this mirrors `/api/media/video/download` (the Twitter equivalent),
 * which backs the public preview page.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')

  if (!id || !isValidReelId(id)) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  }

  try {
    const meta = await fetchReelMetadata(id)
    if (!meta) {
      return NextResponse.json({ error: 'Reel not found or not available' }, { status: 404 })
    }

    // fetchReelMetadata already validates, but re-check before issuing the
    // upstream fetch — mirror HTML is third-party and must not be trusted
    // transitively. This is the SSRF choke point.
    if (!isAllowedVideoUrl(meta.videoUrl)) {
      return NextResponse.json({ error: 'Invalid video source' }, { status: 403 })
    }

    // The mirror's /videos/ endpoint redirects to its own signing proxy
    // (e.g. toinstagram.com → cp.toinstagram.com). Let Node follow that hop
    // — it stays within the allowlisted parent domain.
    const videoResponse = await fetch(meta.videoUrl, {
      signal: AbortSignal.timeout(30_000),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    })

    if (!videoResponse.ok || !videoResponse.body) {
      return NextResponse.json({ error: 'Failed to fetch video' }, { status: 502 })
    }

    const headers = new Headers()
    headers.set('Content-Type', 'video/mp4')
    headers.set('Content-Disposition', `attachment; filename="instagram-${id}.mp4"`)

    const contentLength = videoResponse.headers.get('Content-Length')
    if (contentLength) headers.set('Content-Length', contentLength)

    return new Response(videoResponse.body, { headers })
  } catch (error) {
    console.error('Instagram download error:', error)
    captureException(error, { endpoint: '/api/media/instagram/video/download', id })
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
