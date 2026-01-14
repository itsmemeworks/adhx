import { NextRequest, NextResponse } from 'next/server'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthorizationUrl,
  saveOAuthState,
  deleteTokens,
} from '@/lib/auth/oauth'
import { getSession, clearSessionCookie } from '@/lib/auth/session'
import { metrics } from '@/lib/sentry'

const CLIENT_ID = process.env.TWITTER_CLIENT_ID!
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/twitter/callback`

// GET /api/auth/twitter - Initiate OAuth flow
// Supports ?returnUrl=/path to redirect after login
export async function GET(request: NextRequest) {
  if (!CLIENT_ID) {
    return NextResponse.json(
      { error: 'Twitter client ID not configured' },
      { status: 500 }
    )
  }

  // Generate PKCE values
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  // Save state for callback verification
  await saveOAuthState(state, codeVerifier)

  // Build authorization URL
  const authUrl = buildAuthorizationUrl(CLIENT_ID, REDIRECT_URI, state, codeChallenge)

  // Track auth flow start
  metrics.authStarted()

  // Check for returnUrl parameter
  const returnUrl = request.nextUrl.searchParams.get('returnUrl')

  // Redirect to Twitter, storing returnUrl in a cookie if provided
  const response = NextResponse.redirect(authUrl)

  if (returnUrl && returnUrl.startsWith('/')) {
    // Only allow relative URLs for security
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
  const session = await getSession()

  // Delete tokens for this user if session exists
  if (session?.userId) {
    await deleteTokens(session.userId)
  }

  // Clear the session cookie
  const response = NextResponse.json({ success: true })
  clearSessionCookie(response)

  return response
}
