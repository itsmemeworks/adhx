import { NextRequest, NextResponse } from 'next/server'
import { resolveTikTokUrl } from '@/lib/media/tnktok'

/**
 * Resolve a TikTok short link (vm./vt.tiktok.com/{code}, /t/{code}) to its
 * canonical `@handle/video/{id}` form.
 *
 * GET /api/tiktok/resolve?url=<tiktok url>
 *   - default: returns { handle, videoId, url } JSON
 *   - &go=1:   307-redirects to the in-app preview `/@handle/video/{id}`
 *
 * Used by the middleware (URL-prefix paste) and the landing/preview inputs,
 * which can't follow cross-origin redirects client-side.
 */

/**
 * Same-origin redirect via a RELATIVE Location header. NextResponse.redirect
 * requires an absolute URL built from request.url, but behind Fly's proxy
 * request.url is the internal bind address (http://0.0.0.0:3000), which would
 * send the browser to an unreachable host. A relative Location is resolved by
 * the browser against the real request origin (adhx.com), avoiding that.
 */
function relativeRedirect(path: string) {
  return new NextResponse(null, { status: 307, headers: { Location: path } })
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('url')
  const go = request.nextUrl.searchParams.get('go') === '1'

  if (!raw) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  const resolved = await resolveTikTokUrl(raw)

  if (!resolved) {
    if (go) {
      // Send the user somewhere sensible instead of a JSON error.
      return relativeRedirect('/?error=' + encodeURIComponent('Could not resolve that TikTok link'))
    }
    return NextResponse.json({ error: 'Could not resolve TikTok URL' }, { status: 404 })
  }

  const previewPath = `/@${resolved.handle}/video/${resolved.videoId}`

  if (go) {
    return relativeRedirect(previewPath)
  }

  return NextResponse.json({ ...resolved, url: previewPath })
}
