import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/stats
 *
 * Tests the stats endpoint that returns dashboard metrics.
 * Verifies multi-user isolation for bookmark counts.
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
}))

describe('API: /api/stats', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = USER_A
    vi.clearAllMocks()
  })

  afterEach(() => {
    testInstance.close()
  })

  it('returns 401 when not authenticated', async () => {
    mockUserId = null

    const { GET } = await import('@/app/api/stats/route')
    const response = await GET()

    expect(response.status).toBe(401)
  })

  it('returns zero stats for new user', async () => {
    const { GET } = await import('@/app/api/stats/route')
    const response = await GET()

    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data.total).toBe(0)
    expect(data.read).toBe(0)
    expect(data.unread).toBe(0)
    expect(data.withMedia).toBe(0)
    expect(data.needsTranscript).toBe(0)
    expect(data.manual).toBe(0)
    expect(data.categories).toEqual({})
  })

  it('returns correct bookmark counts', async () => {
    // Add 5 bookmarks with different categories
    await testInstance.db.insert(schema.bookmarks).values([
      createTestBookmark(USER_A, 't1', { category: 'tweet' }),
      createTestBookmark(USER_A, 't2', { category: 'tweet' }),
      createTestBookmark(USER_A, 't3', { category: 'github' }),
      createTestBookmark(USER_A, 't4', { category: 'article' }),
      createTestBookmark(USER_A, 't5', { category: 'tweet' }),
    ])

    const { GET } = await import('@/app/api/stats/route')
    const response = await GET()

    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data.total).toBe(5)
    expect(data.categories).toEqual({
      tweet: 3,
      github: 1,
      article: 1,
    })
  })

  it('calculates read/unread correctly', async () => {
    // Add 5 bookmarks
    await testInstance.db.insert(schema.bookmarks).values([
      createTestBookmark(USER_A, 't1'),
      createTestBookmark(USER_A, 't2'),
      createTestBookmark(USER_A, 't3'),
      createTestBookmark(USER_A, 't4'),
      createTestBookmark(USER_A, 't5'),
    ])

    // Mark 2 as read
    await testInstance.db.insert(schema.readStatus).values([
      { userId: USER_A, bookmarkId: 't1', readAt: '2024-01-01T10:00:00Z' },
      { userId: USER_A, bookmarkId: 't2', readAt: '2024-01-01T10:00:00Z' },
    ])

    const { GET } = await import('@/app/api/stats/route')
    const response = await GET()
    const data = await response.json()

    expect(data.total).toBe(5)
    expect(data.read).toBe(2)
    expect(data.unread).toBe(3)
  })

  it('counts bookmarks with media', async () => {
    await testInstance.db.insert(schema.bookmarks).values([
      createTestBookmark(USER_A, 't1'),
      createTestBookmark(USER_A, 't2'),
      createTestBookmark(USER_A, 't3'),
    ])

    // Add media to 2 bookmarks
    await testInstance.db.insert(schema.bookmarkMedia).values([
      { id: 'm1', userId: USER_A, bookmarkId: 't1', mediaType: 'photo', originalUrl: 'u' },
      { id: 'm2', userId: USER_A, bookmarkId: 't1', mediaType: 'photo', originalUrl: 'u' }, // Same bookmark
      { id: 'm3', userId: USER_A, bookmarkId: 't2', mediaType: 'video', originalUrl: 'u' },
    ])

    const { GET } = await import('@/app/api/stats/route')
    const response = await GET()
    const data = await response.json()

    expect(data.withMedia).toBe(2) // Distinct bookmarks with media
  })

  it('counts bookmarks needing transcript', async () => {
    await testInstance.db.insert(schema.bookmarks).values([
      createTestBookmark(USER_A, 't1', { needsTranscript: true }),
      createTestBookmark(USER_A, 't2', { needsTranscript: true }),
      createTestBookmark(USER_A, 't3', { needsTranscript: false }),
    ])

    const { GET } = await import('@/app/api/stats/route')
    const response = await GET()
    const data = await response.json()

    expect(data.needsTranscript).toBe(2)
  })

  it('isolates stats between users', async () => {
    // User A: 3 bookmarks, 1 read
    await testInstance.db.insert(schema.bookmarks).values([
      createTestBookmark(USER_A, 't1'),
      createTestBookmark(USER_A, 't2'),
      createTestBookmark(USER_A, 't3'),
    ])
    await testInstance.db.insert(schema.readStatus).values([
      { userId: USER_A, bookmarkId: 't1', readAt: '2024-01-01T10:00:00Z' },
    ])

    // User B: 5 bookmarks, 3 read
    await testInstance.db.insert(schema.bookmarks).values([
      createTestBookmark(USER_B, 't1'),
      createTestBookmark(USER_B, 't2'),
      createTestBookmark(USER_B, 't3'),
      createTestBookmark(USER_B, 't4'),
      createTestBookmark(USER_B, 't5'),
    ])
    await testInstance.db.insert(schema.readStatus).values([
      { userId: USER_B, bookmarkId: 't1', readAt: '2024-01-01T10:00:00Z' },
      { userId: USER_B, bookmarkId: 't2', readAt: '2024-01-01T10:00:00Z' },
      { userId: USER_B, bookmarkId: 't3', readAt: '2024-01-01T10:00:00Z' },
    ])

    // User A stats
    mockUserId = USER_A
    const { GET } = await import('@/app/api/stats/route')
    const responseA = await GET()
    const dataA = await responseA.json()

    expect(dataA.total).toBe(3)
    expect(dataA.read).toBe(1)
    expect(dataA.unread).toBe(2)

    // User B stats
    mockUserId = USER_B
    const responseB = await GET()
    const dataB = await responseB.json()

    expect(dataB.total).toBe(5)
    expect(dataB.read).toBe(3)
    expect(dataB.unread).toBe(2)
  })

  // =========================================
  // Source/Manual Count Tests
  // =========================================
  describe('manual bookmark counts', () => {
    it('counts manually added bookmarks', async () => {
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 't1', { source: 'manual' }),
        createTestBookmark(USER_A, 't2', { source: 'manual' }),
        createTestBookmark(USER_A, 't3', { source: 'sync' }),
      ])

      const { GET } = await import('@/app/api/stats/route')
      const response = await GET()
      const data = await response.json()

      expect(data.total).toBe(3)
      expect(data.manual).toBe(2)
    })

    it('counts url_prefix as manual additions', async () => {
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 't1', { source: 'url_prefix' }),
        createTestBookmark(USER_A, 't2', { source: 'url_prefix' }),
        createTestBookmark(USER_A, 't3', { source: 'manual' }),
        createTestBookmark(USER_A, 't4', { source: 'sync' }),
      ])

      const { GET } = await import('@/app/api/stats/route')
      const response = await GET()
      const data = await response.json()

      expect(data.total).toBe(4)
      expect(data.manual).toBe(3) // 2 url_prefix + 1 manual
    })

    it('does not count synced bookmarks as manual', async () => {
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 't1', { source: 'sync' }),
        createTestBookmark(USER_A, 't2', { source: 'sync' }),
        createTestBookmark(USER_A, 't3'), // defaults to 'sync'
      ])

      const { GET } = await import('@/app/api/stats/route')
      const response = await GET()
      const data = await response.json()

      expect(data.total).toBe(3)
      expect(data.manual).toBe(0)
    })

    it('isolates manual counts between users', async () => {
      // User A: 2 manual, 1 sync
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 't1', { source: 'manual' }),
        createTestBookmark(USER_A, 't2', { source: 'url_prefix' }),
        createTestBookmark(USER_A, 't3', { source: 'sync' }),
      ])

      // User B: 1 manual, 3 sync
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_B, 't1', { source: 'manual' }),
        createTestBookmark(USER_B, 't2', { source: 'sync' }),
        createTestBookmark(USER_B, 't3', { source: 'sync' }),
        createTestBookmark(USER_B, 't4', { source: 'sync' }),
      ])

      // User A stats
      mockUserId = USER_A
      const { GET } = await import('@/app/api/stats/route')
      const responseA = await GET()
      const dataA = await responseA.json()

      expect(dataA.total).toBe(3)
      expect(dataA.manual).toBe(2)

      // User B stats
      mockUserId = USER_B
      const responseB = await GET()
      const dataB = await responseB.json()

      expect(dataB.total).toBe(4)
      expect(dataB.manual).toBe(1)
    })
  })
})
