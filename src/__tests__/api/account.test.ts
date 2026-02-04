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
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
  clearSession: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/sentry', () => ({
  metrics: {
    accountCleared: vi.fn(),
    accountDeleted: vi.fn(),
  },
  captureException: vi.fn(),
}))

async function seedUserData(userId: string) {
  await testInstance.db.insert(schema.bookmarks).values([
    createTestBookmark(userId, 't1'),
    createTestBookmark(userId, 't2'),
  ])
  await testInstance.db.insert(schema.bookmarkTags).values([
    { userId, bookmarkId: 't1', tag: 'tag1' },
  ])
  await testInstance.db.insert(schema.bookmarkMedia).values([
    { id: `${userId}-m1`, userId, bookmarkId: 't1', mediaType: 'photo', originalUrl: 'u' },
  ])
  await testInstance.db.insert(schema.bookmarkLinks).values([
    { userId, bookmarkId: 't1', expandedUrl: 'https://example.com' },
  ])
  await testInstance.db.insert(schema.readStatus).values([
    { userId, bookmarkId: 't1', readAt: '2024-01-01T10:00:00Z' },
  ])
  await testInstance.db.insert(schema.userPreferences).values([
    { userId, key: 'theme', value: 'dark' },
  ])
  await testInstance.db.insert(schema.syncState).values([
    { userId, key: 'lastSync', value: '2024-01-01T10:00:00Z' },
  ])
  await testInstance.db.insert(schema.syncLogs).values([
    { id: `log-${userId}`, userId, startedAt: '2024-01-01T10:00:00Z', status: 'completed' },
  ])
  await testInstance.db.insert(schema.oauthTokens).values([
    { userId, username: 'test', accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3600000 },
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
    const bookmarks = await testInstance.db.select().from(schema.bookmarks).where(eq(schema.bookmarks.userId, USER_A))
    const tags = await testInstance.db.select().from(schema.bookmarkTags).where(eq(schema.bookmarkTags.userId, USER_A))
    const media = await testInstance.db.select().from(schema.bookmarkMedia).where(eq(schema.bookmarkMedia.userId, USER_A))
    const links = await testInstance.db.select().from(schema.bookmarkLinks).where(eq(schema.bookmarkLinks.userId, USER_A))
    const readStatuses = await testInstance.db.select().from(schema.readStatus).where(eq(schema.readStatus.userId, USER_A))
    const prefs = await testInstance.db.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, USER_A))
    const syncStates = await testInstance.db.select().from(schema.syncState).where(eq(schema.syncState.userId, USER_A))
    const syncLogs = await testInstance.db.select().from(schema.syncLogs).where(eq(schema.syncLogs.userId, USER_A))

    expect(bookmarks).toHaveLength(0)
    expect(tags).toHaveLength(0)
    expect(media).toHaveLength(0)
    expect(links).toHaveLength(0)
    expect(readStatuses).toHaveLength(0)
    expect(prefs).toHaveLength(0)
    expect(syncStates).toHaveLength(0)
    expect(syncLogs).toHaveLength(0)

    // OAuth token should still exist
    const oauth = await testInstance.db.select().from(schema.oauthTokens).where(eq(schema.oauthTokens.userId, USER_A))
    expect(oauth).toHaveLength(1)
  })

  it('does not affect other user\'s data', async () => {
    const { POST } = await import('@/app/api/account/clear/route')
    await POST()

    // Verify User B's data is intact
    const bookmarks = await testInstance.db.select().from(schema.bookmarks).where(eq(schema.bookmarks.userId, USER_B))
    const tags = await testInstance.db.select().from(schema.bookmarkTags).where(eq(schema.bookmarkTags.userId, USER_B))
    const media = await testInstance.db.select().from(schema.bookmarkMedia).where(eq(schema.bookmarkMedia.userId, USER_B))
    const readStatuses = await testInstance.db.select().from(schema.readStatus).where(eq(schema.readStatus.userId, USER_B))
    const oauth = await testInstance.db.select().from(schema.oauthTokens).where(eq(schema.oauthTokens.userId, USER_B))

    expect(bookmarks).toHaveLength(2)
    expect(tags).toHaveLength(1)
    expect(media).toHaveLength(1)
    expect(readStatuses).toHaveLength(1)
    expect(oauth).toHaveLength(1)
  })
})

describe('API: /api/account', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    mockUserId = USER_A
    vi.clearAllMocks()

    await seedUserData(USER_A)
    await seedUserData(USER_B)
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

  it('deletes all user data including OAuth tokens', async () => {
    const { DELETE } = await import('@/app/api/account/route')
    const response = await DELETE()

    expect(response.status).toBe(200)

    // Verify User A's data is completely deleted
    const bookmarks = await testInstance.db.select().from(schema.bookmarks).where(eq(schema.bookmarks.userId, USER_A))
    const oauth = await testInstance.db.select().from(schema.oauthTokens).where(eq(schema.oauthTokens.userId, USER_A))

    expect(bookmarks).toHaveLength(0)
    expect(oauth).toHaveLength(0)
  })

  it('does not affect other user\'s data', async () => {
    const { DELETE } = await import('@/app/api/account/route')
    await DELETE()

    // Verify User B's data is intact
    const bookmarks = await testInstance.db.select().from(schema.bookmarks).where(eq(schema.bookmarks.userId, USER_B))
    const oauth = await testInstance.db.select().from(schema.oauthTokens).where(eq(schema.oauthTokens.userId, USER_B))

    expect(bookmarks).toHaveLength(2)
    expect(oauth).toHaveLength(1)
  })
})
