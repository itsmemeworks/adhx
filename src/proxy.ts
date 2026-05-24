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
 *
 * Extracted IDs are redirected to the clean route format:
 *   - X / Twitter  →  /{username}/status/{id}
 *   - Instagram    →  /reels/{id}
 */

// Browsers normalize `//` → `/` in paths, so `https://x.com` becomes `https:/x.com`.
const TWITTER_URL_PATTERN =
  /^\/(https?:\/?\/?)?(?:www\.)?(x\.com|twitter\.com)\/(\w{1,15})\/status\/(\d+)/i

const INSTAGRAM_URL_PATTERN =
  /^\/(?:https?:\/?\/?)?(?:www\.)?instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/i

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
