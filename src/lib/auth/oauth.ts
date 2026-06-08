import crypto from 'crypto'
import { db } from '@/lib/db'
import { oauthState, oauthTokens } from '@/lib/db/schema'
import { eq, lt } from 'drizzle-orm'
import { encryptToken, safeDecryptToken } from './token-encryption'

// Retry helper for idempotent Twitter API calls (GET only).
// Non-idempotent operations (token exchange, refresh) must NOT retry
// because auth codes are single-use and refresh tokens rotate on each use.
async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  const maxRetries = 3
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10_000),
      })

      if (response.ok || attempt === maxRetries || response.status < 500) {
        return response
      }

      // Drain body to release the socket before retrying
      await response.body?.cancel()
    } catch (error) {
      // Network errors (DNS, TCP reset, timeout) — retry these too
      if (attempt === maxRetries) throw error
      lastError = error
    }

    // Exponential backoff: 1s, 2s, 4s
    await new Promise((resolve) => setTimeout(resolve, 1000 * (1 << attempt)))
  }

  throw lastError
}

// OAuth 2.0 configuration
const TWITTER_AUTH_URL = 'https://twitter.com/i/oauth2/authorize'
const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const SCOPES = ['tweet.read', 'users.read', 'bookmark.read', 'offline.access']

// PKCE helpers
function base64URLEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function sha256(buffer: string): Buffer {
  return crypto.createHash('sha256').update(buffer).digest()
}

export function generateCodeVerifier(): string {
  return base64URLEncode(crypto.randomBytes(32))
}

export function generateCodeChallenge(verifier: string): string {
  return base64URLEncode(sha256(verifier))
}

export function generateState(): string {
  return base64URLEncode(crypto.randomBytes(16))
}

// Build authorization URL
export function buildAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  // WORKAROUND for a confirmed X platform bug: when a *logged-out* user hits the
  // authorize endpoint, X runs a global regex that rewrites every "x.com" →
  // "twitter.com" across the entire URL string — and it greedily catches the
  // host inside our `redirect_uri`. Our callback lives on `adhx.com`, which ends
  // in "x.com", so it gets mangled to "adhtwitter.com" (NXDOMAIN) and the OAuth
  // flow dies for anyone not already signed into X (incognito, fresh device,
  // most Android-web users). Logged-in users skip that redirect, so it "works on
  // my machine". See:
  // https://devcommunity.x.com/t/oauth2-bug-twitter-replaces-x-com-string-in-the-oauth-redirect-with-twitter-com/232600
  //
  // Fix: percent-encode the dots in `redirect_uri` so the literal substring
  // "x.com" never appears in the URL X scans (it becomes "adhx%2Ecom"). X
  // decodes %2E → "." when it validates the callback and performs the real
  // redirect, so the effective redirect_uri is unchanged — verified against the
  // live authorize endpoint: the consent screen still resolves to our app.
  const redirectParam = encodeURIComponent(redirectUri).replace(/\./g, '%2E')

  return `${TWITTER_AUTH_URL}?redirect_uri=${redirectParam}&${params.toString()}`
}

// Save OAuth state for callback verification
export async function saveOAuthState(state: string, codeVerifier: string): Promise<void> {
  await db.insert(oauthState).values({
    state,
    codeVerifier,
    createdAt: new Date().toISOString(),
  })
}

// Get and delete OAuth state (one-time use)
export async function consumeOAuthState(state: string): Promise<string | null> {
  const result = await db.select().from(oauthState).where(eq(oauthState.state, state)).limit(1)

  if (result.length === 0) {
    return null
  }

  // Delete the state (one-time use)
  await db.delete(oauthState).where(eq(oauthState.state, state))

  return result[0].codeVerifier
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
  scope: string
}> {
  const params = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch(TWITTER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: params.toString(),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope,
  }
}

// Refresh access token
/**
 * Error from the token endpoint. `fatal` means the refresh token itself was
 * rejected (HTTP 400/401) — the rotation chain is dead and only a fresh
 * re-auth recovers it. Non-fatal (network, 5xx, timeout) is transient and the
 * caller should keep the stored tokens and retry later rather than forcing
 * re-auth.
 */
export class TokenRefreshError extends Error {
  status: number
  fatal: boolean
  constructor(message: string, status: number) {
    super(message)
    this.name = 'TokenRefreshError'
    this.status = status
    this.fatal = status === 400 || status === 401
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
}> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  })

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch(TWITTER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: params.toString(),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new TokenRefreshError(`Token refresh failed: ${error}`, response.status)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

// Get current user from Twitter
export async function getCurrentUser(accessToken: string): Promise<{
  id: string
  username: string
  name: string
  profileImageUrl: string | null
}> {
  const response = await fetchWithRetry(
    'https://api.twitter.com/2/users/me?user.fields=profile_image_url',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get user: ${error}`)
  }

  const data = await response.json()
  // Get higher resolution image by replacing _normal with _400x400
  const profileImageUrl = data.data.profile_image_url
    ? data.data.profile_image_url.replace('_normal', '_400x400')
    : null

  return {
    id: data.data.id,
    username: data.data.username,
    name: data.data.name,
    profileImageUrl,
  }
}

// Save tokens to database (encrypted at rest)
export async function saveTokens(
  userId: string,
  username: string,
  profileImageUrl: string | null,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  scopes: string,
): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn
  const now = new Date().toISOString()

  // Encrypt tokens before storage
  const encryptedAccessToken = encryptToken(accessToken)
  const encryptedRefreshToken = encryptToken(refreshToken)

  await db
    .insert(oauthTokens)
    .values({
      userId,
      username,
      profileImageUrl,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      expiresAt,
      scopes,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: oauthTokens.userId,
      set: {
        username,
        profileImageUrl,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        scopes,
        updatedAt: now,
      },
    })
}

// Get stored tokens for a specific user (decrypted)
export async function getStoredTokens(userId: string): Promise<{
  userId: string
  username: string | null
  profileImageUrl: string | null
  accessToken: string
  refreshToken: string
  expiresAt: number
} | null> {
  const result = await db.select().from(oauthTokens).where(eq(oauthTokens.userId, userId)).limit(1)

  if (result.length === 0) {
    return null
  }

  const stored = result[0]
  // Decrypt tokens (safeDecryptToken handles legacy plaintext tokens gracefully)
  return {
    ...stored,
    accessToken: safeDecryptToken(stored.accessToken),
    refreshToken: safeDecryptToken(stored.refreshToken),
  }
}

/** Decrypted stored tokens for a user (the non-null shape of getStoredTokens). */
export type StoredTokens = NonNullable<Awaited<ReturnType<typeof getStoredTokens>>>

/**
 * In-process per-user dedupe of refreshes.
 *
 * X refresh tokens are SINGLE-USE and rotate: each refresh issues a new
 * access+refresh token and invalidates the previous refresh token. If two
 * requests refresh concurrently they both spend the same refresh token — the
 * loser is handed an already-invalidated token, which breaks the rotation
 * chain and forces a re-auth. Coalescing concurrent refreshes for a user onto
 * a single in-flight promise keeps the chain intact.
 *
 * In-memory is sufficient: the app runs as a single Node process per machine,
 * and the worst case across machines is one extra refresh (rare), not the
 * every-page-load race this removes.
 */
const inFlightRefreshes = new Map<string, Promise<StoredTokens>>()

async function performRefresh(tokens: StoredTokens): Promise<StoredTokens> {
  const clientId = process.env.TWITTER_CLIENT_ID!
  const clientSecret = process.env.TWITTER_CLIENT_SECRET!
  const refreshed = await refreshAccessToken(tokens.refreshToken, clientId, clientSecret)
  // Persist the rotated tokens BEFORE returning so the next caller reads the
  // new refresh token, never the spent one.
  await saveTokens(
    tokens.userId,
    tokens.username || '',
    tokens.profileImageUrl || null,
    refreshed.accessToken,
    refreshed.refreshToken,
    refreshed.expiresIn,
    '', // scopes don't change
  )
  return {
    ...tokens,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + refreshed.expiresIn,
  }
}

/**
 * Return valid tokens for a user, refreshing if expired (or when `forceRefresh`
 * is set — used to recover from a 401 where the token died before its nominal
 * expiry). Concurrent refreshes for the same user are coalesced (see above).
 *
 * Returns null if the user has no stored tokens. Throws {@link TokenRefreshError}
 * if a refresh fails — callers check `.fatal` to decide re-auth vs. retry.
 */
export async function getValidTokens(
  userId: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<StoredTokens | null> {
  const tokens = await getStoredTokens(userId)
  if (!tokens) return null
  if (!opts.forceRefresh && !isTokenExpired(tokens.expiresAt)) return tokens

  // A refresh is needed. Join an in-flight one for this user if present;
  // otherwise start one and register it before the first await yields.
  const existing = inFlightRefreshes.get(userId)
  if (existing) return existing

  const refreshPromise = performRefresh(tokens).finally(() => {
    inFlightRefreshes.delete(userId)
  })
  inFlightRefreshes.set(userId, refreshPromise)
  return refreshPromise
}

// Check if tokens exist for a user (used to determine new vs returning user)
export async function hasExistingTokens(userId: string): Promise<boolean> {
  const result = await db
    .select({ userId: oauthTokens.userId })
    .from(oauthTokens)
    .where(eq(oauthTokens.userId, userId))
    .limit(1)

  return result.length > 0
}

// Check if token is expired (with 5 minute buffer)
export function isTokenExpired(expiresAt: number): boolean {
  const now = Math.floor(Date.now() / 1000)
  return expiresAt < now + 300 // 5 minute buffer
}

// Delete tokens for a specific user (logout)
export async function deleteTokens(userId: string): Promise<void> {
  await db.delete(oauthTokens).where(eq(oauthTokens.userId, userId))
}

// Clean up expired OAuth states (older than 10 minutes)
export async function cleanupExpiredStates(): Promise<void> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  await db.delete(oauthState).where(lt(oauthState.createdAt, tenMinutesAgo))
}
