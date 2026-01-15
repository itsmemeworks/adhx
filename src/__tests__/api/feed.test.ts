import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/feed
 *
 * Tests the unified feed endpoint with filtering, pagination, and multi-user isolation.
 * Verifies tag filtering with SQL GROUP BY/HAVING optimization.
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

vi.mock('@/lib/sentry', () => ({
  metrics: {
    feedLoaded: vi.fn(),
    feedSearched: vi.fn(),
    feedFiltered: vi.fn(),
    trackUser: vi.fn(),
  },
}))

function createRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/feed')
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, v))
    } else {
      url.searchParams.set(key, value)
    }
  })
  return new NextRequest(url)
}

describe('API: /api/feed', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    mockUserId = USER_A
    vi.clearAllMocks()
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest())

      expect(response.status).toBe(401)
    })
  })

  describe('Multi-user isolation', () => {
    it('only returns bookmarks for current user', async () => {
      // Create bookmarks for both users
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 'tweet-a1'),
        createTestBookmark(USER_A, 'tweet-a2'),
        createTestBookmark(USER_B, 'tweet-b1'),
      ])

      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ unreadOnly: 'false' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      // Should only return User A's bookmarks
      expect(data.items).toHaveLength(2)
      expect(data.items.map((i: { id: string }) => i.id).sort()).toEqual(['tweet-a1', 'tweet-a2'])
    })

    it('does not leak read status between users', async () => {
      // Create same bookmark for both users
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 'tweet-1'),
        createTestBookmark(USER_B, 'tweet-1'),
      ])

      // Mark as read for User B only
      await testInstance.db.insert(schema.readStatus).values({
        userId: USER_B,
        bookmarkId: 'tweet-1',
        readAt: new Date().toISOString(),
      })

      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ unreadOnly: 'false' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      // User A's bookmark should show as unread
      expect(data.items[0].isRead).toBe(false)
    })
  })

  describe('Tag filtering', () => {
    beforeEach(async () => {
      // Create bookmarks with tags
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 'tweet-1'),
        createTestBookmark(USER_A, 'tweet-2'),
        createTestBookmark(USER_A, 'tweet-3'),
      ])

      await testInstance.db.insert(schema.bookmarkTags).values([
        { userId: USER_A, bookmarkId: 'tweet-1', tag: 'javascript' },
        { userId: USER_A, bookmarkId: 'tweet-1', tag: 'react' },
        { userId: USER_A, bookmarkId: 'tweet-2', tag: 'javascript' },
        { userId: USER_A, bookmarkId: 'tweet-3', tag: 'python' },
      ])
    })

    it('filters by single tag', async () => {
      const { GET } = await import('@/app/api/feed/route')

      const url = new URL('http://localhost:3000/api/feed')
      url.searchParams.set('unreadOnly', 'false')
      url.searchParams.append('tag', 'javascript')

      const response = await GET(new NextRequest(url))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.items).toHaveLength(2)
      const ids = data.items.map((i: { id: string }) => i.id)
      expect(ids).toContain('tweet-1')
      expect(ids).toContain('tweet-2')
    })

    it('filters by multiple tags (AND logic)', async () => {
      const { GET } = await import('@/app/api/feed/route')

      const url = new URL('http://localhost:3000/api/feed')
      url.searchParams.set('unreadOnly', 'false')
      url.searchParams.append('tag', 'javascript')
      url.searchParams.append('tag', 'react')

      const response = await GET(new NextRequest(url))

      expect(response.status).toBe(200)
      const data = await response.json()

      // Only tweet-1 has both tags
      expect(data.items).toHaveLength(1)
      expect(data.items[0].id).toBe('tweet-1')
    })

    it('returns empty when no bookmarks match all tags', async () => {
      const { GET } = await import('@/app/api/feed/route')

      const url = new URL('http://localhost:3000/api/feed')
      url.searchParams.set('unreadOnly', 'false')
      url.searchParams.append('tag', 'javascript')
      url.searchParams.append('tag', 'python')

      const response = await GET(new NextRequest(url))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.items).toHaveLength(0)
    })

    it('tag filtering is case-insensitive', async () => {
      const { GET } = await import('@/app/api/feed/route')

      const url = new URL('http://localhost:3000/api/feed')
      url.searchParams.set('unreadOnly', 'false')
      url.searchParams.append('tag', 'JAVASCRIPT')

      const response = await GET(new NextRequest(url))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.items).toHaveLength(2)
    })

    it('does not return tags from other users', async () => {
      // Add tag for User B
      await testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_B, 'tweet-b'))
      await testInstance.db.insert(schema.bookmarkTags).values({
        userId: USER_B,
        bookmarkId: 'tweet-b',
        tag: 'javascript',
      })

      const { GET } = await import('@/app/api/feed/route')

      const url = new URL('http://localhost:3000/api/feed')
      url.searchParams.set('unreadOnly', 'false')
      url.searchParams.append('tag', 'javascript')

      const response = await GET(new NextRequest(url))

      expect(response.status).toBe(200)
      const data = await response.json()

      // Should not include User B's bookmark
      expect(data.items).toHaveLength(2)
      expect(data.items.every((i: { id: string }) => i.id !== 'tweet-b')).toBe(true)
    })
  })

  describe('Pagination', () => {
    beforeEach(async () => {
      // Create 15 bookmarks
      const bookmarks = Array.from({ length: 15 }, (_, i) =>
        createTestBookmark(USER_A, `tweet-${i + 1}`, {
          processedAt: new Date(Date.now() - i * 1000).toISOString(), // Different timestamps
        })
      )
      await testInstance.db.insert(schema.bookmarks).values(bookmarks)
    })

    it('returns correct page size', async () => {
      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ limit: '5', unreadOnly: 'false' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.items).toHaveLength(5)
      expect(data.pagination.limit).toBe(5)
      expect(data.pagination.total).toBe(15)
      expect(data.pagination.totalPages).toBe(3)
    })

    it('returns correct page offset', async () => {
      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ page: '2', limit: '5', unreadOnly: 'false' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.items).toHaveLength(5)
      expect(data.pagination.page).toBe(2)
    })
  })

  describe('Unread filter', () => {
    beforeEach(async () => {
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 'tweet-1'),
        createTestBookmark(USER_A, 'tweet-2'),
        createTestBookmark(USER_A, 'tweet-3'),
      ])

      // Mark tweet-1 as read
      await testInstance.db.insert(schema.readStatus).values({
        userId: USER_A,
        bookmarkId: 'tweet-1',
        readAt: new Date().toISOString(),
      })
    })

    it('filters to unread only by default', async () => {
      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest())

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.items).toHaveLength(2)
      expect(data.items.every((i: { isRead: boolean }) => !i.isRead)).toBe(true)
    })

    it('returns all items when unreadOnly is false', async () => {
      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ unreadOnly: 'false' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.items).toHaveLength(3)
    })
  })

  describe('Stats', () => {
    beforeEach(async () => {
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 'tweet-1'),
        createTestBookmark(USER_A, 'tweet-2'),
        createTestBookmark(USER_A, 'tweet-3'),
      ])

      await testInstance.db.insert(schema.readStatus).values({
        userId: USER_A,
        bookmarkId: 'tweet-1',
        readAt: new Date().toISOString(),
      })
    })

    it('returns correct stats', async () => {
      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ unreadOnly: 'false' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.stats.total).toBe(3)
      expect(data.stats.unread).toBe(2)
    })
  })

  describe('Manual filter', () => {
    beforeEach(async () => {
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 'tweet-synced', { source: 'sync' }),
        createTestBookmark(USER_A, 'tweet-manual', { source: 'manual' }),
        createTestBookmark(USER_A, 'tweet-url-prefix', { source: 'url_prefix' }),
      ])
    })

    it('filters by manual source', async () => {
      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ filter: 'manual', unreadOnly: 'false' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.items).toHaveLength(2)
      const ids = data.items.map((i: { id: string }) => i.id)
      expect(ids).toContain('tweet-manual')
      expect(ids).toContain('tweet-url-prefix')
      expect(ids).not.toContain('tweet-synced')
    })

    it('does not include synced bookmarks in manual filter', async () => {
      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ filter: 'manual', unreadOnly: 'false' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.items.every((i: { id: string }) => i.id !== 'tweet-synced')).toBe(true)
    })
  })
})
