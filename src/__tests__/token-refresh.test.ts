import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
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
let beforeNextTransaction: (() => void) | null = null

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    const hook = beforeNextTransaction
    beforeNextTransaction = null
    hook?.()
    return testInstance.sqlite.transaction(fn)()
  },
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.stubEnv('TWITTER_CLIENT_ID', 'test-client-id')
vi.stubEnv('TWITTER_CLIENT_SECRET', 'test-client-secret')

const USER = 'user-1'

async function seedTokens(expiresInSec: number) {
  await testInstance.db.insert(schema.users).values({ id: USER, username: 'tester' })
  await testInstance.db.insert(schema.userIdentities).values([
    {
      provider: 'email',
      providerId: 'tester@example.com',
      userId: USER,
    },
    {
      provider: 'x',
      providerId: 'x-user-1',
      userId: USER,
    },
  ])
  await testInstance.db.insert(schema.oauthTokens).values({
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

function deferRefreshResponse(responseValue: object) {
  let release!: () => void
  const response = new Promise((resolve) => {
    release = () => resolve(responseValue)
  })
  mockFetch.mockReturnValueOnce(response)
  return release
}

function deferRefreshOk() {
  return deferRefreshResponse({
    ok: true,
    json: () =>
      Promise.resolve({
        access_token: 'access-stale-refresh',
        refresh_token: 'refresh-stale-refresh',
        expires_in: 7200,
      }),
  })
}

function deferRefreshRejected() {
  return deferRefreshResponse({
    ok: false,
    status: 400,
    text: () => Promise.resolve('invalid_grant'),
  })
}

describe('getValidTokens', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    beforeNextTransaction = null
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

  it('allows only one external refresh across independent workers', async () => {
    await seedTokens(-3600)
    const releaseRefresh = deferRefreshOk()
    const workerA = await import('@/lib/auth/oauth')

    const winner = workerA.getValidTokens(USER)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    // A fresh module has a distinct in-memory coalescing map, like another
    // worker/process, but shares the durable SQLite token row.
    vi.resetModules()
    const workerB = await import('@/lib/auth/oauth')
    await expect(workerB.getValidTokens(USER)).rejects.toMatchObject({
      name: 'TokenRefreshError',
      status: 423,
      fatal: false,
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    releaseRefresh()
    await expect(winner).resolves.toMatchObject({
      accessToken: 'access-stale-refresh',
      refreshToken: 'refresh-stale-refresh',
    })
    await expect(workerB.getStoredTokens(USER)).resolves.toMatchObject({
      accessToken: 'access-stale-refresh',
      refreshToken: 'refresh-stale-refresh',
      refreshLeaseId: null,
      refreshLeaseStartedAt: null,
    })
  })

  it('recovers a stale durable refresh lease', async () => {
    await seedTokens(-3600)
    await testInstance.db
      .update(schema.oauthTokens)
      .set({
        refreshLeaseId: 'dead-worker',
        refreshLeaseStartedAt: new Date(Date.now() - 31_000).toISOString(),
      })
      .where(eq(schema.oauthTokens.userId, USER))
    mockRefreshOk()

    const { getValidTokens, getStoredTokens } = await import('@/lib/auth/oauth')
    await expect(getValidTokens(USER)).resolves.toMatchObject({
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    await expect(getStoredTokens(USER)).resolves.toMatchObject({
      refreshLeaseId: null,
      refreshLeaseStartedAt: null,
    })
  })

  it('does not recreate tokens when disconnect wins during network refresh', async () => {
    await seedTokens(-3600)
    const releaseRefresh = deferRefreshOk()
    const { getValidTokens } = await import('@/lib/auth/oauth')
    const { unlinkX } = await import('@/lib/auth/account')

    const outcome = getValidTokens(USER).catch((error) => error)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    expect(await unlinkX(USER)).toEqual({ ok: true })
    releaseRefresh()

    await expect(outcome).resolves.toMatchObject({
      name: 'TokenRefreshError',
      status: 409,
      fatal: false,
    })
    expect(await testInstance.db.select().from(schema.oauthTokens)).toHaveLength(0)
    expect(
      await testInstance.db
        .select()
        .from(schema.userIdentities)
        .where(eq(schema.userIdentities.provider, 'x')),
    ).toHaveLength(0)
  })

  it('returns newer callback tokens when they replace the row during refresh', async () => {
    await seedTokens(-3600)
    const releaseRefresh = deferRefreshOk()
    const { getValidTokens, getStoredTokens, saveLinkedXTokens } = await import('@/lib/auth/oauth')

    const pending = getValidTokens(USER)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    expect(
      await saveLinkedXTokens(
        USER,
        'x-user-1',
        'newer-callback',
        null,
        'access-callback-newer',
        'refresh-callback-newer',
        7200,
        'tweet.read',
        0,
      ),
    ).toBe(true)
    releaseRefresh()

    const result = await pending
    expect(result).not.toBeNull()
    expect(result!.accessToken).toBe('access-callback-newer')
    expect(result!.refreshToken).toBe('refresh-callback-newer')
    const stored = await getStoredTokens(USER)
    expect(stored?.accessToken).toBe('access-callback-newer')
    expect(stored?.refreshToken).toBe('refresh-callback-newer')
  })

  it('ignores a stale fatal response after newer callback tokens win', async () => {
    await seedTokens(-3600)
    const releaseRefresh = deferRefreshRejected()
    const { getValidTokens, saveLinkedXTokens } = await import('@/lib/auth/oauth')

    const pending = getValidTokens(USER)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    expect(
      await saveLinkedXTokens(
        USER,
        'x-user-1',
        'newer-callback',
        null,
        'access-callback-newer',
        'refresh-callback-newer',
        7200,
        'tweet.read',
        0,
      ),
    ).toBe(true)
    releaseRefresh()

    await expect(pending).resolves.toMatchObject({
      accessToken: 'access-callback-newer',
      refreshToken: 'refresh-callback-newer',
    })
  })

  it('CAS invalidation preserves callback tokens saved after a fatal response', async () => {
    await seedTokens(-3600)
    const releaseRefresh = deferRefreshRejected()
    const { getValidTokens, getStoredTokens } = await import('@/lib/auth/oauth')
    const { encryptToken } = await import('@/lib/auth/token-encryption')

    const pending = getValidTokens(USER)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    beforeNextTransaction = () => {
      testInstance.db
        .update(schema.oauthTokens)
        .set({
          username: 'newer-callback',
          accessToken: encryptToken('access-after-fatal'),
          refreshToken: encryptToken('refresh-after-fatal'),
          expiresAt: Math.floor(Date.now() / 1000) + 7200,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.oauthTokens.userId, USER))
        .run()
    }
    releaseRefresh()

    await expect(pending).resolves.toMatchObject({
      accessToken: 'access-after-fatal',
      refreshToken: 'refresh-after-fatal',
    })
    await expect(getStoredTokens(USER)).resolves.toMatchObject({
      accessToken: 'access-after-fatal',
      refreshToken: 'refresh-after-fatal',
    })
  })

  it('classifies a stale fatal response as non-fatal after disconnect', async () => {
    await seedTokens(-3600)
    const releaseRefresh = deferRefreshRejected()
    const { getValidTokens } = await import('@/lib/auth/oauth')
    const { unlinkX } = await import('@/lib/auth/account')

    const outcome = getValidTokens(USER).catch((error) => error)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    expect(await unlinkX(USER)).toEqual({ ok: true })
    releaseRefresh()

    await expect(outcome).resolves.toMatchObject({
      name: 'TokenRefreshError',
      status: 409,
      fatal: false,
    })
    expect(await testInstance.db.select().from(schema.oauthTokens)).toHaveLength(0)
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
