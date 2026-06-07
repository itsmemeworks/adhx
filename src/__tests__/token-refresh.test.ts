import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from './api/setup'
import * as schema from '@/lib/db/schema'

/**
 * Token refresh tests — the race-safe refresh that keeps the single-use X
 * refresh-token rotation chain intact.
 *
 * X OAuth2 refresh tokens rotate on every use: refreshing issues a new
 * access+refresh token and invalidates the old refresh token. Two concurrent
 * refreshes would both spend the same token — the loser gets an invalidated
 * token and the chain dies, forcing a re-auth. `getValidTokens` coalesces
 * concurrent refreshes per user onto one in-flight request to prevent that.
 *
 * Setup mirrors oauth.test.ts: real oauth functions run against an in-memory
 * DB; only the Twitter token endpoint (global fetch) is mocked.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.stubEnv('TWITTER_CLIENT_ID', 'test-client-id')
vi.stubEnv('TWITTER_CLIENT_SECRET', 'test-client-secret')

const USER = 'user-1'

function seedTokens(expiresInSec: number) {
  return testInstance.db.insert(schema.oauthTokens).values({
    userId: USER,
    username: 'tester',
    profileImageUrl: null,
    accessToken: 'access-old',
    refreshToken: 'refresh-old',
    expiresAt: Math.floor(Date.now() / 1000) + expiresInSec,
    scopes: 'tweet.read',
  })
}

/** Queue `n` successful rotating-refresh responses from the token endpoint. */
function mockRefreshOk(n = 1) {
  for (let i = 0; i < n; i++) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'access-new',
          refresh_token: 'refresh-new',
          expires_in: 7200,
        }),
    })
  }
}

describe('getValidTokens', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    // mockReset (not clearAllMocks) drains any queued mockResolvedValueOnce
    // values so leftovers from one test can't bleed into the next.
    mockFetch.mockReset()
  })
  afterEach(() => testInstance.close())

  it('returns stored tokens without refreshing when still valid', async () => {
    await seedTokens(7200)
    const { getValidTokens } = await import('@/lib/auth/oauth')
    const tokens = await getValidTokens(USER)
    expect(tokens?.accessToken).toBe('access-old')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null when the user has no stored tokens', async () => {
    const { getValidTokens } = await import('@/lib/auth/oauth')
    expect(await getValidTokens('nobody')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('refreshes an expired token and persists the rotated tokens (encrypted)', async () => {
    await seedTokens(-3600)
    mockRefreshOk()
    const { getValidTokens, getStoredTokens } = await import('@/lib/auth/oauth')

    const tokens = await getValidTokens(USER)
    expect(tokens?.accessToken).toBe('access-new')
    expect(tokens?.refreshToken).toBe('refresh-new')
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // The rotated tokens are persisted (and round-trip through encryption).
    const stored = await getStoredTokens(USER)
    expect(stored?.accessToken).toBe('access-new')
    expect(stored?.refreshToken).toBe('refresh-new')
  })

  it('refreshes within the 5-minute expiry buffer (not only when fully expired)', async () => {
    await seedTokens(60) // valid for 60s — inside the 300s buffer, treated as expired
    mockRefreshOk()
    const { getValidTokens } = await import('@/lib/auth/oauth')
    const tokens = await getValidTokens(USER)
    expect(tokens?.accessToken).toBe('access-new')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('forceRefresh refreshes even when the token looks valid', async () => {
    await seedTokens(7200)
    mockRefreshOk()
    const { getValidTokens } = await import('@/lib/auth/oauth')
    const tokens = await getValidTokens(USER, { forceRefresh: true })
    expect(tokens?.accessToken).toBe('access-new')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent refreshes into a single token request', async () => {
    await seedTokens(-3600)
    mockRefreshOk(5) // queue more than enough; only one should be consumed
    const { getValidTokens } = await import('@/lib/auth/oauth')

    const results = await Promise.all(Array.from({ length: 5 }, () => getValidTokens(USER)))

    // The whole point: 5 concurrent callers, exactly ONE network refresh — so
    // the single-use refresh token is spent once and the chain survives.
    expect(mockFetch).toHaveBeenCalledTimes(1)
    for (const r of results) expect(r?.accessToken).toBe('access-new')
  })

  it('starts a new refresh after the in-flight one has settled', async () => {
    await seedTokens(-3600)
    mockRefreshOk(2)
    const { getValidTokens } = await import('@/lib/auth/oauth')

    await getValidTokens(USER) // refresh #1 (token now valid)
    await getValidTokens(USER, { forceRefresh: true }) // refresh #2 — not coalesced with #1
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws a FATAL TokenRefreshError when the refresh token is rejected (400)', async () => {
    await seedTokens(-3600)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve('invalid_grant'),
    })
    const { getValidTokens, TokenRefreshError } = await import('@/lib/auth/oauth')

    const err = await getValidTokens(USER).catch((e) => e)
    expect(err).toBeInstanceOf(TokenRefreshError)
    expect(err.fatal).toBe(true)
  })

  it('throws a NON-FATAL TokenRefreshError on a transient failure (5xx)', async () => {
    await seedTokens(-3600)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: () => Promise.resolve('service unavailable'),
    })
    const { getValidTokens } = await import('@/lib/auth/oauth')
    await expect(getValidTokens(USER)).rejects.toMatchObject({ fatal: false })
  })

  it('clears the in-flight entry after a failed refresh (so a retry can run)', async () => {
    await seedTokens(-3600)
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 503, text: () => Promise.resolve('blip') })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'access-new',
            refresh_token: 'refresh-new',
            expires_in: 7200,
          }),
      })
    const { getValidTokens } = await import('@/lib/auth/oauth')

    await expect(getValidTokens(USER)).rejects.toBeTruthy() // transient failure
    const recovered = await getValidTokens(USER) // retry succeeds
    expect(recovered?.accessToken).toBe('access-new')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

describe('TokenRefreshError', () => {
  it('is fatal for 400/401 and transient otherwise', async () => {
    const { TokenRefreshError } = await import('@/lib/auth/oauth')
    expect(new TokenRefreshError('x', 400).fatal).toBe(true)
    expect(new TokenRefreshError('x', 401).fatal).toBe(true)
    expect(new TokenRefreshError('x', 500).fatal).toBe(false)
    expect(new TokenRefreshError('x', 0).fatal).toBe(false)
  })
})
