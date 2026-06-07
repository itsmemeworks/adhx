import { NextResponse } from 'next/server'
import {
  getStoredTokens,
  isTokenExpired,
  getCurrentUser,
  getValidTokens,
  TokenRefreshError,
  deleteTokens,
} from '@/lib/auth/oauth'
import { db } from '@/lib/db'
import { oauthTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSession, clearSessionCookie } from '@/lib/auth/session'

// GET /api/auth/twitter/status - Check auth status
export async function GET() {
  try {
    // Get user ID from session cookie
    const session = await getSession()
    if (!session?.userId) {
      return NextResponse.json({
        authenticated: false,
        user: null,
      })
    }

    const tokens = await getStoredTokens(session.userId)

    if (!tokens) {
      return NextResponse.json({
        authenticated: false,
        user: null,
      })
    }

    let expired = isTokenExpired(tokens.expiresAt)
    let accessToken = tokens.accessToken
    let newExpiresAt = tokens.expiresAt

    // Refresh if needed. getValidTokens serializes concurrent refreshes per
    // user (this endpoint runs on every page load and could otherwise race the
    // sync flow), so the single-use refresh-token chain isn't broken.
    try {
      const valid = await getValidTokens(session.userId)
      if (valid) {
        accessToken = valid.accessToken
        newExpiresAt = valid.expiresAt
        expired = isTokenExpired(valid.expiresAt)
      }
    } catch (error) {
      if (error instanceof TokenRefreshError && error.fatal) {
        // The refresh token itself was rejected (the chain is dead) — only a
        // fresh re-auth recovers it, so clear tokens + session.
        await deleteTokens(tokens.userId)
        const response = NextResponse.json({
          authenticated: false,
          user: null,
        })
        clearSessionCookie(response)
        return response
      }
      // Transient failure (network / 5xx / lost rotation race): keep the stored
      // tokens and report the current state. A later request retries rather
      // than forcing an unnecessary re-auth.
      console.error('Token refresh failed (transient), keeping session:', error)
    }

    // If profile image is missing and token is not expired, fetch it from Twitter
    let profileImageUrl = tokens.profileImageUrl
    if (!profileImageUrl && !expired) {
      try {
        const user = await getCurrentUser(accessToken)
        profileImageUrl = user.profileImageUrl

        // Update the database with the profile image
        if (profileImageUrl) {
          await db
            .update(oauthTokens)
            .set({ profileImageUrl, updatedAt: new Date().toISOString() })
            .where(eq(oauthTokens.userId, tokens.userId))
        }
      } catch (error) {
        console.error('Failed to fetch profile image:', error)
        // Continue without profile image
      }
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: tokens.userId,
        username: tokens.username,
        profileImageUrl,
      },
      tokenExpired: expired,
      expiresAt: newExpiresAt,
    })
  } catch (error) {
    console.error('Error checking auth status:', error)
    return NextResponse.json({ error: 'Failed to check auth status' }, { status: 500 })
  }
}
