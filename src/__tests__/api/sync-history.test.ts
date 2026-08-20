import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/sync/history
 *
 * Feeds the Settings "Sync history" card: last 5 completed syncs + a
 * running total of the user's bookmarks.
 */

let testInstance: TestDbInstance
let mockUserId: string | null = 'user-123'

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
}))

describe('API: /api/sync/history', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = 'user-123'
    vi.clearAllMocks()
  })

  afterEach(() => {
    testInstance.close()
  })

  it('returns 401 when not authenticated', async () => {
    mockUserId = null

    const { GET } = await import('@/app/api/sync/history/route')
    const response = await GET()

    expect(response.status).toBe(401)
  })

  it('returns an empty history with zero total when the user has never synced', async () => {
    const { GET } = await import('@/app/api/sync/history/route')
    const response = await GET()

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.syncs).toEqual([])
    expect(data.lastSyncAt).toBeNull()
    expect(data.totalBookmarks).toBe(0)
  })

  it('returns syncs newest-first with the expected shape, capped at 5, and the bookmark total', async () => {
    const now = Date.now()
    for (let i = 0; i < 7; i++) {
      const startedAt = new Date(now - i * 60_000).toISOString()
      await testInstance.db.insert(schema.syncLogs).values({
        id: `sync-${i}`,
        userId: 'user-123',
        startedAt,
        completedAt: startedAt,
        status: 'completed',
        totalFetched: 10,
        newBookmarks: i,
        duplicatesSkipped: 1,
        categorized: 10,
      })
    }
    await testInstance.db
      .insert(schema.bookmarks)
      .values([
        createTestBookmark('user-123', 'tweet-1'),
        createTestBookmark('user-123', 'tweet-2'),
        createTestBookmark('user-123', 'tweet-3'),
      ])

    const { GET } = await import('@/app/api/sync/history/route')
    const response = await GET()

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.syncs).toHaveLength(5)
    // Newest first: sync-0 has the most recent startedAt/completedAt
    expect(data.syncs[0]).toMatchObject({
      id: 'sync-0',
      status: 'completed',
      newBookmarks: 0,
      totalFetched: 10,
    })
    expect(data.syncs[0]).toHaveProperty('startedAt')
    expect(data.syncs[0]).toHaveProperty('completedAt')
    expect(data.lastSyncAt).toBe(data.syncs[0].completedAt)
    expect(data.totalBookmarks).toBe(3)
  })

  it('excludes in-progress and failed syncs from history', async () => {
    const startedAt = new Date().toISOString()
    await testInstance.db.insert(schema.syncLogs).values([
      { id: 'sync-in-progress', userId: 'user-123', startedAt, status: 'in_progress' },
      {
        id: 'sync-failed',
        userId: 'user-123',
        startedAt,
        completedAt: startedAt,
        status: 'failed',
        errorMessage: 'boom',
      },
    ])

    const { GET } = await import('@/app/api/sync/history/route')
    const response = await GET()

    const data = await response.json()
    expect(data.syncs).toEqual([])
    expect(data.lastSyncAt).toBeNull()
  })

  it('isolates sync history and bookmark totals between users', async () => {
    const startedAt = new Date().toISOString()
    await testInstance.db.insert(schema.syncLogs).values({
      id: 'sync-other',
      userId: 'other-user',
      startedAt,
      completedAt: startedAt,
      status: 'completed',
      newBookmarks: 42,
    })
    await testInstance.db
      .insert(schema.bookmarks)
      .values(createTestBookmark('other-user', 'other-tweet'))

    const { GET } = await import('@/app/api/sync/history/route')
    const response = await GET()

    const data = await response.json()
    expect(data.syncs).toEqual([])
    expect(data.lastSyncAt).toBeNull()
    expect(data.totalBookmarks).toBe(0)
  })
})
