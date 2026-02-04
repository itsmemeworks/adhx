import crypto from 'crypto'
import { db } from '@/lib/db'
import { oauthState, oauthTokens } from '@/lib/db/schema'
import { eq, lt } from 'drizzle-orm'
import { encryptToken, safeDecryptToken } from './token-encryption'

// OAuth 2.0 configuration
const TWITTER_AUTH_URL = 'https://twitter.com/i/oauth2/authorize'
const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const SCOPES = ['tweet.read', 'users.read', 'bookmark.read', 'offline.access']

// PKCE helpers
function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
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
  codeChallenge: string
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
  const result = await db
    .select()
    .from(oauthState)
    .where(eq(oauthState.state, state))
    .limit(1)

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
  redirectUri: string
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
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
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
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token refresh failed: ${error}`)
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
  const response = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

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
  scopes: string
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
  const result = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.userId, userId))
    .limit(1)

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
