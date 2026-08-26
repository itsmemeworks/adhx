import crypto from 'crypto'
import { db, runInTransaction } from '@/lib/db'
import { oauthState, oauthTokens, userIdentities, users } from '@/lib/db/schema'
import { and, eq, exists, gt, isNull, lte, or } from 'drizzle-orm'
import { encryptToken, safeDecryptToken } from './token-encryption'
import { fetchWithTimeout } from '@/lib/utils/fetch-timeout'

// Retry helper for idempotent Twitter API calls (GET only).
// Non-idempotent operations (token exchange, refresh) must NOT retry
// because auth codes are single-use and refresh tokens rotate on each use.
async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  const maxRetries = 3
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, 10_000, options)

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
// Use the x.com authorize host, not the legacy twitter.com one. After X's
// rebrand, a logged-out user sent to twitter.com/i/oauth2/authorize logs in on
// x.com and is then bounced back to the twitter.com authorize page, where the
// consent screen never renders (X drops them on the homepage) — login is
// impossible for anyone without an active X session. Starting on x.com keeps
// login + consent on one host. https://devcommunity.x.com/t/oauth-2-0-authorization-endpoint-returning-page-doesnt-exist-for-all-apps/262920
const TWITTER_AUTH_URL = 'https://x.com/i/oauth2/authorize'
const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const SCOPES = ['tweet.read', 'users.read', 'bookmark.read', 'offline.access']
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const REFRESH_LEASE_STALE_MS = 30_000

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

/**
 * The redirect_uri sent to X for OAuth and used in the token exchange.
 *
 * X has a confirmed bug: during the *logged-out* login flow it runs a regex that
 * rewrites every "x.com" → "twitter.com" across the authorize URL, and it
 * greedily catches the host inside `redirect_uri`. Our production host
 * `adhx.com` ends in "x.com", so the callback gets mangled to the dead
 * `adhtwitter.com` and login fails for anyone not already signed into X
 * (incognito, fresh device, most Android-web users). Logged-in users skip that
 * redirect, so it works for them. URL-encoding the dots does NOT help — X
 * decodes them back before applying the rewrite. See:
 * https://devcommunity.x.com/t/oauth2-bug-twitter-replaces-x-com-string-in-the-oauth-redirect-with-twitter-com/232600
 *
 * Fix: use a callback host with no "x.com" substring. In production we point
 * `redirect_uri` at the Fly app host (`adhx-prod.fly.dev`) via
 * `TWITTER_OAUTH_REDIRECT_URI`; X leaves it untouched, then the callback route
 * bounces back to the canonical origin to set the session cookie. Staging
 * (`adhx.fly.dev`) and local already have no "x.com", so the override is unset
 * and this falls back to the canonical `NEXT_PUBLIC_APP_URL` callback.
 */
export function getOAuthRedirectUri(): string {
  const override = process.env.TWITTER_OAUTH_REDIRECT_URI
  if (override) return override
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${base}/api/auth/twitter/callback`
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
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  return `${TWITTER_AUTH_URL}?${params.toString()}`
}

// Save OAuth state for callback verification, durably bound to the ADHX account
// that initiated the X-link flow.
export async function saveOAuthState(
  state: string,
  codeVerifier: string,
  userId: string,
): Promise<void> {
  await cleanupExpiredStates()
  runInTransaction(() => {
    const account = db
      .select({ xLinkVersion: users.xLinkVersion })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .get()
    if (!account) throw new Error('Cannot start X OAuth for a missing account')

    db.insert(oauthState)
      .values({
        state,
        codeVerifier,
        userId,
        xLinkVersion: account.xLinkVersion,
        createdAt: new Date().toISOString(),
      })
      .run()
  })
}

/**
 * Atomically consume an unexpired OAuth state owned by `userId`.
 *
 * The ownership, expiry, and single-use checks live in the DELETE predicate,
 * so parallel callbacks cannot both obtain the PKCE verifier. A mismatched
 * session does not consume the row, allowing the initiating account to finish
 * its own callback.
 */
export async function consumeOAuthState(
  state: string,
  userId: string,
): Promise<{ codeVerifier: string; xLinkVersion: number } | null> {
  const cutoff = new Date(Date.now() - OAUTH_STATE_TTL_MS).toISOString()
  const [row] = db
    .delete(oauthState)
    .where(
      and(
        eq(oauthState.state, state),
        eq(oauthState.userId, userId),
        gt(oauthState.createdAt, cutoff),
      ),
    )
    .returning({
      codeVerifier: oauthState.codeVerifier,
      xLinkVersion: oauthState.xLinkVersion,
    })
    .all()

  return row ?? null
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

  const response = await fetchWithTimeout(TWITTER_TOKEN_URL, 10_000, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: params.toString(),
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

  const response = await fetchWithTimeout(TWITTER_TOKEN_URL, 10_000, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: params.toString(),
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

/**
 * Persist callback tokens only while the expected X identity is still linked
 * to this ADHX user. The identity check and token upsert share one SQLite
 * transaction: if disconnect removed the identity after resolution, no token
 * row can be recreated; if this commits first, disconnect removes both.
 */
export async function saveLinkedXTokens(
  userId: string,
  xUserId: string,
  username: string,
  profileImageUrl: string | null,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  scopes: string,
  expectedXLinkVersion: number,
): Promise<boolean> {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn
  const now = new Date().toISOString()
  const encryptedAccessToken = encryptToken(accessToken)
  const encryptedRefreshToken = encryptToken(refreshToken)

  return runInTransaction(() => {
    const account = db
      .select({ xLinkVersion: users.xLinkVersion })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .get()
    if (!account || account.xLinkVersion !== expectedXLinkVersion) return false

    const linkedIdentity = db
      .select({ providerId: userIdentities.providerId })
      .from(userIdentities)
      .where(
        and(
          eq(userIdentities.provider, 'x'),
          eq(userIdentities.providerId, xUserId),
          eq(userIdentities.userId, userId),
        ),
      )
      .limit(1)
      .get()

    if (!linkedIdentity) return false

    db.insert(oauthTokens)
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
          refreshLeaseId: null,
          refreshLeaseStartedAt: null,
        },
      })
      .run()

    return true
  })
}

function decryptStoredTokenRow(stored: typeof oauthTokens.$inferSelect) {
  return {
    ...stored,
    accessToken: safeDecryptToken(stored.accessToken),
    refreshToken: safeDecryptToken(stored.refreshToken),
  }
}

/**
 * Read the decrypted token payload together with the exact encrypted columns
 * that identify this stored row version. The encrypted strings themselves are
 * stable until a writer replaces them; re-encrypting plaintext would not be,
 * because AES-GCM uses a fresh random IV every time.
 */
async function getStoredTokenSnapshot(userId: string) {
  const [stored] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.userId, userId))
    .limit(1)
  if (!stored) return null

  return storedTokenSnapshot(stored)
}

function storedTokenSnapshot(stored: typeof oauthTokens.$inferSelect) {
  return {
    tokens: decryptStoredTokenRow(stored),
    expectedEncryptedAccessToken: stored.accessToken,
    expectedEncryptedRefreshToken: stored.refreshToken,
  }
}

// Get stored tokens for a specific user (decrypted)
export async function getStoredTokens(userId: string) {
  return (await getStoredTokenSnapshot(userId))?.tokens ?? null
}

/** Decrypted stored tokens for a user (the non-null shape of getStoredTokens). */
export type StoredTokens = NonNullable<Awaited<ReturnType<typeof getStoredTokens>>>
type StoredTokenSnapshot = NonNullable<Awaited<ReturnType<typeof getStoredTokenSnapshot>>>

function getCurrentLinkedTokenContext(userId: string): {
  snapshot: StoredTokenSnapshot
  providerId: string
  xLinkVersion: number
} | null {
  return runInTransaction(() => {
    const account = db
      .select({ xLinkVersion: users.xLinkVersion })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .get()
    if (!account) return null

    const linkedIdentity = db
      .select({ providerId: userIdentities.providerId })
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, 'x'), eq(userIdentities.userId, userId)))
      .limit(1)
      .get()
    if (!linkedIdentity) return null

    const stored = db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.userId, userId))
      .limit(1)
      .get()
    if (!stored) return null
    return {
      snapshot: storedTokenSnapshot(stored),
      providerId: linkedIdentity.providerId,
      xLinkVersion: account.xLinkVersion,
    }
  })
}

function getCurrentLinkedTokenSnapshot(userId: string): StoredTokenSnapshot | null {
  return getCurrentLinkedTokenContext(userId)?.snapshot ?? null
}

function isSameStoredTokenRow(current: StoredTokenSnapshot, expected: StoredTokenSnapshot) {
  return (
    current.expectedEncryptedAccessToken === expected.expectedEncryptedAccessToken &&
    current.expectedEncryptedRefreshToken === expected.expectedEncryptedRefreshToken
  )
}

function nonFatalStaleRefreshError() {
  return new TokenRefreshError('Token refresh result is no longer current', 409)
}

/**
 * Fetch and persist a missing X avatar without letting a slow response from a
 * disconnected/relinked identity overwrite the replacement connection.
 * Returns the currently authoritative token row; callers must not display the
 * fetched avatar when the conditional update loses.
 */
export async function refreshMissingXProfileImage(userId: string): Promise<StoredTokens | null> {
  const context = getCurrentLinkedTokenContext(userId)
  if (!context) return null
  if (context.snapshot.tokens.profileImageUrl) return context.snapshot.tokens

  const xUser = await getCurrentUser(context.snapshot.tokens.accessToken)
  if (xUser.id !== context.providerId) {
    return getCurrentLinkedTokenSnapshot(userId)?.tokens ?? null
  }
  if (!xUser.profileImageUrl) {
    return getCurrentLinkedTokenSnapshot(userId)?.tokens ?? null
  }

  const identityStillCurrent = db
    .select({ providerId: userIdentities.providerId })
    .from(userIdentities)
    .where(
      and(
        eq(userIdentities.provider, 'x'),
        eq(userIdentities.providerId, context.providerId),
        eq(userIdentities.userId, userId),
      ),
    )
  const generationStillCurrent = db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.xLinkVersion, context.xLinkVersion)))
  const updatedAt = new Date().toISOString()
  const persisted = runInTransaction(
    () =>
      db
        .update(oauthTokens)
        .set({ profileImageUrl: xUser.profileImageUrl, updatedAt })
        .where(
          and(
            eq(oauthTokens.userId, userId),
            eq(oauthTokens.accessToken, context.snapshot.expectedEncryptedAccessToken),
            eq(oauthTokens.refreshToken, context.snapshot.expectedEncryptedRefreshToken),
            exists(identityStillCurrent),
            exists(generationStillCurrent),
          ),
        )
        .run().changes,
  )

  if (persisted === 1) {
    return {
      ...context.snapshot.tokens,
      profileImageUrl: xUser.profileImageUrl,
      updatedAt,
    }
  }
  return getCurrentLinkedTokenSnapshot(userId)?.tokens ?? null
}

function claimRefreshLease(snapshot: StoredTokenSnapshot, leaseId: string): boolean {
  const staleBefore = new Date(Date.now() - REFRESH_LEASE_STALE_MS).toISOString()
  const linkedIdentity = db
    .select({ providerId: userIdentities.providerId })
    .from(userIdentities)
    .where(and(eq(userIdentities.provider, 'x'), eq(userIdentities.userId, snapshot.tokens.userId)))

  return (
    runInTransaction(
      () =>
        db
          .update(oauthTokens)
          .set({
            refreshLeaseId: leaseId,
            refreshLeaseStartedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(oauthTokens.userId, snapshot.tokens.userId),
              eq(oauthTokens.accessToken, snapshot.expectedEncryptedAccessToken),
              eq(oauthTokens.refreshToken, snapshot.expectedEncryptedRefreshToken),
              exists(linkedIdentity),
              or(
                isNull(oauthTokens.refreshLeaseId),
                isNull(oauthTokens.refreshLeaseStartedAt),
                lte(oauthTokens.refreshLeaseStartedAt, staleBefore),
              ),
            ),
          )
          .run().changes,
    ) === 1
  )
}

function releaseRefreshLease(snapshot: StoredTokenSnapshot, leaseId: string): boolean {
  return (
    runInTransaction(
      () =>
        db
          .update(oauthTokens)
          .set({ refreshLeaseId: null, refreshLeaseStartedAt: null })
          .where(
            and(
              eq(oauthTokens.userId, snapshot.tokens.userId),
              eq(oauthTokens.accessToken, snapshot.expectedEncryptedAccessToken),
              eq(oauthTokens.refreshToken, snapshot.expectedEncryptedRefreshToken),
              eq(oauthTokens.refreshLeaseId, leaseId),
            ),
          )
          .run().changes,
    ) === 1
  )
}

function deleteLeasedTokenSnapshot(snapshot: StoredTokenSnapshot, leaseId: string): boolean {
  return (
    runInTransaction(
      () =>
        db
          .delete(oauthTokens)
          .where(
            and(
              eq(oauthTokens.userId, snapshot.tokens.userId),
              eq(oauthTokens.accessToken, snapshot.expectedEncryptedAccessToken),
              eq(oauthTokens.refreshToken, snapshot.expectedEncryptedRefreshToken),
              eq(oauthTokens.refreshLeaseId, leaseId),
            ),
          )
          .run().changes,
    ) === 1
  )
}

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
 * The in-memory map removes duplicate work within one process; the durable
 * oauth_tokens lease below is authoritative across workers and machines.
 */
const inFlightRefreshes = new Map<string, Promise<StoredTokens>>()

async function performRefresh(snapshot: StoredTokenSnapshot): Promise<StoredTokens> {
  const { tokens, expectedEncryptedAccessToken, expectedEncryptedRefreshToken } = snapshot
  const leaseId = crypto.randomUUID()
  if (!claimRefreshLease(snapshot, leaseId)) {
    const current = getCurrentLinkedTokenSnapshot(tokens.userId)
    if (
      current &&
      !isSameStoredTokenRow(current, snapshot) &&
      !isTokenExpired(current.tokens.expiresAt)
    ) {
      return current.tokens
    }
    throw new TokenRefreshError('Token refresh is already in progress', 423)
  }

  const clientId = process.env.TWITTER_CLIENT_ID!
  const clientSecret = process.env.TWITTER_CLIENT_SECRET!
  let refreshed: Awaited<ReturnType<typeof refreshAccessToken>>
  try {
    refreshed = await refreshAccessToken(tokens.refreshToken, clientId, clientSecret)
  } catch (error) {
    if (error instanceof TokenRefreshError && error.fatal) {
      // Invalidate only the exact encrypted row whose refresh token X
      // rejected. A callback or another refresh that replaced it wins the CAS
      // and must not be deleted or reported as fatally broken.
      if (deleteLeasedTokenSnapshot(snapshot, leaseId)) throw error

      const current = getCurrentLinkedTokenSnapshot(tokens.userId)
      if (
        current &&
        !isSameStoredTokenRow(current, snapshot) &&
        !isTokenExpired(current.tokens.expiresAt)
      ) {
        return current.tokens
      }
      throw nonFatalStaleRefreshError()
    }

    releaseRefreshLease(snapshot, leaseId)
    const current = getCurrentLinkedTokenSnapshot(tokens.userId)
    if (!current) throw nonFatalStaleRefreshError()
    if (!isSameStoredTokenRow(current, snapshot)) {
      if (!isTokenExpired(current.tokens.expiresAt)) return current.tokens
      throw nonFatalStaleRefreshError()
    }

    // The initiating row is still current, so preserve the token endpoint's
    // original fatal (400/401) versus transient classification.
    throw error
  }
  const expiresAt = Math.floor(Date.now() / 1000) + refreshed.expiresIn
  const updatedAt = new Date().toISOString()
  const encryptedAccessToken = encryptToken(refreshed.accessToken)
  const encryptedRefreshToken = encryptToken(refreshed.refreshToken)

  // Compare-and-swap the exact encrypted row version captured before network
  // I/O. The EXISTS predicate prevents a refresh response from recreating
  // credentials after disconnect, while the token predicates prevent stale
  // refreshes from overwriting a newer callback or refresh.
  const persisted = runInTransaction(() => {
    const linkedIdentity = db
      .select({ providerId: userIdentities.providerId })
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, 'x'), eq(userIdentities.userId, tokens.userId)))

    return (
      db
        .update(oauthTokens)
        .set({
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt,
          updatedAt,
          refreshLeaseId: null,
          refreshLeaseStartedAt: null,
        })
        .where(
          and(
            eq(oauthTokens.userId, tokens.userId),
            eq(oauthTokens.accessToken, expectedEncryptedAccessToken),
            eq(oauthTokens.refreshToken, expectedEncryptedRefreshToken),
            eq(oauthTokens.refreshLeaseId, leaseId),
            exists(linkedIdentity),
          ),
        )
        .run().changes === 1
    )
  })

  if (persisted) {
    return {
      ...tokens,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt,
      updatedAt,
    }
  }

  // A newer callback/refresh legitimately won while the network request was
  // in flight. Return that valid row instead of the stale refresh result.
  const current = getCurrentLinkedTokenSnapshot(tokens.userId)
  if (
    current &&
    !isSameStoredTokenRow(current, snapshot) &&
    !isTokenExpired(current.tokens.expiresAt)
  ) {
    return current.tokens
  }

  // Disconnect (or deletion) won, or the competing row is not usable. This is
  // non-fatal: never clear/recreate credentials based on the spent old token.
  throw nonFatalStaleRefreshError()
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
  const snapshot = await getStoredTokenSnapshot(userId)
  if (!snapshot) return null
  const { tokens } = snapshot
  if (!opts.forceRefresh && !isTokenExpired(tokens.expiresAt)) return tokens

  // A refresh is needed. Join an in-flight one for this user if present;
  // otherwise start one and register it before the first await yields.
  const existing = inFlightRefreshes.get(userId)
  if (existing) return existing

  const refreshPromise = performRefresh(snapshot).finally(() => {
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

// Clean up expired OAuth states (older than 10 minutes)
export async function cleanupExpiredStates(): Promise<void> {
  const tenMinutesAgo = new Date(Date.now() - OAUTH_STATE_TTL_MS).toISOString()
  await db.delete(oauthState).where(lte(oauthState.createdAt, tenMinutesAgo))
}
