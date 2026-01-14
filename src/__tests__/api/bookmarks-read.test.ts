import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq, and } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/bookmarks/[id]/read
 *
 * Tests POST (mark as read) and DELETE (mark as unread) operations.
 * Verifies multi-user isolation for read status.
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
    bookmarkReadToggled: vi.fn(),
  },
}))

function createRequest(method: string, body?: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/bookmarks/tweet-1/read', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('API: /api/bookmarks/[id]/read', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    mockUserId = USER_A
    vi.clearAllMocks()

    // Create test bookmark
    await testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, 'tweet-1'))
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('POST /api/bookmarks/[id]/read', () => {
    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { POST } = await import('@/app/api/bookmarks/[id]/read/route')
      const response = await POST(createRequest('POST'), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(401)
    })

    it('returns 404 for non-existent bookmark', async () => {
      const { POST } = await import('@/app/api/bookmarks/[id]/read/route')
      const response = await POST(createRequest('POST'), {
        params: Promise.resolve({ id: 'nonexistent' }),
      })

      expect(response.status).toBe(404)
    })

    it('marks bookmark as read', async () => {
      const { POST } = await import('@/app/api/bookmarks/[id]/read/route')
      const response = await POST(createRequest('POST'), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.isRead).toBe(true)
      expect(data.readAt).toBeDefined()

      // Verify in database
      const [status] = await testInstance.db
        .select()
        .from(schema.readStatus)
        .where(and(eq(schema.readStatus.userId, USER_A), eq(schema.readStatus.bookmarkId, 'tweet-1')))

      expect(status).toBeDefined()
    })

    it('returns existing read status if already read', async () => {
      const existingReadAt = '2024-01-15T10:00:00Z'
      await testInstance.db.insert(schema.readStatus).values({
        userId: USER_A,
        bookmarkId: 'tweet-1',
        readAt: existingReadAt,
      })

      const { POST } = await import('@/app/api/bookmarks/[id]/read/route')
      const response = await POST(createRequest('POST'), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.readAt).toBe(existingReadAt)
    })

    it('does not mark another user\'s bookmark as read', async () => {
      // Create User B's bookmark
      await testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_B, 'tweet-b'))

      const { POST } = await import('@/app/api/bookmarks/[id]/read/route')
      const response = await POST(createRequest('POST'), {
        params: Promise.resolve({ id: 'tweet-b' }),
      })

      expect(response.status).toBe(404)
    })
  })

  describe('DELETE /api/bookmarks/[id]/read', () => {
    beforeEach(async () => {
      await testInstance.db.insert(schema.readStatus).values({
        userId: USER_A,
        bookmarkId: 'tweet-1',
        readAt: new Date().toISOString(),
      })
    })

    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { DELETE } = await import('@/app/api/bookmarks/[id]/read/route')
      const response = await DELETE(createRequest('DELETE'), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(401)
    })

    it('marks bookmark as unread', async () => {
      const { DELETE } = await import('@/app/api/bookmarks/[id]/read/route')
      const response = await DELETE(createRequest('DELETE'), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.isRead).toBe(false)
      expect(data.readAt).toBeNull()

      // Verify deleted from database
      const result = await testInstance.db
        .select()
        .from(schema.readStatus)
        .where(and(eq(schema.readStatus.userId, USER_A), eq(schema.readStatus.bookmarkId, 'tweet-1')))

      expect(result).toHaveLength(0)
    })

    it('does not affect another user\'s read status', async () => {
      // Create User B's bookmark and read status
      await testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_B, 'tweet-1'))
      await testInstance.db.insert(schema.readStatus).values({
        userId: USER_B,
        bookmarkId: 'tweet-1',
        readAt: new Date().toISOString(),
      })

      // User A marks their copy as unread
      const { DELETE } = await import('@/app/api/bookmarks/[id]/read/route')
      await DELETE(createRequest('DELETE'), {
        params: Promise.resolve({ id: 'tweet-1' }),
      })

      // User B's read status should still exist
      const userBStatus = await testInstance.db
        .select()
        .from(schema.readStatus)
        .where(eq(schema.readStatus.userId, USER_B))

      expect(userBStatus).toHaveLength(1)
    })
  })
})
