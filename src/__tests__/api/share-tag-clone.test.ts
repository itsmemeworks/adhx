import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance, USER_A, USER_B, createTestBookmark } from './setup'
import { eq, and } from 'drizzle-orm'

/**
 * API Route Tests: /api/share/tag/[code]/clone
 *
 * Tests cloning shared tag collections to a user's account.
 * Validates authentication, duplicate handling, transaction safety, and size limits.
 */

let testInstance: TestDbInstance
let mockUserId: string | null = USER_A

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
}))

function createRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/share/tag/test-code/clone', {
    method: 'POST',
  })
}

describe('API: /api/share/tag/[code]/clone', () => {
  beforeEach(() => {
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

      const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
      const response = await POST(createRequest(), { params: Promise.resolve({ code: 'test-code' }) })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Share validation', () => {
    it('returns 404 for invalid share code', async () => {
      const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
      const response = await POST(createRequest(), { params: Promise.resolve({ code: 'nonexistent' }) })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain('not found')
    })

    it('returns 404 for private (non-public) tag share', async () => {
      // Create a private tag share
      await testInstance.db.insert(schema.tagShares).values({
        userId: USER_B,
        tag: 'private-tag',
        shareCode: 'private-code',
        isPublic: false,
      })

      const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
      const response = await POST(createRequest(), { params: Promise.resolve({ code: 'private-code' }) })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain('not found')
    })
  })

  describe('Cloning bookmarks', () => {
    beforeEach(async () => {
      // Setup: USER_B has a public shared tag with bookmarks
      await testInstance.db.insert(schema.tagShares).values({
        userId: USER_B,
        tag: 'cool-stuff',
        shareCode: 'share123',
        isPublic: true,
      })

      // Create bookmarks owned by USER_B
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_B, 'tweet-1', { text: 'First tweet', author: 'author1' }),
        createTestBookmark(USER_B, 'tweet-2', { text: 'Second tweet', author: 'author2' }),
        createTestBookmark(USER_B, 'tweet-3', { text: 'Third tweet', author: 'author3' }),
      ])

      // Tag those bookmarks
      await testInstance.db.insert(schema.bookmarkTags).values([
        { userId: USER_B, bookmarkId: 'tweet-1', tag: 'cool-stuff' },
        { userId: USER_B, bookmarkId: 'tweet-2', tag: 'cool-stuff' },
        { userId: USER_B, bookmarkId: 'tweet-3', tag: 'cool-stuff' },
      ])
    })

    it('clones all bookmarks from shared tag to user account', async () => {
      const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
      const response = await POST(createRequest(), { params: Promise.resolve({ code: 'share123' }) })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.cloned).toBe(3)
      expect(data.skipped).toBe(0)
      expect(data.total).toBe(3)
      expect(data.tag).toBe('cool-stuff')

      // Verify bookmarks were created for USER_A
      const clonedBookmarks = await testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(eq(schema.bookmarks.userId, USER_A))

      expect(clonedBookmarks).toHaveLength(3)
      expect(clonedBookmarks.map((b) => b.id).sort()).toEqual(['tweet-1', 'tweet-2', 'tweet-3'])
    })

    it('marks cloned bookmarks with source "cloned"', async () => {
      const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
      await POST(createRequest(), { params: Promise.resolve({ code: 'share123' }) })

      const clonedBookmarks = await testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(eq(schema.bookmarks.userId, USER_A))

      for (const bookmark of clonedBookmarks) {
        expect(bookmark.source).toBe('cloned')
      }
    })

    it('applies the tag to cloned bookmarks', async () => {
      const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
      await POST(createRequest(), { params: Promise.resolve({ code: 'share123' }) })

      const clonedTags = await testInstance.db
        .select()
        .from(schema.bookmarkTags)
        .where(eq(schema.bookmarkTags.userId, USER_A))

      expect(clonedTags).toHaveLength(3)
      for (const tag of clonedTags) {
        expect(tag.tag).toBe('cool-stuff')
      }
    })

    it('skips bookmarks user already has', async () => {
      // USER_A already has tweet-1
      await testInstance.db.insert(schema.bookmarks).values(
        createTestBookmark(USER_A, 'tweet-1', { text: 'My existing bookmark' })
      )

      const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
      const response = await POST(createRequest(), { params: Promise.resolve({ code: 'share123' }) })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.cloned).toBe(2) // Only tweet-2 and tweet-3
      expect(data.skipped).toBe(1) // tweet-1 was skipped
      expect(data.total).toBe(3)

      // Verify USER_A's original bookmark text was preserved
      const [existingBookmark] = await testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(and(eq(schema.bookmarks.userId, USER_A), eq(schema.bookmarks.id, 'tweet-1')))

      expect(existingBookmark.text).toBe('My existing bookmark')
    })

    it('handles empty tag (no bookmarks) gracefully', async () => {
      // Create a share for an empty tag
      await testInstance.db.insert(schema.tagShares).values({
        userId: USER_B,
        tag: 'empty-tag',
        shareCode: 'empty123',
        isPublic: true,
      })

      const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
      const response = await POST(createRequest(), { params: Promise.resolve({ code: 'empty123' }) })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.cloned).toBe(0)
      expect(data.skipped).toBe(0)
      expect(data.total).toBe(0)
    })
  })

  describe('Media cloning', () => {
    beforeEach(async () => {
      // Setup shared tag with media
      await testInstance.db.insert(schema.tagShares).values({
        userId: USER_B,
        tag: 'media-tag',
        shareCode: 'media123',
        isPublic: true,
      })

      await testInstance.db.insert(schema.bookmarks).values(
        createTestBookmark(USER_B, 'media-tweet', { category: 'video' })
      )

      await testInstance.db.insert(schema.bookmarkMedia).values([
        {
          id: 'media-1',
          userId: USER_B,
          bookmarkId: 'media-tweet',
          mediaType: 'video',
          originalUrl: 'https://video.twimg.com/video1.mp4',
          previewUrl: 'https://pbs.twimg.com/preview1.jpg',
          width: 1920,
          height: 1080,
          durationMs: 30000,
        },
        {
          id: 'media-2',
          userId: USER_B,
          bookmarkId: 'media-tweet',
          mediaType: 'photo',
          originalUrl: 'https://pbs.twimg.com/photo1.jpg',
          width: 1200,
          height: 800,
        },
      ])

      await testInstance.db.insert(schema.bookmarkTags).values({
        userId: USER_B,
        bookmarkId: 'media-tweet',
        tag: 'media-tag',
      })
    })

    it('clones media along with bookmarks', async () => {
      const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
      const response = await POST(createRequest(), { params: Promise.resolve({ code: 'media123' }) })

      expect(response.status).toBe(200)

      // Verify media was cloned
      const clonedMedia = await testInstance.db
        .select()
        .from(schema.bookmarkMedia)
        .where(eq(schema.bookmarkMedia.userId, USER_A))

      expect(clonedMedia).toHaveLength(2)
      expect(clonedMedia.find((m) => m.id === 'media-1')).toBeTruthy()
      expect(clonedMedia.find((m) => m.id === 'media-2')).toBeTruthy()
    })

    it('preserves media metadata during clone', async () => {
      const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
      await POST(createRequest(), { params: Promise.resolve({ code: 'media123' }) })

      const [videoMedia] = await testInstance.db
        .select()
        .from(schema.bookmarkMedia)
        .where(and(eq(schema.bookmarkMedia.userId, USER_A), eq(schema.bookmarkMedia.id, 'media-1')))

      expect(videoMedia.mediaType).toBe('video')
      expect(videoMedia.width).toBe(1920)
      expect(videoMedia.height).toBe(1080)
      expect(videoMedia.durationMs).toBe(30000)
      expect(videoMedia.originalUrl).toBe('https://video.twimg.com/video1.mp4')
      expect(videoMedia.previewUrl).toBe('https://pbs.twimg.com/preview1.jpg')
    })
  })

  describe('Size limit enforcement', () => {
    it('returns 400 when tag has more than 100 bookmarks', async () => {
      // Create a tag with 101 bookmarks
      await testInstance.db.insert(schema.tagShares).values({
        userId: USER_B,
        tag: 'huge-tag',
        shareCode: 'huge123',
        isPublic: true,
      })

      const bookmarks = Array.from({ length: 101 }, (_, i) =>
        createTestBookmark(USER_B, `tweet-${i}`)
      )
      await testInstance.db.insert(schema.bookmarks).values(bookmarks)

      const tags = Array.from({ length: 101 }, (_, i) => ({
        userId: USER_B,
        bookmarkId: `tweet-${i}`,
        tag: 'huge-tag',
      }))
      await testInstance.db.insert(schema.bookmarkTags).values(tags)

      const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
      const response = await POST(createRequest(), { params: Promise.resolve({ code: 'huge123' }) })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('100')
    })

    it('allows cloning exactly 100 bookmarks', async () => {
      // Create a tag with exactly 100 bookmarks
      await testInstance.db.insert(schema.tagShares).values({
        userId: USER_B,
        tag: 'max-tag',
        shareCode: 'max123',
        isPublic: true,
      })

      const bookmarks = Array.from({ length: 100 }, (_, i) =>
        createTestBookmark(USER_B, `tweet-${i}`)
      )
      await testInstance.db.insert(schema.bookmarks).values(bookmarks)

      const tags = Array.from({ length: 100 }, (_, i) => ({
        userId: USER_B,
        bookmarkId: `tweet-${i}`,
        tag: 'max-tag',
      }))
      await testInstance.db.insert(schema.bookmarkTags).values(tags)

      const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
      const response = await POST(createRequest(), { params: Promise.resolve({ code: 'max123' }) })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.cloned).toBe(100)
    })
  })

  describe('Multi-user isolation', () => {
    it('does not expose bookmarks to other users until cloned', async () => {
      // Setup USER_B's shared tag
      await testInstance.db.insert(schema.tagShares).values({
        userId: USER_B,
        tag: 'shared',
        shareCode: 'shared123',
        isPublic: true,
      })

      await testInstance.db.insert(schema.bookmarks).values(
        createTestBookmark(USER_B, 'private-tweet', { text: 'Secret content' })
      )

      await testInstance.db.insert(schema.bookmarkTags).values({
        userId: USER_B,
        bookmarkId: 'private-tweet',
        tag: 'shared',
      })

      // Before clone: USER_A should have no bookmarks
      const beforeClone = await testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(eq(schema.bookmarks.userId, USER_A))

      expect(beforeClone).toHaveLength(0)

      // Clone
      const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
      await POST(createRequest(), { params: Promise.resolve({ code: 'shared123' }) })

      // After clone: USER_A has their own copy
      const afterClone = await testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(eq(schema.bookmarks.userId, USER_A))

      expect(afterClone).toHaveLength(1)

      // USER_B's bookmark is unchanged
      const userBBookmarks = await testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(eq(schema.bookmarks.userId, USER_B))

      expect(userBBookmarks).toHaveLength(1)
    })
  })
})
