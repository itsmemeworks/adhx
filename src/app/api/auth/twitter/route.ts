import { NextRequest, NextResponse } from 'next/server'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthorizationUrl,
  getOAuthRedirectUri,
  saveOAuthState,
} from '@/lib/auth/oauth'
import { getCurrentUserId, clearSessionCookie } from '@/lib/auth/session'
import { isSafeReturnUrl } from '@/lib/auth/return-url'
import { metrics } from '@/lib/sentry'
import { recordAnalytic } from '@/lib/analytics/record'

const CLIENT_ID = process.env.TWITTER_CLIENT_ID!
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// GET /api/auth/twitter - Initiate OAuth to *link* X to an existing account
// (bookmark sync). X is not a sign-in method — unsigned visitors are bounced.
// Supports ?returnUrl=/path to redirect after linking.
export async function GET(request: NextRequest) {
  if (!CLIENT_ID) {
    return NextResponse.json({ error: 'Twitter client ID not configured' }, { status: 500 })
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.redirect(new URL('/?auth_error=x_link_only', BASE_URL))
  }

  // Generate PKCE values
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  // Save state for callback verification, bound to the account that started
  // this link flow so switching sessions during X consent cannot retarget it.
  await saveOAuthState(state, codeVerifier, userId)

  // Build authorization URL
  const authUrl = buildAuthorizationUrl(CLIENT_ID, getOAuthRedirectUri(), state, codeChallenge)

  // Track auth flow start
  metrics.authStarted()
  recordAnalytic({ name: 'auth.start', source: 'oauth' })

  // Check for returnUrl parameter
  const returnUrl = request.nextUrl.searchParams.get('returnUrl')

  // Redirect to Twitter, storing returnUrl in a cookie if provided
  const response = NextResponse.redirect(authUrl)

  if (isSafeReturnUrl(returnUrl)) {
    // Only allow same-origin relative URLs for security
    response.cookies.set('adhx_return_url', returnUrl, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
      path: '/',
    })
  }

  return response
}

// DELETE /api/auth/twitter - Logout
export async function DELETE() {
  // This legacy endpoint logs out of ADHX. X disconnection is the dedicated
  // POST /api/auth/twitter/disconnect flow, which advances the durable link
  // generation and removes identity/tokens/state atomically.
  const response = NextResponse.json({ success: true })
  clearSessionCookie(response)

  return response
}
