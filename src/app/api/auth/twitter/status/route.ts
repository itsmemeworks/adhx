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
import { oauthTokens, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth/session'
import { getAccount } from '@/lib/auth/account'
import { captureException } from '@/lib/sentry'
import { handleRouteError } from '@/lib/api/response'

// GET /api/auth/twitter/status - Check auth status
//
// "authenticated" means a valid session + a `users` row exists — it no
// longer requires a live X connection (an account can now sign in via email
// alone). `xConnected` reports whether X tokens are currently stored;
// `needsReconnect` is true only when a previously-connected X account's
// refresh token died and needs a fresh /api/auth/twitter round-trip.
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.userId) {
      return NextResponse.json({ authenticated: false, user: null })
    }

    let account = await getAccount(session.userId)
    if (!account) {
      // Pre-migration session (no `users` row yet) — create one lazily from
      // the session so old sessions keep working without forcing a re-auth.
      await db
        .insert(users)
        .values({ id: session.userId, username: session.username || session.userId })
        .onConflictDoNothing()
      account = await getAccount(session.userId)
    }

    if (!account) {
      // Should be unreachable given the lazy-create above.
      return NextResponse.json({ authenticated: false, user: null })
    }

    const tokens = await getStoredTokens(session.userId)

    if (!tokens) {
      // No X connection at all (email-only account, or a previously
      // disconnected one) — the account itself is still authenticated.
      return NextResponse.json({
        authenticated: true,
        user: {
          id: account.user.id,
          username: account.user.username,
          profileImageUrl: account.user.avatarUrl,
        },
        xConnected: false,
        needsReconnect: false,
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
        // The X refresh token itself was rejected — the chain is dead and
        // only a fresh re-auth on X recovers it. The ACCOUNT survives this
        // (it's no longer 1:1 with the X connection), so drop the X tokens
        // but keep the session — flag it for the UI to prompt a reconnect.
        await deleteTokens(tokens.userId)
        return NextResponse.json({
          authenticated: true,
          user: {
            id: account.user.id,
            username: account.user.username,
            profileImageUrl: account.user.avatarUrl,
          },
          xConnected: false,
          needsReconnect: true,
        })
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
        // Continue without profile image — but this is a distinct failure from
        // the documented refresh-error semantics above (transient refresh
        // failures are intentionally not sent to Sentry to avoid noise), so it
        // still deserves visibility if it's happening a lot.
        captureException(error, { endpoint: '/api/auth/twitter/status', userId: tokens.userId })
      }
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: tokens.userId,
        username: tokens.username,
        profileImageUrl,
      },
      xConnected: true,
      needsReconnect: false,
      tokenExpired: expired,
      expiresAt: newExpiresAt,
    })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/auth/twitter/status',
      message: 'Failed to check auth status',
    })
  }
}
