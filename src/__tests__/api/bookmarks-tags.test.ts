import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq, and } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/bookmarks/[id]/tags
 *
 * Tests GET, POST, DELETE operations for bookmark tags.
 * Verifies multi-user isolation and tag validation.
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
    bookmarkTagged: vi.fn(),
  },
  captureException: vi.fn(),
}))

function createRequest(method: string, body?: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/bookmarks/tweet-1/tags', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('API: /api/bookmarks/[id]/tags', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    mockUserId = USER_A
    vi.clearAllMocks()

    await testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, 'tweet-1'))
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('GET /api/bookmarks/[id]/tags', () => {
    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { GET } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await GET(createRequest('GET'), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(401)
    })

    it('returns 404 for non-existent bookmark', async () => {
      const { GET } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await GET(createRequest('GET'), {
        params: Promise.resolve({ id: 'nonexistent' }),
      })

      expect(response.status).toBe(404)
    })

    it('returns empty array when no tags', async () => {
      const { GET } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await GET(createRequest('GET'), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.tags).toEqual([])
    })

    it('returns all tags for bookmark', async () => {
      await testInstance.db.insert(schema.bookmarkTags).values([
        { userId: USER_A, bookmarkId: 'tweet-1', tag: 'important' },
        { userId: USER_A, bookmarkId: 'tweet-1', tag: 'work' },
      ])

      const { GET } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await GET(createRequest('GET'), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.tags.sort()).toEqual(['important', 'work'])
    })
  })

  describe('POST /api/bookmarks/[id]/tags', () => {
    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { POST } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await POST(createRequest('POST', { tag: 'test' }), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(401)
    })

    it('returns 400 when tag is missing', async () => {
      const { POST } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await POST(createRequest('POST', {}), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(400)
    })

    it('returns 400 when tag is empty', async () => {
      const { POST } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await POST(createRequest('POST', { tag: '   ' }), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('empty')
    })

    it('truncates tags that exceed max length', async () => {
      const { POST } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await POST(createRequest('POST', { tag: 'verylongtag' }), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      // Tags are now truncated instead of rejected
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.tag).toBe('verylongta') // Truncated to 10 chars
    })

    it('adds tag to bookmark', async () => {
      const { POST } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await POST(createRequest('POST', { tag: 'newtag' }), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.tag).toBe('newtag')

      // Verify in database
      const tags = await testInstance.db.select().from(schema.bookmarkTags).where(
        and(eq(schema.bookmarkTags.userId, USER_A), eq(schema.bookmarkTags.bookmarkId, 'tweet-1'))
      )
      expect(tags).toHaveLength(1)
      expect(tags[0].tag).toBe('newtag')
    })

    it('normalizes tag to lowercase', async () => {
      const { POST } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await POST(createRequest('POST', { tag: 'UpperCase' }), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.tag).toBe('uppercase')
    })

    it('handles duplicate tag gracefully', async () => {
      await testInstance.db.insert(schema.bookmarkTags).values({
        userId: USER_A,
        bookmarkId: 'tweet-1',
        tag: 'existing',
      })

      const { POST } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await POST(createRequest('POST', { tag: 'existing' }), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('DELETE /api/bookmarks/[id]/tags', () => {
    beforeEach(async () => {
      await testInstance.db.insert(schema.bookmarkTags).values({
        userId: USER_A,
        bookmarkId: 'tweet-1',
        tag: 'totag',
      })
    })

    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { DELETE } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await DELETE(createRequest('DELETE', { tag: 'totag' }), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(401)
    })

    it('returns 400 when tag is missing', async () => {
      const { DELETE } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await DELETE(createRequest('DELETE', {}), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(400)
    })

    it('removes tag from bookmark', async () => {
      const { DELETE } = await import('@/app/api/bookmarks/[id]/tags/route')
      const response = await DELETE(createRequest('DELETE', { tag: 'totag' }), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(200)

      const tags = await testInstance.db.select().from(schema.bookmarkTags).where(
        and(eq(schema.bookmarkTags.userId, USER_A), eq(schema.bookmarkTags.bookmarkId, 'tweet-1'))
      )
      expect(tags).toHaveLength(0)
    })

    it('does not affect another user\'s tags', async () => {
      // Add same tag for User B
      await testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_B, 'tweet-1'))
      await testInstance.db.insert(schema.bookmarkTags).values({
        userId: USER_B,
        bookmarkId: 'tweet-1',
        tag: 'totag',
      })

      // User A deletes their tag
      const { DELETE } = await import('@/app/api/bookmarks/[id]/tags/route')
      await DELETE(createRequest('DELETE', { tag: 'totag' }), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      // User B's tag should still exist
      const userBTags = await testInstance.db.select().from(schema.bookmarkTags).where(
        eq(schema.bookmarkTags.userId, USER_B)
      )
      expect(userBTags).toHaveLength(1)
    })
  })
})
