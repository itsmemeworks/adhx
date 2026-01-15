import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/auth/twitter/callback
 *
 * Tests OAuth callback handling, state verification, and session creation.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/sentry', () => ({
  metrics: {
    authFailed: vi.fn(),
    authCompleted: vi.fn(),
    trackUser: vi.fn(),
  },
}))

// Mock fetch for Twitter API
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock env vars
vi.stubEnv('TWITTER_CLIENT_ID', 'test-client-id')
vi.stubEnv('TWITTER_CLIENT_SECRET', 'test-client-secret')
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')

function createCallbackRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/auth/twitter/callback')
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })
  return new NextRequest(url)
}

describe('API: /api/auth/twitter/callback', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('Error handling', () => {
    it('redirects with error when Twitter returns an error', async () => {
      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(
        createCallbackRequest({
          error: 'access_denied',
          error_description: 'User denied access',
        })
      )

      expect(response.status).toBe(307) // Redirect
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('User%20denied%20access')
    })

    it('redirects with error when code is missing', async () => {
      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(createCallbackRequest({ state: 'some-state' }))

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('Missing%20code%20or%20state')
    })

    it('redirects with error when state is missing', async () => {
      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(createCallbackRequest({ code: 'some-code' }))

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('Missing%20code%20or%20state')
    })
  })

  describe('State verification', () => {
    it('redirects with error for invalid state', async () => {
      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(
        createCallbackRequest({
          code: 'valid-code',
          state: 'invalid-state',
        })
      )

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('Invalid%20or%20expired%20state')
    })

    it('redirects with error when state does not exist', async () => {
      // Don't insert any state - test non-existent state
      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(
        createCallbackRequest({
          code: 'valid-code',
          state: 'nonexistent-state',
        })
      )

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('Invalid%20or%20expired%20state')
    })
  })

  describe('Successful authentication', () => {
    beforeEach(async () => {
      // Insert a valid OAuth state
      await testInstance.db.insert(schema.oauthState).values({
        state: 'valid-state',
        codeVerifier: 'test-code-verifier',
        createdAt: new Date().toISOString(),
      })
    })

    it('exchanges code for tokens and creates session', async () => {
      // Mock token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 7200,
            scope: 'tweet.read users.read bookmark.read',
          }),
      })

      // Mock user info fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              id: 'user-123',
              username: 'testuser',
              name: 'Test User',
              profile_image_url: 'https://example.com/avatar.jpg',
            },
          }),
      })

      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(
        createCallbackRequest({
          code: 'valid-code',
          state: 'valid-state',
        })
      )

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('firstLogin=true')

      // Verify session cookie was set
      const cookies = response.headers.getSetCookie()
      expect(cookies.some((c) => c.includes('adhx_session'))).toBe(true)
    })

    it('handles return URL cookie for URL prefix feature', async () => {
      // Mock token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 7200,
            scope: 'tweet.read',
          }),
      })

      // Mock user info fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              id: 'user-456',
              username: 'anotheruser',
              name: 'Another User',
            },
          }),
      })

      const request = createCallbackRequest({
        code: 'valid-code',
        state: 'valid-state',
      })
      // Add return URL cookie
      request.cookies.set('adhx_return_url', '/someuser/status/123')

      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('/someuser/status/123')

      // Verify return URL cookie was cleared
      const cookies = response.headers.getSetCookie()
      expect(cookies.some((c) => c.includes('adhx_return_url') && c.includes('Max-Age=0'))).toBe(
        true
      )
    })

    it('tracks new user in metrics', async () => {
      const { metrics } = await import('@/lib/sentry')

      // Mock token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 7200,
            scope: 'tweet.read',
          }),
      })

      // Mock user info fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: 'new-user', username: 'newuser' },
          }),
      })

      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      await GET(
        createCallbackRequest({
          code: 'valid-code',
          state: 'valid-state',
        })
      )

      expect(metrics.authCompleted).toHaveBeenCalledWith(true)
      expect(metrics.trackUser).toHaveBeenCalledWith('new-user')
    })

    it('identifies returning user in metrics', async () => {
      // Insert existing tokens for user
      await testInstance.db.insert(schema.oauthTokens).values({
        userId: 'existing-user',
        username: 'existinguser',
        accessToken: 'old-token',
        refreshToken: 'old-refresh',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        scopes: 'tweet.read',
      })

      const { metrics } = await import('@/lib/sentry')

      // Mock token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 7200,
            scope: 'tweet.read',
          }),
      })

      // Mock user info fetch (same user)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: 'existing-user', username: 'existinguser' },
          }),
      })

      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      await GET(
        createCallbackRequest({
          code: 'valid-code',
          state: 'valid-state',
        })
      )

      expect(metrics.authCompleted).toHaveBeenCalledWith(false)
    })
  })

  describe('Token exchange errors', () => {
    beforeEach(async () => {
      await testInstance.db.insert(schema.oauthState).values({
        state: 'valid-state',
        codeVerifier: 'test-verifier',
        createdAt: new Date().toISOString(),
      })
    })

    it('handles token exchange failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Invalid authorization code'),
      })

      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(
        createCallbackRequest({
          code: 'invalid-code',
          state: 'valid-state',
        })
      )

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
    })

    it('handles network errors during token exchange', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(
        createCallbackRequest({
          code: 'valid-code',
          state: 'valid-state',
        })
      )

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
    })
  })
})
