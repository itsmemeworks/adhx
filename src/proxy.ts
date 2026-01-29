import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Proxy to handle pasted Twitter/X URLs
 *
 * Users might paste full URLs like:
 *   adhx.com/https://x.com/user/status/123
 *   adhx.com/https://twitter.com/user/status/123
 *   adhx.com/x.com/user/status/123
 *
 * This proxy extracts the username and tweet ID and redirects
 * to the clean format: adhx.com/user/status/123
 */

// Pattern to match Twitter/X URLs in the path
// Captures: protocol (optional), domain, username, tweet ID
// Note: Browsers normalize // to / in paths, so https://x.com becomes https:/x.com
const TWITTER_URL_PATTERN =
  /^\/(https?:\/?\/?)?(?:www\.)?(x\.com|twitter\.com)\/(\w{1,15})\/status\/(\d+)/i

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const match = pathname.match(TWITTER_URL_PATTERN)

  if (match) {
    const [, , , username, tweetId] = match

    // Redirect to clean URL format
    const cleanUrl = new URL(`/${username}/status/${tweetId}`, request.url)

    // Preserve any query params
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
