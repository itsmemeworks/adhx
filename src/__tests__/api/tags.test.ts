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

    // Seed oauth tokens for username lookup
    await testInstance.db.insert(schema.oauthTokens).values({
      userId: USER_A,
      username: 'usera',
      accessToken: 'token-a',
      refreshToken: 'refresh-a',
      expiresAt: Date.now() + 7200000,
    })
    await testInstance.db.insert(schema.oauthTokens).values({
      userId: USER_B,
      username: 'userb',
      accessToken: 'token-b',
      refreshToken: 'refresh-b',
      expiresAt: Date.now() + 7200000,
    })

    // Seed bookmarks
    await testInstance.db
      .insert(schema.bookmarks)
      .values([
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

    it('returns tags with counts and share info, sorted by count descending', async () => {
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
        {
          tag: 'work',
          count: 3,
          isPublic: false,
          shareUrl: null,
          viewCount: 0,
          cloneCount: 0,
          rank: null,
        },
        {
          tag: 'important',
          count: 2,
          isPublic: false,
          shareUrl: null,
          viewCount: 0,
          cloneCount: 0,
          rank: null,
        },
        {
          tag: 'later',
          count: 1,
          isPublic: false,
          shareUrl: null,
          viewCount: 0,
          cloneCount: 0,
          rank: null,
        },
      ])
      expect(data.stats).toEqual({ viewCount: 0, cloneCount: 0, bestRank: null })
    })

    it("only returns current user's tags", async () => {
      // User A tags
      await testInstance.db
        .insert(schema.bookmarkTags)
        .values([{ userId: USER_A, bookmarkId: 't1', tag: 'usera' }])

      // User B bookmarks and tags
      await testInstance.db
        .insert(schema.bookmarks)
        .values([createTestBookmark(USER_B, 't1'), createTestBookmark(USER_B, 't2')])
      await testInstance.db.insert(schema.bookmarkTags).values([
        { userId: USER_B, bookmarkId: 't1', tag: 'userb' },
        { userId: USER_B, bookmarkId: 't2', tag: 'userb' },
      ])

      const { GET } = await import('@/app/api/tags/route')
      const response = await GET()
      const data = await response.json()

      expect(data.tags).toEqual([
        {
          tag: 'usera',
          count: 1,
          isPublic: false,
          shareUrl: null,
          viewCount: 0,
          cloneCount: 0,
          rank: null,
        },
      ])
    })

    it('includes discovery view/clone/rank stats for a public tag', async () => {
      await testInstance.db
        .insert(schema.bookmarkTags)
        .values([{ userId: USER_A, bookmarkId: 't1', tag: 'popular' }])
      await testInstance.db.insert(schema.tagShares).values({
        userId: USER_A,
        tag: 'popular',
        shareCode: 'code-popular',
        isPublic: true,
        createdAt: new Date().toISOString(),
      })
      const now = new Date().toISOString()
      await testInstance.db.insert(schema.collectionEvents).values([
        { action: 'view', ownerUserId: USER_A, tag: 'popular', createdAt: now },
        { action: 'view', ownerUserId: USER_A, tag: 'popular', createdAt: now },
        { action: 'clone', ownerUserId: USER_A, tag: 'popular', createdAt: now },
      ])

      const { GET } = await import('@/app/api/tags/route')
      const response = await GET()
      const data = await response.json()

      const popular = data.tags.find((t: { tag: string }) => t.tag === 'popular')
      expect(popular.viewCount).toBe(2)
      expect(popular.cloneCount).toBe(1)
      // Sole public tag on the board this week -> charts at #1.
      expect(popular.rank).toBe(1)
      expect(data.stats).toEqual({ viewCount: 2, cloneCount: 1, bestRank: 1 })
    })

    it("zeros a tag's public-facing stats once it is private, even with historical events", async () => {
      await testInstance.db
        .insert(schema.bookmarkTags)
        .values([{ userId: USER_A, bookmarkId: 't1', tag: 'wasPublic' }])
      await testInstance.db.insert(schema.tagShares).values({
        userId: USER_A,
        tag: 'wasPublic',
        shareCode: 'code-wasPublic',
        isPublic: false,
        createdAt: new Date().toISOString(),
      })
      // Historical events recorded back when the tag was public.
      await testInstance.db.insert(schema.collectionEvents).values([
        {
          action: 'view',
          ownerUserId: USER_A,
          tag: 'wasPublic',
          createdAt: new Date().toISOString(),
        },
        {
          action: 'clone',
          ownerUserId: USER_A,
          tag: 'wasPublic',
          createdAt: new Date().toISOString(),
        },
      ])

      const { GET } = await import('@/app/api/tags/route')
      const response = await GET()
      const data = await response.json()

      const tag = data.tags.find((t: { tag: string }) => t.tag === 'wasPublic')
      expect(tag.isPublic).toBe(false)
      expect(tag.viewCount).toBe(0)
      expect(tag.cloneCount).toBe(0)
      expect(tag.rank).toBeNull()
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
      const remaining = await testInstance.db
        .select()
        .from(schema.bookmarkTags)
        .where(eq(schema.bookmarkTags.userId, USER_A))

      expect(remaining).toHaveLength(1)
      expect(remaining[0].tag).toBe('keep')
    })

    it("does not affect another user's tags", async () => {
      // User B has the same tag
      await testInstance.db.insert(schema.bookmarks).values([createTestBookmark(USER_B, 't1')])
      await testInstance.db
        .insert(schema.bookmarkTags)
        .values([{ userId: USER_B, bookmarkId: 't1', tag: 'toremove' }])

      const { DELETE } = await import('@/app/api/tags/route')
      await DELETE(createRequest('DELETE', { tag: 'toremove' }))

      // User B's tag should still exist
      const userBTags = await testInstance.db
        .select()
        .from(schema.bookmarkTags)
        .where(eq(schema.bookmarkTags.userId, USER_B))

      expect(userBTags).toHaveLength(1)
      expect(userBTags[0].tag).toBe('toremove')
    })
  })
})
