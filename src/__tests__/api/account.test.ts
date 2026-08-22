import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/account and /api/account/clear
 *
 * Tests account deletion and data clearing.
 * Verifies multi-user isolation - clearing/deleting one user
 * should not affect other users.
 */

let mockUserId: string | null = USER_A
let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
  clearSession: vi.fn(() => Promise.resolve()),
  clearSessionCookie: vi.fn(),
}))

vi.mock('@/lib/sentry', () => ({
  metrics: {
    accountCleared: vi.fn(),
    accountDeleted: vi.fn(),
    dataCleared: vi.fn(),
  },
  captureException: vi.fn(),
}))

async function seedUserData(userId: string) {
  await testInstance.db
    .insert(schema.bookmarks)
    .values([createTestBookmark(userId, 't1'), createTestBookmark(userId, 't2')])
  await testInstance.db
    .insert(schema.bookmarkTags)
    .values([{ userId, bookmarkId: 't1', tag: 'tag1' }])
  await testInstance.db
    .insert(schema.bookmarkMedia)
    .values([
      { id: `${userId}-m1`, userId, bookmarkId: 't1', mediaType: 'photo', originalUrl: 'u' },
    ])
  await testInstance.db
    .insert(schema.bookmarkLinks)
    .values([{ userId, bookmarkId: 't1', expandedUrl: 'https://example.com' }])
  await testInstance.db
    .insert(schema.archivedPosts)
    .values([{ userId, bookmarkId: 't1', archivedAt: '2024-01-01T10:00:00Z' }])
  await testInstance.db
    .insert(schema.userPreferences)
    .values([{ userId, key: 'theme', value: 'dark' }])
  await testInstance.db
    .insert(schema.syncLogs)
    .values([
      { id: `log-${userId}`, userId, startedAt: '2024-01-01T10:00:00Z', status: 'completed' },
    ])
  await testInstance.db.insert(schema.oauthTokens).values([
    {
      userId,
      username: 'test',
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600000,
    },
  ])
  await testInstance.db
    .insert(schema.tagShares)
    .values([{ userId, tag: 'tag1', shareCode: `share-${userId}` }])
}

/**
 * Seeds the account/identity rows exercised only by the DELETE /api/account
 * test suite (users, linked identities, outstanding magic-link tokens) — the
 * `clear` endpoint never touches these, so `/api/account/clear` tests don't
 * need them.
 */
async function seedAccountData(userId: string, email: string) {
  await testInstance.db.insert(schema.users).values([{ id: userId, username: userId, email }])
  await testInstance.db.insert(schema.userIdentities).values([
    { provider: 'x', providerId: `x-${userId}`, userId },
    { provider: 'email', providerId: email, userId },
  ])
  await testInstance.db.insert(schema.loginTokens).values([
    // 'signin' tokens only carry the email, not a userId
    {
      tokenHash: `signin-hash-${userId}`,
      email,
      intent: 'signin',
      expiresAt: Date.now() + 900_000,
    },
    // 'change' tokens carry the confirming account's userId
    {
      tokenHash: `change-hash-${userId}`,
      email: `new-${email}`,
      intent: 'change',
      userId,
      expiresAt: Date.now() + 900_000,
    },
  ])
}

describe('API: /api/account/clear', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    mockUserId = USER_A
    vi.clearAllMocks()

    // Seed data for both users
    await seedUserData(USER_A)
    await seedUserData(USER_B)
  })

  afterEach(() => {
    testInstance.close()
  })

  it('returns 401 when not authenticated', async () => {
    mockUserId = null

    const { POST } = await import('@/app/api/account/clear/route')
    const response = await POST()

    expect(response.status).toBe(401)
  })

  it('clears all user data except OAuth tokens', async () => {
    const { POST } = await import('@/app/api/account/clear/route')
    const response = await POST()

    expect(response.status).toBe(200)

    // Verify User A's data is cleared
    const bookmarks = await testInstance.db
      .select()
      .from(schema.bookmarks)
      .where(eq(schema.bookmarks.userId, USER_A))
    const tags = await testInstance.db
      .select()
      .from(schema.bookmarkTags)
      .where(eq(schema.bookmarkTags.userId, USER_A))
    const media = await testInstance.db
      .select()
      .from(schema.bookmarkMedia)
      .where(eq(schema.bookmarkMedia.userId, USER_A))
    const links = await testInstance.db
      .select()
      .from(schema.bookmarkLinks)
      .where(eq(schema.bookmarkLinks.userId, USER_A))
    const archivedPostses = await testInstance.db
      .select()
      .from(schema.archivedPosts)
      .where(eq(schema.archivedPosts.userId, USER_A))
    const prefs = await testInstance.db
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, USER_A))
    const syncLogs = await testInstance.db
      .select()
      .from(schema.syncLogs)
      .where(eq(schema.syncLogs.userId, USER_A))

    expect(bookmarks).toHaveLength(0)
    expect(tags).toHaveLength(0)
    expect(media).toHaveLength(0)
    expect(links).toHaveLength(0)
    expect(archivedPostses).toHaveLength(0)
    expect(prefs).toHaveLength(0)
    expect(syncLogs).toHaveLength(0)

    // OAuth token should still exist
    const oauth = await testInstance.db
      .select()
      .from(schema.oauthTokens)
      .where(eq(schema.oauthTokens.userId, USER_A))
    expect(oauth).toHaveLength(1)
  })

  it("does not affect other user's data", async () => {
    const { POST } = await import('@/app/api/account/clear/route')
    await POST()

    // Verify User B's data is intact
    const bookmarks = await testInstance.db
      .select()
      .from(schema.bookmarks)
      .where(eq(schema.bookmarks.userId, USER_B))
    const tags = await testInstance.db
      .select()
      .from(schema.bookmarkTags)
      .where(eq(schema.bookmarkTags.userId, USER_B))
    const media = await testInstance.db
      .select()
      .from(schema.bookmarkMedia)
      .where(eq(schema.bookmarkMedia.userId, USER_B))
    const archivedPostses = await testInstance.db
      .select()
      .from(schema.archivedPosts)
      .where(eq(schema.archivedPosts.userId, USER_B))
    const oauth = await testInstance.db
      .select()
      .from(schema.oauthTokens)
      .where(eq(schema.oauthTokens.userId, USER_B))

    expect(bookmarks).toHaveLength(2)
    expect(tags).toHaveLength(1)
    expect(media).toHaveLength(1)
    expect(archivedPostses).toHaveLength(1)
    expect(oauth).toHaveLength(1)
  })
})

describe('API: /api/account', () => {
  const EMAIL_A = 'user-a@example.com'
  const EMAIL_B = 'user-b@example.com'

  beforeEach(async () => {
    testInstance = createTestDb()
    mockUserId = USER_A
    vi.clearAllMocks()

    await seedUserData(USER_A)
    await seedUserData(USER_B)
    await seedAccountData(USER_A, EMAIL_A)
    await seedAccountData(USER_B, EMAIL_B)
  })

  afterEach(() => {
    testInstance.close()
  })

  it('returns 401 when not authenticated', async () => {
    mockUserId = null

    const { DELETE } = await import('@/app/api/account/route')
    const response = await DELETE()

    expect(response.status).toBe(401)
  })

  it('deletes all user data, the account row, and every linked identity', async () => {
    const { DELETE } = await import('@/app/api/account/route')
    const response = await DELETE()

    expect(response.status).toBe(200)

    // Verify User A's bookmark data is completely deleted
    const bookmarks = await testInstance.db
      .select()
      .from(schema.bookmarks)
      .where(eq(schema.bookmarks.userId, USER_A))
    const oauth = await testInstance.db
      .select()
      .from(schema.oauthTokens)
      .where(eq(schema.oauthTokens.userId, USER_A))
    const tagShareRows = await testInstance.db
      .select()
      .from(schema.tagShares)
      .where(eq(schema.tagShares.userId, USER_A))

    expect(bookmarks).toHaveLength(0)
    expect(oauth).toHaveLength(0)
    expect(tagShareRows).toHaveLength(0)

    // The account row itself is gone — username/email/avatar no longer exist
    const userRows = await testInstance.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, USER_A))
    expect(userRows).toHaveLength(0)

    // Every linked identity (X + email) is gone
    const identityRows = await testInstance.db
      .select()
      .from(schema.userIdentities)
      .where(eq(schema.userIdentities.userId, USER_A))
    expect(identityRows).toHaveLength(0)

    // Outstanding magic-link tokens for this account (by userId) and this
    // email (signin tokens only carry the email) are both gone
    const tokensByUserId = await testInstance.db
      .select()
      .from(schema.loginTokens)
      .where(eq(schema.loginTokens.userId, USER_A))
    const tokensByEmail = await testInstance.db
      .select()
      .from(schema.loginTokens)
      .where(eq(schema.loginTokens.email, EMAIL_A))
    expect(tokensByUserId).toHaveLength(0)
    expect(tokensByEmail).toHaveLength(0)
  })

  it('clears the session cookie on the response', async () => {
    const { clearSessionCookie } = await import('@/lib/auth/session')
    const { DELETE } = await import('@/app/api/account/route')
    await DELETE()

    expect(clearSessionCookie).toHaveBeenCalledTimes(1)
  })

  it("does not affect other user's account, identities, or data", async () => {
    const { DELETE } = await import('@/app/api/account/route')
    await DELETE()

    // Verify User B's data is intact
    const bookmarks = await testInstance.db
      .select()
      .from(schema.bookmarks)
      .where(eq(schema.bookmarks.userId, USER_B))
    const oauth = await testInstance.db
      .select()
      .from(schema.oauthTokens)
      .where(eq(schema.oauthTokens.userId, USER_B))
    const tagShareRows = await testInstance.db
      .select()
      .from(schema.tagShares)
      .where(eq(schema.tagShares.userId, USER_B))

    expect(bookmarks).toHaveLength(2)
    expect(oauth).toHaveLength(1)
    expect(tagShareRows).toHaveLength(1)

    // User B's account row and identities survive
    const userRows = await testInstance.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, USER_B))
    const identityRows = await testInstance.db
      .select()
      .from(schema.userIdentities)
      .where(eq(schema.userIdentities.userId, USER_B))
    expect(userRows).toHaveLength(1)
    expect(identityRows).toHaveLength(2)

    // User B's magic-link tokens survive
    const tokensByEmail = await testInstance.db
      .select()
      .from(schema.loginTokens)
      .where(eq(schema.loginTokens.email, EMAIL_B))
    expect(tokensByEmail).toHaveLength(1)
  })
})
