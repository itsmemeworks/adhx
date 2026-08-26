import { NextResponse } from 'next/server'
import {
  getStoredTokens,
  isTokenExpired,
  getValidTokens,
  refreshMissingXProfileImage,
  TokenRefreshError,
} from '@/lib/auth/oauth'
import { getCurrentUserId } from '@/lib/auth/session'
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
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ authenticated: false, user: null })
    }

    const account = await getAccount(userId)
    if (!account) {
      return NextResponse.json({ authenticated: false, user: null })
    }

    const tokens = await getStoredTokens(userId)

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

    let authoritativeTokens = tokens
    let expired = isTokenExpired(authoritativeTokens.expiresAt)

    // Refresh if needed. getValidTokens serializes concurrent refreshes per
    // user (this endpoint runs on every page load and could otherwise race the
    // sync flow), so the single-use refresh-token chain isn't broken.
    try {
      const valid = await getValidTokens(userId)
      if (valid) {
        authoritativeTokens = valid
        expired = isTokenExpired(valid.expiresAt)
      }
    } catch (error) {
      if (error instanceof TokenRefreshError && error.fatal) {
        // The X refresh token itself was rejected — the chain is dead and
        // only a fresh re-auth on X recovers it. getValidTokens has already
        // CAS-deleted the exact rejected row; never delete by userId here,
        // because a newer callback may have replaced those credentials.
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
    let profileImageUrl = authoritativeTokens.profileImageUrl
    if (!profileImageUrl && !expired) {
      try {
        const current = await refreshMissingXProfileImage(userId)
        if (!current) {
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
        authoritativeTokens = current
        profileImageUrl = current.profileImageUrl
        expired = isTokenExpired(current.expiresAt)
      } catch (error) {
        console.error('Failed to fetch profile image:', error)
        // Continue without profile image — but this is a distinct failure from
        // the documented refresh-error semantics above (transient refresh
        // failures are intentionally not sent to Sentry to avoid noise), so it
        // still deserves visibility if it's happening a lot.
        captureException(error, { endpoint: '/api/auth/twitter/status', userId: tokens.userId })
        const current = await getStoredTokens(userId)
        if (current) {
          authoritativeTokens = current
          profileImageUrl = current.profileImageUrl
          expired = isTokenExpired(current.expiresAt)
        } else {
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
      }
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: authoritativeTokens.userId,
        username: authoritativeTokens.username,
        profileImageUrl,
      },
      xConnected: true,
      needsReconnect: false,
      tokenExpired: expired,
      expiresAt: authoritativeTokens.expiresAt,
    })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/auth/twitter/status',
      message: 'Failed to check auth status',
    })
  }
}
