import { NextResponse } from 'next/server'
import { getStoredTokens, isTokenExpired, getCurrentUser, refreshAccessToken } from '@/lib/auth/oauth'
import { db } from '@/lib/db'
import { oauthTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth/session'

const CLIENT_ID = process.env.TWITTER_CLIENT_ID!
const CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET!

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

    // If token is expired and we have a refresh token, try to refresh it
    if (expired && tokens.refreshToken) {
      try {
        const refreshed = await refreshAccessToken(tokens.refreshToken, CLIENT_ID, CLIENT_SECRET)
        accessToken = refreshed.accessToken
        newExpiresAt = Math.floor(Date.now() / 1000) + refreshed.expiresIn

        // Update tokens in database
        await db
          .update(oauthTokens)
          .set({
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            expiresAt: newExpiresAt,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(oauthTokens.userId, tokens.userId))

        expired = false
      } catch (error) {
        console.error('Failed to refresh token:', error)
        // Token refresh failed, keep showing as expired
      }
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
    return NextResponse.json(
      { error: 'Failed to check auth status' },
      { status: 500 }
    )
  }
}
