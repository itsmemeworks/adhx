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
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() => Promise.resolve(mockSession)),
  getCurrentUserId: vi.fn(() => Promise.resolve(mockSession?.userId || null)),
  clearSessionCookie: vi.fn((response) => {
    // Mock implementation that sets cookie to empty value with expired date
    response.cookies.set('adhx_session', '', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    })
  }),
}))

// Mock fetch for Twitter API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock env vars
vi.stubEnv('TWITTER_CLIENT_ID', 'test-client-id')
vi.stubEnv('TWITTER_CLIENT_SECRET', 'test-client-secret')

describe('API: /api/auth/twitter/status', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    mockSession = { userId: 'user-123' }
    vi.clearAllMocks()
    await testInstance.db.insert(schema.users).values({
      id: 'user-123',
      username: 'testuser',
    })
    await testInstance.db.insert(schema.userIdentities).values({
      provider: 'x',
      providerId: 'x-user-123',
      userId: 'user-123',
    })
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

    it('returns authenticated: true with xConnected: false when no tokens stored (account outlives X)', async () => {
      mockSession = { userId: 'user-no-tokens' }
      await testInstance.db.insert(schema.users).values({
        id: 'user-no-tokens',
        username: 'email-user',
      })

      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      // A valid session + no X connection is still an authenticated account
      // (e.g. email-only sign-in, or a disconnected X account) — it no
      // longer implies logged out.
      expect(data.authenticated).toBe(true)
      expect(data.user.id).toBe('user-no-tokens')
      expect(data.xConnected).toBe(false)
      expect(data.needsReconnect).toBe(false)
    })

    it('keeps a stale deleted-account session signed out without recreating the user', async () => {
      mockSession = { userId: 'deleted-user' }

      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const response = await GET()
      const data = await response.json()

      expect(data).toEqual({ authenticated: false, user: null })
      const rows = await testInstance.db.select().from(schema.users)
      expect(rows.map((row) => row.id)).not.toContain('deleted-user')
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
        json: () =>
          Promise.resolve({
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
        }),
      )
    })

    it('drops X tokens but KEEPS the session on a fatal refresh failure (account outlives X)', async () => {
      // Mock failed token refresh
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid refresh token'),
      })

      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      // The account survives a dead X refresh token — only the X connection
      // is torn down, flagged via needsReconnect for the UI to prompt a
      // fresh /api/auth/twitter round-trip.
      expect(data.authenticated).toBe(true)
      expect(data.xConnected).toBe(false)
      expect(data.needsReconnect).toBe(true)
      // Session cookie is untouched (never set/cleared by this route now).
      const sessionCookie = response.cookies.get('adhx_session')
      expect(sessionCookie).toBeUndefined()
      // X tokens are gone.
      const { getStoredTokens } = await import('@/lib/auth/oauth')
      expect(await getStoredTokens('user-123')).toBeNull()
    })

    it('keeps the session on a TRANSIENT refresh failure (5xx)', async () => {
      // A 5xx / network blip must not force re-auth — keep tokens for a retry.
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
      })

      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const response = await GET()

      const data = await response.json()
      // Still authenticated — the session is preserved, not torn down.
      expect(data.authenticated).toBe(true)
      // The session cookie was NOT cleared.
      expect(response.cookies.get('adhx_session')?.value).not.toBe('')
      // Tokens are still stored (available for a later retry).
      const { getStoredTokens } = await import('@/lib/auth/oauth')
      expect(await getStoredTokens('user-123')).not.toBeNull()
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
        json: () =>
          Promise.resolve({
            data: {
              id: 'x-user-123',
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
      // Mock failed Twitter API call (getCurrentUser uses fetchWithRetry which checks status)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve('API error'),
      })

      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.authenticated).toBe(true)
      expect(data.user.profileImageUrl).toBeNull()
    })

    it('does not persist or show account A avatar after disconnect and relink to B', async () => {
      await testInstance.db.insert(schema.userIdentities).values({
        provider: 'email',
        providerId: 'reader@example.com',
        userId: 'user-123',
      })
      let releaseProfile!: () => void
      mockFetch.mockReturnValueOnce(
        new Promise((resolve) => {
          releaseProfile = () =>
            resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  data: {
                    id: 'x-user-123',
                    username: 'old-x',
                    name: 'Old X',
                    profile_image_url: 'https://example.com/account-a_normal.jpg',
                  },
                }),
            })
        }),
      )

      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const pending = GET()
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      const { unlinkX, findOrCreateUserForX } = await import('@/lib/auth/account')
      const { saveLinkedXTokens, getStoredTokens } = await import('@/lib/auth/oauth')
      expect(await unlinkX('user-123')).toEqual({ ok: true })
      const linked = await findOrCreateUserForX(
        {
          xUserId: 'x-user-b',
          username: 'new-x',
          name: 'New X',
          profileImageUrl: 'https://example.com/account-b.jpg',
        },
        'user-123',
        1,
      )
      expect(linked.conflict).toBeUndefined()
      expect(
        await saveLinkedXTokens(
          'user-123',
          'x-user-b',
          'new-x',
          'https://example.com/account-b.jpg',
          'access-b',
          'refresh-b',
          7200,
          'tweet.read',
          1,
        ),
      ).toBe(true)
      releaseProfile()

      const response = await pending
      const data = await response.json()
      expect(data.user.username).toBe('new-x')
      expect(data.user.profileImageUrl).toBe('https://example.com/account-b.jpg')
      await expect(getStoredTokens('user-123')).resolves.toMatchObject({
        username: 'new-x',
        profileImageUrl: 'https://example.com/account-b.jpg',
        accessToken: 'access-b',
      })
    })

    it('reconciles relinked account B when slow account A has no avatar', async () => {
      await testInstance.db.insert(schema.userIdentities).values({
        provider: 'email',
        providerId: 'reader@example.com',
        userId: 'user-123',
      })
      let releaseProfile!: () => void
      mockFetch.mockReturnValueOnce(
        new Promise((resolve) => {
          releaseProfile = () =>
            resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  data: {
                    id: 'x-user-123',
                    username: 'old-x',
                    name: 'Old X',
                  },
                }),
            })
        }),
      )

      const { GET } = await import('@/app/api/auth/twitter/status/route')
      const pending = GET()
      await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

      const { unlinkX, findOrCreateUserForX } = await import('@/lib/auth/account')
      const { saveLinkedXTokens } = await import('@/lib/auth/oauth')
      expect(await unlinkX('user-123')).toEqual({ ok: true })
      const linked = await findOrCreateUserForX(
        {
          xUserId: 'x-user-b',
          username: 'new-x',
          name: 'New X',
          profileImageUrl: 'https://example.com/account-b.jpg',
        },
        'user-123',
        1,
      )
      expect(linked.conflict).toBeUndefined()
      expect(
        await saveLinkedXTokens(
          'user-123',
          'x-user-b',
          'new-x',
          'https://example.com/account-b.jpg',
          'access-b',
          'refresh-b',
          7200,
          'tweet.read',
          1,
        ),
      ).toBe(true)
      releaseProfile()

      const response = await pending
      const data = await response.json()
      expect(data.user).toMatchObject({
        username: 'new-x',
        profileImageUrl: 'https://example.com/account-b.jpg',
      })
    })
  })
})
