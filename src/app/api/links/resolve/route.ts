import { NextRequest, NextResponse } from 'next/server'
import { expandShortLink, isShortLink } from '@/lib/keep/shortlinks'
import { detectPlatformPost } from '@/lib/platform/url'
import { publicReadRateLimit } from '@/lib/rate-limit'

/**
 * GET /api/links/resolve?url= — follow a network's short share link
 * (pin.it, reddit.com/r/x/s/…, on.soundcloud.com, threads.net/t/…) and go to
 * the post's ADHX page.
 */
export async function GET(request: NextRequest) {
  const blocked = publicReadRateLimit(request)
  if (blocked) return blocked
  const url = request.nextUrl.searchParams.get('url') ?? ''
  if (!isShortLink(url))
    return NextResponse.redirect(new URL('/share?error=unsupported', request.url))
  const full = await expandShortLink(url)
  const post = full ? detectPlatformPost(full) : null
  if (!post) return NextResponse.redirect(new URL('/share?error=unsupported', request.url))
  return new NextResponse(null, { status: 307, headers: { Location: post.previewPath } })
}
