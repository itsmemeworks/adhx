import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from './api/setup'

/**
 * OAuth Utilities Tests
 *
 * Tests PKCE generation, state management, authorization URL building,
 * and token storage/retrieval functions.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

describe('OAuth Utilities', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    vi.clearAllMocks()
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('PKCE Functions', () => {
    it('generates code verifier with correct format', async () => {
      const { generateCodeVerifier } = await import('@/lib/auth/oauth')
      const verifier = generateCodeVerifier()

      // Should be base64url encoded (no +, /, or =)
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
      // Should be at least 43 characters (256 bits / 6 bits per char)
      expect(verifier.length).toBeGreaterThanOrEqual(43)
    })

    it('generates unique code verifiers', async () => {
      const { generateCodeVerifier } = await import('@/lib/auth/oauth')
      const verifier1 = generateCodeVerifier()
      const verifier2 = generateCodeVerifier()

      expect(verifier1).not.toBe(verifier2)
    })

    it('generates code challenge from verifier', async () => {
      const { generateCodeVerifier, generateCodeChallenge } = await import('@/lib/auth/oauth')
      const verifier = generateCodeVerifier()
      const challenge = generateCodeChallenge(verifier)

      // Should be base64url encoded
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
      // Should be 43 characters (SHA-256 = 256 bits / 6 bits per char)
      expect(challenge.length).toBe(43)
    })

    it('generates consistent challenge for same verifier', async () => {
      const { generateCodeChallenge } = await import('@/lib/auth/oauth')
      const verifier = 'test-verifier-12345'
      const challenge1 = generateCodeChallenge(verifier)
      const challenge2 = generateCodeChallenge(verifier)

      expect(challenge1).toBe(challenge2)
    })

    it('generates different challenges for different verifiers', async () => {
      const { generateCodeChallenge } = await import('@/lib/auth/oauth')
      const challenge1 = generateCodeChallenge('verifier-1')
      const challenge2 = generateCodeChallenge('verifier-2')

      expect(challenge1).not.toBe(challenge2)
    })

    it('generates state with correct format', async () => {
      const { generateState } = await import('@/lib/auth/oauth')
      const state = generateState()

      // Should be base64url encoded
      expect(state).toMatch(/^[A-Za-z0-9_-]+$/)
      // Should be at least 22 characters (128 bits / 6 bits per char)
      expect(state.length).toBeGreaterThanOrEqual(22)
    })
  })

  describe('Authorization URL Building', () => {
    it('builds authorization URL with all required params', async () => {
      const { buildAuthorizationUrl } = await import('@/lib/auth/oauth')

      const url = buildAuthorizationUrl(
        'client-123',
        'https://example.com/callback',
        'state-abc',
        'challenge-xyz'
      )

      expect(url).toContain('https://twitter.com/i/oauth2/authorize')
      expect(url).toContain('client_id=client-123')
      expect(url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Fcallback')
      expect(url).toContain('state=state-abc')
      expect(url).toContain('code_challenge=challenge-xyz')
      expect(url).toContain('code_challenge_method=S256')
      expect(url).toContain('response_type=code')
    })

    it('includes required scopes', async () => {
      const { buildAuthorizationUrl } = await import('@/lib/auth/oauth')

      const url = buildAuthorizationUrl('client', 'http://cb', 'state', 'challenge')

      expect(url).toContain('scope=')
      expect(url).toContain('tweet.read')
      expect(url).toContain('users.read')
      expect(url).toContain('bookmark.read')
      expect(url).toContain('offline.access')
    })
  })

  describe('OAuth State Management', () => {
    it('saves and retrieves OAuth state', async () => {
      const { saveOAuthState, consumeOAuthState } = await import('@/lib/auth/oauth')

      const state = 'test-state-123'
      const verifier = 'test-verifier-456'

      await saveOAuthState(state, verifier)
      const retrieved = await consumeOAuthState(state)

      expect(retrieved).toBe(verifier)
    })

    it('consumes state only once (one-time use)', async () => {
      const { saveOAuthState, consumeOAuthState } = await import('@/lib/auth/oauth')

      const state = 'one-time-state'
      const verifier = 'one-time-verifier'

      await saveOAuthState(state, verifier)

      // First consumption should succeed
      const first = await consumeOAuthState(state)
      expect(first).toBe(verifier)

      // Second consumption should return null
      const second = await consumeOAuthState(state)
      expect(second).toBeNull()
    })

    it('returns null for non-existent state', async () => {
      const { consumeOAuthState } = await import('@/lib/auth/oauth')

      const result = await consumeOAuthState('nonexistent-state')
      expect(result).toBeNull()
    })
  })

  describe('Token Storage', () => {
    it('saves tokens for new user', async () => {
      const { saveTokens, getStoredTokens } = await import('@/lib/auth/oauth')

      await saveTokens(
        'user-123',
        'testuser',
        'https://example.com/avatar.jpg',
        'access-token-abc',
        'refresh-token-xyz',
        7200, // 2 hours
        'tweet.read users.read'
      )

      const tokens = await getStoredTokens('user-123')

      expect(tokens).not.toBeNull()
      expect(tokens?.userId).toBe('user-123')
      expect(tokens?.username).toBe('testuser')
      expect(tokens?.profileImageUrl).toBe('https://example.com/avatar.jpg')
      expect(tokens?.accessToken).toBe('access-token-abc')
      expect(tokens?.refreshToken).toBe('refresh-token-xyz')
    })

    it('updates tokens for existing user (upsert)', async () => {
      const { saveTokens, getStoredTokens } = await import('@/lib/auth/oauth')

      // Save initial tokens
      await saveTokens('user-123', 'olduser', null, 'old-access', 'old-refresh', 3600, 'scope1')

      // Update tokens
      await saveTokens('user-123', 'newuser', 'new-avatar', 'new-access', 'new-refresh', 7200, 'scope2')

      const tokens = await getStoredTokens('user-123')

      expect(tokens?.username).toBe('newuser')
      expect(tokens?.accessToken).toBe('new-access')
      expect(tokens?.refreshToken).toBe('new-refresh')
    })

    it('returns null for non-existent user', async () => {
      const { getStoredTokens } = await import('@/lib/auth/oauth')

      const tokens = await getStoredTokens('nonexistent-user')
      expect(tokens).toBeNull()
    })

    it('deletes tokens for user', async () => {
      const { saveTokens, getStoredTokens, deleteTokens } = await import('@/lib/auth/oauth')

      await saveTokens('user-to-delete', 'user', null, 'access', 'refresh', 3600, 'scopes')
      await deleteTokens('user-to-delete')

      const tokens = await getStoredTokens('user-to-delete')
      expect(tokens).toBeNull()
    })

    it('checks if user has existing tokens', async () => {
      const { saveTokens, hasExistingTokens } = await import('@/lib/auth/oauth')

      // No tokens initially
      const hasBefore = await hasExistingTokens('check-user')
      expect(hasBefore).toBe(false)

      // After saving
      await saveTokens('check-user', 'user', null, 'access', 'refresh', 3600, 'scopes')
      const hasAfter = await hasExistingTokens('check-user')
      expect(hasAfter).toBe(true)
    })
  })

  describe('Token Expiration', () => {
    it('detects unexpired token', async () => {
      const { isTokenExpired } = await import('@/lib/auth/oauth')

      // Token expiring in 1 hour
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      expect(isTokenExpired(expiresAt)).toBe(false)
    })

    it('detects expired token', async () => {
      const { isTokenExpired } = await import('@/lib/auth/oauth')

      // Token expired 1 hour ago
      const expiresAt = Math.floor(Date.now() / 1000) - 3600
      expect(isTokenExpired(expiresAt)).toBe(true)
    })

    it('treats tokens expiring within 5 minutes as expired (buffer)', async () => {
      const { isTokenExpired } = await import('@/lib/auth/oauth')

      // Token expiring in 4 minutes (within 5 minute buffer)
      const expiresAt = Math.floor(Date.now() / 1000) + 240
      expect(isTokenExpired(expiresAt)).toBe(true)

      // Token expiring in 6 minutes (outside buffer)
      const expiresAtSafe = Math.floor(Date.now() / 1000) + 360
      expect(isTokenExpired(expiresAtSafe)).toBe(false)
    })
  })
})
