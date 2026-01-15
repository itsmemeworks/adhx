import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/auth/twitter/status
 *
 * Tests auth status checking, token refresh, and profile image fetching.
 */

let testInstance: TestDbInstance
let mockSession: { userId: string } | null = { userId: 'user-123' }

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() => Promise.resolve(mockSession)),
  getCurrentUserId: vi.fn(() => Promise.resolve(mockSession?.userId || null)),
}))

// Mock fetch for Twitter API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock env vars
vi.stubEnv('TWITTER_CLIENT_ID', 'test-client-id')
vi.stubEnv('TWITTER_CLIENT_SECRET', 'test-client-secret')

describe('API: /api/auth/twitter/status', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockSession = { userId: 'user-123' }
    vi.clearAllMocks()
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('Unauthenticated requests', () => {
    it('returns authenticated: false when no session', async () => {
      mockSession = null

      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.authenticated).toBe(false)
      expect(data.user).toBeNull()
    })

    it('returns authenticated: false when no tokens stored', async () => {
      mockSession = { userId: 'user-no-tokens' }

      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.authenticated).toBe(false)
      expect(data.user).toBeNull()
    })
  })

  describe('Authenticated requests with valid tokens', () => {
    beforeEach(async () => {
      // Insert valid tokens (expiring in 1 hour)
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      await testInstance.db.insert(schema.oauthTokens).values({
        userId: 'user-123',
        username: 'testuser',
        profileImageUrl: 'https://example.com/avatar.jpg',
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt,
        scopes: 'tweet.read users.read',
      })
    })

    it('returns authenticated: true with user info', async () => {
      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.authenticated).toBe(true)
      expect(data.user.id).toBe('user-123')
      expect(data.user.username).toBe('testuser')
      expect(data.user.profileImageUrl).toBe('https://example.com/avatar.jpg')
      expect(data.tokenExpired).toBe(false)
    })
  })

  describe('Token refresh on expiration', () => {
    beforeEach(async () => {
      // Insert expired tokens (expired 1 hour ago)
      const expiresAt = Math.floor(Date.now() / 1000) - 3600
      await testInstance.db.insert(schema.oauthTokens).values({
        userId: 'user-123',
        username: 'testuser',
        profileImageUrl: 'https://example.com/avatar.jpg',
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt,
        scopes: 'tweet.read users.read',
      })
    })

    it('refreshes expired tokens successfully', async () => {
      // Mock successful token refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 7200,
        }),
      })

      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.authenticated).toBe(true)
      expect(data.tokenExpired).toBe(false)

      // Verify token was refreshed
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.twitter.com/2/oauth2/token',
        expect.objectContaining({
          method: 'POST',
        })
      )
    })

    it('handles token refresh failure gracefully', async () => {
      // Mock failed token refresh
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Invalid refresh token'),
      })

      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.authenticated).toBe(true)
      expect(data.tokenExpired).toBe(true) // Still shows as expired
    })
  })

  describe('Profile image fetching', () => {
    beforeEach(async () => {
      // Insert tokens without profile image
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      await testInstance.db.insert(schema.oauthTokens).values({
        userId: 'user-123',
        username: 'testuser',
        profileImageUrl: null, // No profile image
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt,
        scopes: 'tweet.read users.read',
      })
    })

    it('fetches profile image when missing', async () => {
      // Mock Twitter API response for user info
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            id: 'user-123',
            username: 'testuser',
            name: 'Test User',
            profile_image_url: 'https://pbs.twimg.com/profile_images/123_normal.jpg',
          },
        }),
      })

      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      // Profile image should be fetched and upgraded to 400x400
      expect(data.user.profileImageUrl).toContain('_400x400')
    })

    it('continues without profile image on fetch failure', async () => {
      // Mock failed Twitter API call
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('API error'),
      })

      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.authenticated).toBe(true)
      expect(data.user.profileImageUrl).toBeNull()
    })
  })
})
