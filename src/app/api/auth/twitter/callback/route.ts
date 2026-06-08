import { NextRequest, NextResponse } from 'next/server'
import {
  consumeOAuthState,
  exchangeCodeForTokens,
  getCurrentUser,
  getOAuthRedirectUri,
  saveTokens,
  hasExistingTokens,
} from '@/lib/auth/oauth'
import { setSessionCookie } from '@/lib/auth/session'
import { metrics, captureException } from '@/lib/sentry'

const CLIENT_ID = process.env.TWITTER_CLIENT_ID!
const CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET!
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const REDIRECT_URI = getOAuthRedirectUri()

// GET /api/auth/twitter/callback - Handle OAuth callback
export async function GET(request: NextRequest) {
  // In production the OAuth redirect_uri points at the Fly app host
  // (adhx-prod.fly.dev) so X's logged-out "x.com" → "twitter.com" rewrite can't
  // mangle our callback (see getOAuthRedirectUri). X therefore lands the browser
  // on that host — but the session cookie has to be set on the canonical origin
  // (adhx.com). If we arrived on the redirect_uri host and it isn't canonical,
  // bounce to the canonical callback first, carrying code+state untouched.
  // Nothing is consumed yet, so this is safe and runs at most once (the bounced
  // request arrives on the canonical host and skips this).
  const canonicalOrigin = process.env.NEXT_PUBLIC_APP_URL
  if (canonicalOrigin) {
    const redirectHost = new URL(REDIRECT_URI).host
    const canonicalHost = new URL(canonicalOrigin).host
    const requestHost = request.headers.get('host')
    if (requestHost === redirectHost && redirectHost !== canonicalHost) {
      const dest = new URL('/api/auth/twitter/callback', canonicalOrigin)
      dest.search = request.nextUrl.search
      return NextResponse.redirect(dest, { status: 307 })
    }
  }

  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Handle error from Twitter
  if (error) {
    console.error('OAuth error:', error, errorDescription)
    metrics.authFailed(error)
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(errorDescription || error)}`, BASE_URL),
    )
  }

  // Verify required parameters
  if (!code || !state) {
    return NextResponse.redirect(new URL('/?error=Missing%20code%20or%20state', BASE_URL))
  }

  try {
    // Verify state and get code verifier
    const codeVerifier = await consumeOAuthState(state)
    if (!codeVerifier) {
      return NextResponse.redirect(new URL('/?error=Invalid%20or%20expired%20state', BASE_URL))
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(
      code,
      codeVerifier,
      CLIENT_ID,
      CLIENT_SECRET,
      REDIRECT_URI,
    )

    // Get user info
    const user = await getCurrentUser(tokens.accessToken)

    // Check if this is a new user (for metrics)
    const isNewUser = !(await hasExistingTokens(user.id))

    // Save tokens to database
    await saveTokens(
      user.id,
      user.username,
      user.profileImageUrl,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresIn,
      tokens.scope,
    )

    // Successfully authenticated - metrics are tracked below

    // Track successful auth completion
    metrics.authCompleted(isNewUser)
    metrics.trackUser(user.id)

    // Check for a return URL cookie (from URL prefix feature)
    const returnUrlCookie = request.cookies.get('adhx_return_url')
    const returnUrl = returnUrlCookie?.value

    // Determine redirect URL
    let redirectUrl: URL
    if (returnUrl && returnUrl.startsWith('/')) {
      // Return to the original URL (e.g., /user/status/123)
      redirectUrl = new URL(returnUrl, BASE_URL)
    } else {
      // Default: redirect to home with firstLogin flag to trigger auto-sync
      redirectUrl = new URL('/?firstLogin=true', BASE_URL)
    }

    const response = NextResponse.redirect(redirectUrl)

    // Clear the return URL cookie
    if (returnUrlCookie) {
      response.cookies.set('adhx_return_url', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      })
    }

    // Set session cookie with user info (JWT signed)
    await setSessionCookie(response, {
      userId: user.id,
      username: user.username,
    })

    return response
  } catch (err) {
    console.error('OAuth callback error:', err)
    captureException(err, { endpoint: '/api/auth/twitter/callback' })
    const message = err instanceof Error ? err.message : 'Unknown error'
    metrics.authFailed(message)
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(message)}`, BASE_URL))
  }
}
