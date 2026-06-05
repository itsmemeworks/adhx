import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Proxy to handle pasted social URLs.
 *
 * Users might paste full URLs like:
 *   adhx.com/https://x.com/user/status/123
 *   adhx.com/https://twitter.com/user/status/123
 *   adhx.com/x.com/user/status/123
 *   adhx.com/https://www.instagram.com/reels/DXVsqQ7CSXw/
 *   adhx.com/instagram.com/p/DXVsqQ7CSXw/
 *   adhx.com/https://www.tiktok.com/@user/video/7619017281691045134
 *   adhx.com/tiktok.com/@user/video/123
 *
 * Extracted IDs are redirected to the clean route format:
 *   - X / Twitter  →  /{username}/status/{id}
 *   - Instagram    →  /reels/{id}
 *   - TikTok       →  /@{username}/video/{id}
 */

// Browsers normalize `//` → `/` in paths, so `https://x.com` becomes `https:/x.com`.
const TWITTER_URL_PATTERN =
  /^\/(https?:\/?\/?)?(?:www\.)?(x\.com|twitter\.com)\/(\w{1,15})\/status\/(\d+)/i

const INSTAGRAM_URL_PATTERN =
  /^\/(?:https?:\/?\/?)?(?:www\.)?instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/i

const TIKTOK_URL_PATTERN =
  /^\/(?:https?:\/?\/?)?(?:www\.|vm\.|m\.)?tiktok\.com\/@?([A-Za-z0-9._]{1,30})\/video\/(\d{6,25})/i

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const tweetMatch = pathname.match(TWITTER_URL_PATTERN)
  if (tweetMatch) {
    const [, , , username, tweetId] = tweetMatch
    const cleanUrl = new URL(`/${username}/status/${tweetId}`, request.url)
    cleanUrl.search = request.nextUrl.search
    return NextResponse.redirect(cleanUrl, { status: 307 })
  }

  const reelMatch = pathname.match(INSTAGRAM_URL_PATTERN)
  if (reelMatch) {
    const [, reelId] = reelMatch
    const cleanUrl = new URL(`/reels/${reelId}`, request.url)
    cleanUrl.search = request.nextUrl.search
    return NextResponse.redirect(cleanUrl, { status: 307 })
  }

  const tiktokMatch = pathname.match(TIKTOK_URL_PATTERN)
  if (tiktokMatch) {
    const [, tiktokUsername, tiktokVideoId] = tiktokMatch
    const cleanUrl = new URL(`/@${tiktokUsername}/video/${tiktokVideoId}`, request.url)
    cleanUrl.search = request.nextUrl.search
    return NextResponse.redirect(cleanUrl, { status: 307 })
  }

  return NextResponse.next()
}

// Run proxy on paths that might be pasted URLs
// Use negative lookahead to skip API routes, static files, and Next.js internals
export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - /api/* (API routes)
     * - /_next/* (Next.js internals)
     * - /favicon.ico, /logo.png, etc (static files)
     */
    '/((?!api|_next|favicon\\.ico|logo\\.png|.*\\.[a-z]{2,4}$).*)',
  ],
}
