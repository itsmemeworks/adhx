import { NextRequest, NextResponse } from 'next/server'
import {
  consumeOAuthState,
  exchangeCodeForTokens,
  getCurrentUser,
  getOAuthRedirectUri,
  saveTokens,
  hasExistingTokens,
} from '@/lib/auth/oauth'
import { getSession, setSessionCookie } from '@/lib/auth/session'
import { findOrCreateUserForX } from '@/lib/auth/account'
import { isSafeReturnUrl } from '@/lib/auth/return-url'
import { metrics, captureException } from '@/lib/sentry'
import { recordAnalytic } from '@/lib/analytics/record'
import { isUserBanned } from '@/lib/admin/moderation'

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
    recordAnalytic({ name: 'auth.fail', source: 'oauth' })
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(errorDescription || error)}`, BASE_URL),
    )
  }

  // Verify required parameters
  if (!code || !state) {
    return NextResponse.redirect(new URL('/?error=Missing%20code%20or%20state', BASE_URL))
  }

  try {
    // X is a Settings link. Require a session BEFORE spending the one-time
    // OAuth code / PKCE verifier, so an expired cookie during consent does
    // not burn the grant.
    const existingSession = await getSession()
    if (!existingSession?.userId) {
      return NextResponse.redirect(new URL('/?auth_error=x_link_only', BASE_URL))
    }

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

    const linkResult = await findOrCreateUserForX(
      {
        xUserId: user.id,
        username: user.username,
        name: user.name,
        profileImageUrl: user.profileImageUrl,
      },
      existingSession.userId,
    )

    if (linkResult.conflict === 'linked_elsewhere') {
      // This X account is already linked to a different account than the one
      // currently signed in — don't touch the session, bounce back to
      // Settings with an error instead.
      return NextResponse.redirect(new URL('/settings?auth_error=x_already_linked', BASE_URL))
    }

    if (linkResult.conflict === 'sign_in_required') {
      return NextResponse.redirect(new URL('/?auth_error=x_link_only', BASE_URL))
    }

    const appUserId = linkResult.userId
    const appUsername = linkResult.username

    if (isUserBanned(appUserId)) {
      return NextResponse.redirect(new URL('/?auth_error=banned', BASE_URL))
    }

    // Check if this is a new user (for metrics) — keyed by the app userId,
    // since an email user linking X already has no oauth_tokens row yet.
    const isNewUser = !(await hasExistingTokens(appUserId))

    // Save tokens to database, keyed by the APP userId (equal to the X id
    // for X-first signups; distinct from it when linking X to an email user).
    await saveTokens(
      appUserId,
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
    metrics.trackUser(appUserId)
    recordAnalytic({ name: 'auth.complete', userId: appUserId, source: 'oauth' })

    // Check for a return URL cookie (from URL prefix feature)
    const returnUrlCookie = request.cookies.get('adhx_return_url')
    const returnUrl = returnUrlCookie?.value

    // Determine redirect URL
    let redirectUrl: URL
    if (isSafeReturnUrl(returnUrl)) {
      // Return to the original URL (e.g. Settings, or a preview the user was on)
      redirectUrl = new URL(returnUrl, BASE_URL)
    } else {
      // X is a Settings link, not a sign-in. Signed-in `/` redirects to
      // `/saved` and drops query strings, so `/?firstLogin=true` never
      // reached the library sync modal. Land on Settings instead.
      redirectUrl = new URL('/settings', BASE_URL)
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
      userId: appUserId,
      username: appUsername,
    })

    return response
  } catch (err) {
    console.error('OAuth callback error:', err)
    captureException(err, { endpoint: '/api/auth/twitter/callback' })
    const message = err instanceof Error ? err.message : 'Unknown error'
    metrics.authFailed(message)
    recordAnalytic({ name: 'auth.fail', source: 'oauth' })
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(message)}`, BASE_URL))
  }
}
