import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'
import { eq, and } from 'drizzle-orm'

/**
 * API Route Tests: /api/tweets/add
 *
 * Tests adding tweets by URL, duplicate detection, and category classification.
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

vi.mock('@/lib/sentry', () => ({
  metrics: {
    bookmarkAdded: vi.fn(),
  },
}))

// Mock fetch for FxTwitter API
const mockFetch = vi.fn()
global.fetch = mockFetch

function createRequest(body: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/tweets/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Mock tweet data from FxTwitter
const mockTweetData = {
  tweet: {
    id: '123456789',
    text: 'This is a test tweet with some content',
    created_at: '2024-01-15T12:00:00Z',
    author: {
      screen_name: 'testuser',
      name: 'Test User',
      avatar_url: 'https://pbs.twimg.com/profile/avatar.jpg',
    },
  },
}

const mockTweetWithVideo = {
  tweet: {
    ...mockTweetData.tweet,
    media: {
      videos: [{ url: 'https://video.twimg.com/video.mp4' }],
      all: [{ type: 'video', url: 'https://video.twimg.com/video.mp4' }],
    },
  },
}

const mockTweetWithPhoto = {
  tweet: {
    ...mockTweetData.tweet,
    media: {
      all: [{ type: 'photo', url: 'https://pbs.twimg.com/photo.jpg' }],
    },
  },
}

const mockTweetWithArticle = {
  tweet: {
    ...mockTweetData.tweet,
    article: {
      title: 'Test Article',
      preview_text: 'This is a preview',
      thumbnail_url: 'https://example.com/thumb.jpg',
    },
  },
}

describe('API: /api/tweets/add', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = 'user-123'
    vi.clearAllMocks()
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('Authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://twitter.com/user/status/123' }))

      expect(response.status).toBe(401)
    })
  })

  describe('Input validation', () => {
    it('returns 400 when URL is missing', async () => {
      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({}))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('URL is required')
    })

    it('returns 400 for invalid tweet URL', async () => {
      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://google.com/search' }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid tweet URL')
    })
  })

  describe('URL parsing', () => {
    it('accepts twitter.com URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetData),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://twitter.com/testuser/status/123456789' }))

      expect(response.status).toBe(200)
    })

    it('accepts x.com URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetData),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://x.com/testuser/status/123456789' }))

      expect(response.status).toBe(200)
    })

    it('accepts mobile.twitter.com URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetData),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://mobile.twitter.com/testuser/status/123456789' }))

      expect(response.status).toBe(200)
    })

    it('accepts vxtwitter.com URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetData),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://vxtwitter.com/testuser/status/123456789' }))

      expect(response.status).toBe(200)
    })
  })

  describe('Duplicate detection', () => {
    it('returns isDuplicate when tweet already exists for user', async () => {
      // Insert existing bookmark
      await testInstance.db.insert(schema.bookmarks).values({
        id: '123456789',
        userId: 'user-123',
        author: 'testuser',
        text: 'Existing tweet',
        tweetUrl: 'https://twitter.com/testuser/status/123456789',
        processedAt: new Date().toISOString(),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://twitter.com/testuser/status/123456789' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.isDuplicate).toBe(true)
      expect(data.success).toBe(false)
      expect(data.message).toContain('already in your bookmarks')
    })

    it('allows same tweet for different users', async () => {
      // Insert bookmark for different user
      await testInstance.db.insert(schema.bookmarks).values({
        id: '123456789',
        userId: 'other-user',
        author: 'testuser',
        text: 'Existing tweet',
        tweetUrl: 'https://twitter.com/testuser/status/123456789',
        processedAt: new Date().toISOString(),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetData),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://twitter.com/testuser/status/123456789' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.isDuplicate).toBe(false)
      expect(data.success).toBe(true)
    })
  })

  describe('Category detection', () => {
    it('categorizes video tweets as video', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetWithVideo),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://twitter.com/user/status/123456789' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.bookmark.category).toBe('video')
    })

    it('categorizes photo tweets as photo', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetWithPhoto),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://twitter.com/user/status/123456789' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.bookmark.category).toBe('photo')
    })

    it('categorizes article tweets as article', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetWithArticle),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://twitter.com/user/status/123456789' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.bookmark.category).toBe('article')
    })

    it('categorizes plain text tweets as text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetData),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://twitter.com/user/status/123456789' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.bookmark.category).toBe('text')
    })
  })

  describe('Source tracking', () => {
    it('defaults source to manual', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetData),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      await POST(createRequest({ url: 'https://twitter.com/user/status/123456789' }))

      const [bookmark] = await testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(and(eq(schema.bookmarks.userId, 'user-123'), eq(schema.bookmarks.id, '123456789')))

      expect(bookmark.source).toBe('manual')
    })

    it('accepts url_prefix source', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetData),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      await POST(createRequest({ url: 'https://twitter.com/user/status/123456789', source: 'url_prefix' }))

      const [bookmark] = await testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(and(eq(schema.bookmarks.userId, 'user-123'), eq(schema.bookmarks.id, '123456789')))

      expect(bookmark.source).toBe('url_prefix')
    })
  })

  describe('Media processing', () => {
    it('saves media attachments', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetWithPhoto),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      await POST(createRequest({ url: 'https://twitter.com/user/status/123456789' }))

      const media = await testInstance.db
        .select()
        .from(schema.bookmarkMedia)
        .where(eq(schema.bookmarkMedia.bookmarkId, '123456789'))

      expect(media).toHaveLength(1)
      expect(media[0].mediaType).toBe('photo')
    })
  })

  describe('Error handling', () => {
    it('handles FxTwitter API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://twitter.com/user/status/123456789' }))

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toContain('Failed to fetch tweet')
    })

    it('handles network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://twitter.com/user/status/123456789' }))

      expect(response.status).toBe(500)
    })
  })
})
