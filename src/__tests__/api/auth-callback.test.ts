import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
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
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

vi.mock('@/lib/sentry', () => ({
  metrics: {
    authFailed: vi.fn(),
    authCompleted: vi.fn(),
    trackUser: vi.fn(),
  },
  captureException: vi.fn(),
}))

// getCurrentUserId() reads cookies() from next/headers, which throws outside a real
// request scope (this test invokes the route handler directly, not through
// Next's server runtime). Mock it to "no existing session" by
// default; keep setSessionCookie/clearSessionCookie real since they only use
// NextResponse.cookies (no next/headers involved).
vi.mock('@/lib/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/session')>('@/lib/auth/session')
  return {
    ...actual,
    getCurrentUserId: vi.fn(() => Promise.resolve(null)),
  }
})

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

async function seedSignedIn(userId = 'u_email', username = 'emailer') {
  await testInstance.db.insert(schema.users).values({ id: userId, username })
  const { getCurrentUserId } = await import('@/lib/auth/session')
  vi.mocked(getCurrentUserId).mockResolvedValue(userId) // overrides the default null session
  return { userId, username }
}

describe('API: /api/auth/twitter/callback', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    vi.clearAllMocks()
    vi.resetModules()
    const { getCurrentUserId } = await import('@/lib/auth/session')
    vi.mocked(getCurrentUserId).mockResolvedValue(null)
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
        }),
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
    it('bounces unsigned visitors before consuming OAuth state', async () => {
      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(
        createCallbackRequest({
          code: 'valid-code',
          state: 'invalid-state',
        }),
      )

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/?auth_error=x_link_only')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('redirects a signed-in visitor with error for invalid state', async () => {
      await seedSignedIn()
      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(
        createCallbackRequest({
          code: 'valid-code',
          state: 'invalid-state',
        }),
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

    it('bounces unsigned callbacks without creating an account or session', async () => {
      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(
        createCallbackRequest({
          code: 'valid-code',
          state: 'valid-state',
        }),
      )

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/?auth_error=x_link_only')
      const cookies = response.headers.getSetCookie()
      expect(cookies.some((c) => c.includes('adhx_session'))).toBe(false)
      expect(await testInstance.db.select().from(schema.users)).toHaveLength(0)
      expect(await testInstance.db.select().from(schema.oauthTokens)).toHaveLength(0)
      expect(mockFetch).not.toHaveBeenCalled()
      // PKCE verifier is not spent, so a later signed-in retry of Connect X
      // can start a fresh grant.
      const states = await testInstance.db.select().from(schema.oauthState)
      expect(states).toHaveLength(1)
    })

    it('exchanges code for tokens and creates session', async () => {
      await seedSignedIn()
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
        }),
      )

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('/settings')
      expect(location).not.toContain('firstLogin')

      // Verify session cookie was set
      const cookies = response.headers.getSetCookie()
      expect(cookies.some((c) => c.includes('adhx_session'))).toBe(true)
    })

    it('handles return URL cookie for URL prefix feature', async () => {
      await seedSignedIn()
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
        true,
      )
    })

    it('ignores an open-redirect return URL cookie (protocol-relative //evil.com)', async () => {
      await seedSignedIn()
      // `//evil.com` is protocol-relative: `new URL('//evil.com', BASE_URL)`
      // resolves to `https://evil.com/` when honored unvalidated — an open
      // redirect straight out of a successful login.
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: 'user-evil', username: 'evilredirectuser' },
          }),
      })

      const request = createCallbackRequest({
        code: 'valid-code',
        state: 'valid-state',
      })
      request.cookies.set('adhx_return_url', '//evil.com')

      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).not.toContain('evil.com')
      // Falls back to Settings (X is a link, not a sign-in) instead.
      expect(location).toContain('/settings')
      expect(location).not.toContain('firstLogin')

      // The malicious cookie is still cleared like any other return-url cookie.
      const cookies = response.headers.getSetCookie()
      expect(cookies.some((c) => c.includes('adhx_return_url') && c.includes('Max-Age=0'))).toBe(
        true,
      )
    })

    it('honors a legit same-origin return URL cookie (e.g. /feed)', async () => {
      await seedSignedIn()
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { id: 'user-legit', username: 'legituser' },
          }),
      })

      const request = createCallbackRequest({
        code: 'valid-code',
        state: 'valid-state',
      })
      request.cookies.set('adhx_return_url', '/feed')

      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('/feed')
    })

    it('tracks new user in metrics', async () => {
      await seedSignedIn()
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
        }),
      )

      expect(metrics.authCompleted).toHaveBeenCalledWith(true)
      expect(metrics.trackUser).toHaveBeenCalledWith('u_email')
    })

    it('identifies returning user in metrics', async () => {
      await seedSignedIn('existing-user', 'existinguser')
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
        }),
      )

      expect(metrics.authCompleted).toHaveBeenCalledWith(false)
    })
  })

  describe('X identity already linked to another account', () => {
    // Regression coverage for Sentry WHITE-SUN-6317-17
    // (SqliteError: UNIQUE constraint failed: users.id). findOrCreateUserForX
    // itself is unit-tested in depth in
    // src/__tests__/account-x-identity.test.ts — these cover the HTTP-level
    // contract: a conflict must redirect cleanly, never 500, never touch the
    // caller's session.
    beforeEach(async () => {
      await testInstance.db.insert(schema.oauthState).values({
        state: 'valid-state',
        codeVerifier: 'test-code-verifier',
        createdAt: new Date().toISOString(),
      })
    })

    it('redirects to /settings?auth_error=x_already_linked and leaves the signed-in session untouched when a DIFFERENT session tries to connect an already-linked X account', async () => {
      // Account 'x-owner' already owns the X identity being connected.
      await testInstance.db.insert(schema.users).values({ id: 'x-owner', username: 'xowner' })
      await testInstance.db
        .insert(schema.userIdentities)
        .values({ provider: 'x', providerId: 'shared-x-id', userId: 'x-owner' })

      // A different account is currently signed in and attempts to connect
      // the same X account (e.g. from Settings).
      const { getCurrentUserId } = await import('@/lib/auth/session')
      vi.mocked(getCurrentUserId).mockResolvedValueOnce('signed-in-user')

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: 'shared-x-id', username: 'sharedxaccount' } }),
      })

      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(
        createCallbackRequest({ code: 'valid-code', state: 'valid-state' }),
      )

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/settings?auth_error=x_already_linked',
      )
      // No session cookie churn — the caller's session is left alone.
      const cookies = response.headers.getSetCookie()
      expect(cookies.some((c) => c.includes('adhx_session'))).toBe(false)

      // No rows moved: the identity still belongs to the original owner, and
      // no oauth_tokens row was written for anyone.
      const identities = await testInstance.db
        .select()
        .from(schema.userIdentities)
        .where(eq(schema.userIdentities.providerId, 'shared-x-id'))
      expect(identities).toHaveLength(1)
      expect(identities[0].userId).toBe('x-owner')
      const tokenRows = await testInstance.db.select().from(schema.oauthTokens)
      expect(tokenRows).toHaveLength(0)
    })

    it('does not silently sign in when the X id belongs to a detached account and there is no session', async () => {
      await testInstance.db.insert(schema.users).values({
        id: 'detached-id',
        username: 'detacheduser',
        email: 'detached@example.com',
        usernameChosen: true,
      })
      await testInstance.db
        .insert(schema.userIdentities)
        .values({ provider: 'email', providerId: 'detached@example.com', userId: 'detached-id' })

      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(
        createCallbackRequest({ code: 'valid-code', state: 'valid-state' }),
      )

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/?auth_error=x_link_only')
      const cookies = response.headers.getSetCookie()
      expect(cookies.some((c) => c.includes('adhx_session'))).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
      const xIdentities = await testInstance.db
        .select()
        .from(schema.userIdentities)
        .where(eq(schema.userIdentities.provider, 'x'))
      expect(xIdentities).toHaveLength(0)
    })

    it('relinks X when the signed-in session already is the detached account', async () => {
      await testInstance.db.insert(schema.users).values({
        id: 'detached-id',
        username: 'detacheduser',
        email: 'detached@example.com',
        usernameChosen: true,
      })
      await testInstance.db
        .insert(schema.userIdentities)
        .values({ provider: 'email', providerId: 'detached@example.com', userId: 'detached-id' })
      const { getCurrentUserId } = await import('@/lib/auth/session')
      vi.mocked(getCurrentUserId).mockResolvedValue('detached-id')

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: { id: 'detached-id', username: 'detacheduser' } }),
      })

      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(
        createCallbackRequest({ code: 'valid-code', state: 'valid-state' }),
      )

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('/settings')
      expect(location).not.toContain('error')
      expect(location).not.toContain('firstLogin')

      const identities = await testInstance.db
        .select()
        .from(schema.userIdentities)
        .where(eq(schema.userIdentities.providerId, 'detached-id'))
      expect(identities).toEqual([
        expect.objectContaining({
          provider: 'x',
          providerId: 'detached-id',
          userId: 'detached-id',
        }),
      ])
      const userRows = await testInstance.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, 'detached-id'))
      expect(userRows).toHaveLength(1)
    })
  })

  describe('OAuth host bounce', () => {
    // In production redirect_uri points at adhx-prod.fly.dev (a host with no
    // "x.com" for X to mangle). X lands the browser there; the callback must
    // bounce to the canonical origin so the session cookie is set on adhx.com.
    it('bounces to the canonical origin when it lands on the redirect_uri host', async () => {
      vi.stubEnv(
        'TWITTER_OAUTH_REDIRECT_URI',
        'https://adhx-prod.fly.dev/api/auth/twitter/callback',
      )
      const url = new URL('https://adhx-prod.fly.dev/api/auth/twitter/callback')
      url.searchParams.set('code', 'abc')
      url.searchParams.set('state', 'xyz')
      const request = new NextRequest(url, { headers: { host: 'adhx-prod.fly.dev' } })

      const { GET } = await import('@/app/api/auth/twitter/callback/route')
      const response = await GET(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/api/auth/twitter/callback?code=abc&state=xyz',
      )
      // Nothing consumed: no token exchange, state still intact for the retry.
      expect(mockFetch).not.toHaveBeenCalled()
      vi.stubEnv('TWITTER_OAUTH_REDIRECT_URI', '')
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
        }),
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
        }),
      )

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
    })
  })
})
