import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/tags
 *
 * Tests GET (list all tags with counts) and DELETE (remove tag from all bookmarks).
 * Verifies multi-user isolation.
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

function createRequest(method: string, body?: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/tags', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('API: /api/tags', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    mockUserId = USER_A
    vi.clearAllMocks()

    // Seed bookmarks
    await testInstance.db.insert(schema.bookmarks).values([
      createTestBookmark(USER_A, 't1'),
      createTestBookmark(USER_A, 't2'),
      createTestBookmark(USER_A, 't3'),
    ])
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('GET /api/tags', () => {
    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { GET } = await import('@/app/api/tags/route')
      const response = await GET()

      expect(response.status).toBe(401)
    })

    it('returns empty array when no tags', async () => {
      const { GET } = await import('@/app/api/tags/route')
      const response = await GET()

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.tags).toEqual([])
    })

    it('returns tags with counts, sorted by count descending', async () => {
      await testInstance.db.insert(schema.bookmarkTags).values([
        { userId: USER_A, bookmarkId: 't1', tag: 'work' },
        { userId: USER_A, bookmarkId: 't2', tag: 'work' },
        { userId: USER_A, bookmarkId: 't3', tag: 'work' },
        { userId: USER_A, bookmarkId: 't1', tag: 'important' },
        { userId: USER_A, bookmarkId: 't2', tag: 'important' },
        { userId: USER_A, bookmarkId: 't1', tag: 'later' },
      ])

      const { GET } = await import('@/app/api/tags/route')
      const response = await GET()
      const data = await response.json()

      expect(data.tags).toEqual([
        { tag: 'work', count: 3 },
        { tag: 'important', count: 2 },
        { tag: 'later', count: 1 },
      ])
    })

    it('only returns current user\'s tags', async () => {
      // User A tags
      await testInstance.db.insert(schema.bookmarkTags).values([
        { userId: USER_A, bookmarkId: 't1', tag: 'usera' },
      ])

      // User B bookmarks and tags
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_B, 't1'),
        createTestBookmark(USER_B, 't2'),
      ])
      await testInstance.db.insert(schema.bookmarkTags).values([
        { userId: USER_B, bookmarkId: 't1', tag: 'userb' },
        { userId: USER_B, bookmarkId: 't2', tag: 'userb' },
      ])

      const { GET } = await import('@/app/api/tags/route')
      const response = await GET()
      const data = await response.json()

      expect(data.tags).toEqual([{ tag: 'usera', count: 1 }])
    })
  })

  describe('DELETE /api/tags', () => {
    beforeEach(async () => {
      await testInstance.db.insert(schema.bookmarkTags).values([
        { userId: USER_A, bookmarkId: 't1', tag: 'toremove' },
        { userId: USER_A, bookmarkId: 't2', tag: 'toremove' },
        { userId: USER_A, bookmarkId: 't1', tag: 'keep' },
      ])
    })

    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { DELETE } = await import('@/app/api/tags/route')
      const response = await DELETE(createRequest('DELETE', { tag: 'toremove' }))

      expect(response.status).toBe(401)
    })

    it('returns 400 when tag is missing', async () => {
      const { DELETE } = await import('@/app/api/tags/route')
      const response = await DELETE(createRequest('DELETE', {}))

      expect(response.status).toBe(400)
    })

    it('removes tag from all bookmarks', async () => {
      const { DELETE } = await import('@/app/api/tags/route')
      const response = await DELETE(createRequest('DELETE', { tag: 'toremove' }))

      expect(response.status).toBe(200)

      // Verify tag is removed
      const remaining = await testInstance.db.select().from(schema.bookmarkTags).where(
        eq(schema.bookmarkTags.userId, USER_A)
      )

      expect(remaining).toHaveLength(1)
      expect(remaining[0].tag).toBe('keep')
    })

    it('does not affect another user\'s tags', async () => {
      // User B has the same tag
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_B, 't1'),
      ])
      await testInstance.db.insert(schema.bookmarkTags).values([
        { userId: USER_B, bookmarkId: 't1', tag: 'toremove' },
      ])

      const { DELETE } = await import('@/app/api/tags/route')
      await DELETE(createRequest('DELETE', { tag: 'toremove' }))

      // User B's tag should still exist
      const userBTags = await testInstance.db.select().from(schema.bookmarkTags).where(
        eq(schema.bookmarkTags.userId, USER_B)
      )

      expect(userBTags).toHaveLength(1)
      expect(userBTags[0].tag).toBe('toremove')
    })
  })
})
