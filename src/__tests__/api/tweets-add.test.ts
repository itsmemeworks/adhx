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

const mockQuoteTweet = {
  tweet: {
    id: '999888777',
    text: 'This is my commentary on the quoted tweet',
    created_at: '2024-01-15T14:00:00Z',
    author: {
      screen_name: 'quoter',
      name: 'Quote Person',
      avatar_url: 'https://pbs.twimg.com/profile/quoter.jpg',
    },
    quote: {
      id: '111222333',
      text: 'This is the original quoted tweet with important content',
      created_at: '2024-01-14T10:00:00Z',
      author: {
        screen_name: 'originalauthor',
        name: 'Original Author',
        avatar_url: 'https://pbs.twimg.com/profile/original.jpg',
      },
      media: {
        photos: [{ url: 'https://pbs.twimg.com/quoted-photo.jpg', width: 1200, height: 800 }],
      },
    },
  },
}

// Edge case: Tweet with BOTH media AND quote
const mockTweetWithMediaAndQuote = {
  tweet: {
    id: '555666777',
    text: 'Check out this image and also this quoted tweet!',
    created_at: '2024-01-15T16:00:00Z',
    author: {
      screen_name: 'mediaandquoter',
      name: 'Media And Quote Person',
      avatar_url: 'https://pbs.twimg.com/profile/mediaandquoter.jpg',
    },
    media: {
      all: [
        { type: 'photo', url: 'https://pbs.twimg.com/main-photo-1.jpg', width: 1200, height: 800 },
        { type: 'photo', url: 'https://pbs.twimg.com/main-photo-2.jpg', width: 1200, height: 900 },
      ],
    },
    quote: {
      id: '888999000',
      text: 'This is the quoted tweet content',
      created_at: '2024-01-14T08:00:00Z',
      author: {
        screen_name: 'quoteduser',
        name: 'Quoted User',
        avatar_url: 'https://pbs.twimg.com/profile/quoteduser.jpg',
      },
      media: {
        photos: [{ url: 'https://pbs.twimg.com/quoted-photo-in-combo.jpg', width: 800, height: 600 }],
      },
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

  describe('Quote tweet handling', () => {
    it('saves quote tweets with quoteContext and quotedTweetId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockQuoteTweet),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://twitter.com/quoter/status/999888777' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.bookmark.isQuote).toBe(true)
      expect(data.bookmark.quotedTweetId).toBe('111222333')
      expect(data.bookmark.quoteContext).toBeTruthy()

      // Verify quoteContext contains the quoted tweet data
      const quoteContext = JSON.parse(data.bookmark.quoteContext)
      expect(quoteContext.tweetId).toBe('111222333')
      expect(quoteContext.author).toBe('originalauthor')
      expect(quoteContext.text).toBe('This is the original quoted tweet with important content')
    })

    it('saves quoted tweet as separate bookmark', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockQuoteTweet),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      await POST(createRequest({ url: 'https://twitter.com/quoter/status/999888777' }))

      // Check that the quoted tweet was saved as its own bookmark
      const quotedBookmark = await testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(and(eq(schema.bookmarks.userId, 'user-123'), eq(schema.bookmarks.id, '111222333')))

      expect(quotedBookmark).toHaveLength(1)
      expect(quotedBookmark[0].author).toBe('originalauthor')
      expect(quotedBookmark[0].text).toBe('This is the original quoted tweet with important content')
      expect(quotedBookmark[0].source).toBe('quoted')
    })

    it('saves media from quoted tweet', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockQuoteTweet),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      await POST(createRequest({ url: 'https://twitter.com/quoter/status/999888777' }))

      // Check that media from the quoted tweet was saved
      const quotedMedia = await testInstance.db
        .select()
        .from(schema.bookmarkMedia)
        .where(eq(schema.bookmarkMedia.bookmarkId, '111222333'))

      expect(quotedMedia).toHaveLength(1)
      expect(quotedMedia[0].mediaType).toBe('photo')
      expect(quotedMedia[0].originalUrl).toBe('https://pbs.twimg.com/quoted-photo.jpg')
    })

    it('does not duplicate quoted tweet if already exists', async () => {
      // Pre-insert the quoted tweet
      await testInstance.db.insert(schema.bookmarks).values({
        id: '111222333',
        userId: 'user-123',
        author: 'originalauthor',
        text: 'Existing quoted tweet',
        tweetUrl: 'https://x.com/originalauthor/status/111222333',
        processedAt: new Date().toISOString(),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockQuoteTweet),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      await POST(createRequest({ url: 'https://twitter.com/quoter/status/999888777' }))

      // Should still have only one quoted tweet (no duplicate)
      const quotedBookmarks = await testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(and(eq(schema.bookmarks.userId, 'user-123'), eq(schema.bookmarks.id, '111222333')))

      expect(quotedBookmarks).toHaveLength(1)
      // Original text should be preserved (not overwritten)
      expect(quotedBookmarks[0].text).toBe('Existing quoted tweet')
    })
  })

  describe('Tweet with both media AND quote', () => {
    it('saves both media and quote context for combined tweets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetWithMediaAndQuote),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      const response = await POST(createRequest({ url: 'https://twitter.com/mediaandquoter/status/555666777' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      // Should be marked as both a photo (category) and a quote
      expect(data.bookmark.category).toBe('photo')
      expect(data.bookmark.isQuote).toBe(true)
      expect(data.bookmark.quotedTweetId).toBe('888999000')
      expect(data.bookmark.quoteContext).toBeTruthy()
    })

    it('saves main tweet media for combined tweets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetWithMediaAndQuote),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      await POST(createRequest({ url: 'https://twitter.com/mediaandquoter/status/555666777' }))

      // Check that main tweet's media was saved
      const mainMedia = await testInstance.db
        .select()
        .from(schema.bookmarkMedia)
        .where(eq(schema.bookmarkMedia.bookmarkId, '555666777'))

      expect(mainMedia).toHaveLength(2)
      expect(mainMedia[0].mediaType).toBe('photo')
      expect(mainMedia[0].originalUrl).toBe('https://pbs.twimg.com/main-photo-1.jpg')
      expect(mainMedia[1].originalUrl).toBe('https://pbs.twimg.com/main-photo-2.jpg')
    })

    it('saves quoted tweet as separate bookmark with its media', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetWithMediaAndQuote),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      await POST(createRequest({ url: 'https://twitter.com/mediaandquoter/status/555666777' }))

      // Check quoted tweet was saved as separate bookmark
      const [quotedBookmark] = await testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(and(eq(schema.bookmarks.userId, 'user-123'), eq(schema.bookmarks.id, '888999000')))

      expect(quotedBookmark).toBeTruthy()
      expect(quotedBookmark.author).toBe('quoteduser')
      expect(quotedBookmark.text).toBe('This is the quoted tweet content')
      expect(quotedBookmark.source).toBe('quoted')

      // Check quoted tweet's media was saved
      const quotedMedia = await testInstance.db
        .select()
        .from(schema.bookmarkMedia)
        .where(eq(schema.bookmarkMedia.bookmarkId, '888999000'))

      expect(quotedMedia).toHaveLength(1)
      expect(quotedMedia[0].originalUrl).toBe('https://pbs.twimg.com/quoted-photo-in-combo.jpg')
    })

    it('creates three bookmarks total: main + quoted (both with media)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTweetWithMediaAndQuote),
      })

      const { POST } = await import('@/app/api/tweets/add/route')
      await POST(createRequest({ url: 'https://twitter.com/mediaandquoter/status/555666777' }))

      // Should have 2 bookmarks: main tweet and quoted tweet
      const allBookmarks = await testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(eq(schema.bookmarks.userId, 'user-123'))

      expect(allBookmarks).toHaveLength(2)

      // Should have 3 media items total: 2 for main tweet, 1 for quoted tweet
      const allMedia = await testInstance.db
        .select()
        .from(schema.bookmarkMedia)
        .where(eq(schema.bookmarkMedia.userId, 'user-123'))

      expect(allMedia).toHaveLength(3)
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
