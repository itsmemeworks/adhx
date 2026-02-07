import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, type TestDbInstance, USER_A, USER_B } from './setup'
import * as schema from '@/lib/db/schema'

/**
 * API Route Tests: /api/share/tweet/[username]/[id]
 *
 * Tests the public tweet JSON API endpoint.
 * Validates parameter validation, FxTwitter data transformation, caching headers,
 * and ADHX context enrichment.
 */

let testInstance: TestDbInstance

// Mock fetchTweetData
const mockFetchTweetData = vi.fn()

vi.mock('@/lib/media/fxembed', () => ({
  fetchTweetData: (...args: unknown[]) => mockFetchTweetData(...args),
}))

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

function createRequest(username: string, id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/share/tweet/${username}/${id}`)
}

// Helper to build a minimal FxTwitter response
function buildFxResponse(overrides: Record<string, unknown> = {}) {
  return {
    code: 200,
    message: 'OK',
    tweet: {
      id: '123456789',
      url: 'https://x.com/testuser/status/123456789',
      text: 'Hello world, this is a test tweet.',
      author: {
        id: '111',
        name: 'Test User',
        screen_name: 'testuser',
        avatar_url: 'https://pbs.twimg.com/profile/test.jpg',
      },
      created_at: '2026-01-15T10:00:00Z',
      replies: 5,
      retweets: 10,
      likes: 100,
      views: 5000,
      ...overrides,
    },
  }
}

describe('API: /api/share/tweet/[username]/[id]', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    vi.clearAllMocks()
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('Parameter validation', () => {
    it('returns 400 for invalid username with special chars', async () => {
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('invalid-user!', '123'),
        { params: Promise.resolve({ username: 'invalid-user!', id: '123' }) }
      )
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid username')
    })

    it('returns 400 for username longer than 15 chars', async () => {
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('a'.repeat(16), '123'),
        { params: Promise.resolve({ username: 'a'.repeat(16), id: '123' }) }
      )
      expect(response.status).toBe(400)
    })

    it('returns 400 for non-numeric tweet ID', async () => {
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', 'abc'),
        { params: Promise.resolve({ username: 'testuser', id: 'abc' }) }
      )
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Invalid tweet ID')
    })

    it('accepts valid username with underscores', async () => {
      mockFetchTweetData.mockResolvedValue(buildFxResponse())
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('_test_user', '123'),
        { params: Promise.resolve({ username: '_test_user', id: '123' }) }
      )
      expect(response.status).toBe(200)
    })
  })

  describe('Tweet fetching', () => {
    it('returns 404 when FxTwitter returns null', async () => {
      mockFetchTweetData.mockResolvedValue(null)
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123'),
        { params: Promise.resolve({ username: 'testuser', id: '123' }) }
      )
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Tweet not found')
    })

    it('returns 404 when FxTwitter returns response without tweet', async () => {
      mockFetchTweetData.mockResolvedValue({ code: 404, message: 'Not found' })
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123'),
        { params: Promise.resolve({ username: 'testuser', id: '123' }) }
      )
      expect(response.status).toBe(404)
    })

    it('returns 500 when fetchTweetData throws', async () => {
      mockFetchTweetData.mockRejectedValue(new Error('Network error'))
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123'),
        { params: Promise.resolve({ username: 'testuser', id: '123' }) }
      )
      expect(response.status).toBe(500)
    })
  })

  describe('Response shape', () => {
    it('returns correct JSON for a regular tweet', async () => {
      mockFetchTweetData.mockResolvedValue(buildFxResponse())
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123456789'),
        { params: Promise.resolve({ username: 'testuser', id: '123456789' }) }
      )
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.id).toBe('123456789')
      expect(data.url).toBe('https://x.com/testuser/status/123456789')
      expect(data.text).toBe('Hello world, this is a test tweet.')
      expect(data.author).toEqual({
        name: 'Test User',
        username: 'testuser',
        avatarUrl: 'https://pbs.twimg.com/profile/test.jpg',
      })
      expect(data.engagement).toEqual({
        replies: 5,
        retweets: 10,
        likes: 100,
        views: 5000,
      })
      // No media/article/quote/external for basic tweet
      expect(data.media).toBeUndefined()
      expect(data.article).toBeUndefined()
      expect(data.quoteTweet).toBeUndefined()
      expect(data.externalLink).toBeUndefined()
    })

    it('includes media when tweet has photos', async () => {
      mockFetchTweetData.mockResolvedValue(
        buildFxResponse({
          media: {
            photos: [{ url: 'https://img.com/1.jpg', width: 800, height: 600 }],
            videos: [],
          },
        })
      )
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123'),
        { params: Promise.resolve({ username: 'testuser', id: '123' }) }
      )
      const data = await response.json()
      expect(data.media).toBeDefined()
      expect(data.media.photos).toHaveLength(1)
      expect(data.media.photos[0].url).toBe('https://img.com/1.jpg')
    })

    it('includes media when tweet has videos', async () => {
      mockFetchTweetData.mockResolvedValue(
        buildFxResponse({
          media: {
            photos: [],
            videos: [{
              url: 'https://video.com/v.mp4',
              thumbnail_url: 'https://video.com/thumb.jpg',
              width: 1920,
              height: 1080,
              duration: 30,
            }],
          },
        })
      )
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123'),
        { params: Promise.resolve({ username: 'testuser', id: '123' }) }
      )
      const data = await response.json()
      expect(data.media.videos).toHaveLength(1)
      expect(data.media.videos[0].thumbnailUrl).toBe('https://video.com/thumb.jpg')
      expect(data.media.videos[0].duration).toBe(30)
    })

    it('includes article with markdown content', async () => {
      mockFetchTweetData.mockResolvedValue(
        buildFxResponse({
          article: {
            id: 'art-1',
            title: 'My Article',
            preview_text: 'A preview of the article.',
            content: {
              blocks: [
                { key: '1', text: 'Introduction', type: 'header-one' },
                { key: '2', text: 'Some paragraph text.', type: 'unstyled' },
              ],
              entityMap: {},
            },
          },
        })
      )
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123'),
        { params: Promise.resolve({ username: 'testuser', id: '123' }) }
      )
      const data = await response.json()
      expect(data.article).toBeDefined()
      expect(data.article.title).toBe('My Article')
      expect(data.article.content).toContain('# Introduction')
      expect(data.article.content).toContain('Some paragraph text.')
    })

    it('includes quote tweet data', async () => {
      mockFetchTweetData.mockResolvedValue(
        buildFxResponse({
          quote: {
            id: '999',
            url: 'https://x.com/quoted/status/999',
            text: 'Original tweet text',
            author: {
              id: '222',
              name: 'Quoted Author',
              screen_name: 'quoteduser',
              avatar_url: 'https://pbs.twimg.com/profile/quoted.jpg',
            },
            created_at: '2026-01-10T08:00:00Z',
            replies: 1,
            retweets: 2,
            likes: 3,
          },
        })
      )
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123'),
        { params: Promise.resolve({ username: 'testuser', id: '123' }) }
      )
      const data = await response.json()
      expect(data.quoteTweet).toBeDefined()
      expect(data.quoteTweet.id).toBe('999')
      expect(data.quoteTweet.author.username).toBe('quoteduser')
    })

    it('includes external link data', async () => {
      mockFetchTweetData.mockResolvedValue(
        buildFxResponse({
          external: {
            url: 'https://t.co/abc',
            display_url: 'example.com/article',
            expanded_url: 'https://example.com/article',
            title: 'An Article',
            description: 'Article description',
            thumbnail_url: 'https://example.com/thumb.jpg',
          },
        })
      )
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123'),
        { params: Promise.resolve({ username: 'testuser', id: '123' }) }
      )
      const data = await response.json()
      expect(data.externalLink).toBeDefined()
      expect(data.externalLink.url).toBe('https://example.com/article')
      expect(data.externalLink.title).toBe('An Article')
    })
  })

  describe('Cache headers', () => {
    it('returns Cache-Control header for successful responses', async () => {
      mockFetchTweetData.mockResolvedValue(buildFxResponse())
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123'),
        { params: Promise.resolve({ username: 'testuser', id: '123' }) }
      )
      expect(response.headers.get('Cache-Control')).toBe(
        'public, max-age=300, stale-while-revalidate=600'
      )
    })

    it('does not return Cache-Control header for error responses', async () => {
      mockFetchTweetData.mockResolvedValue(null)
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123'),
        { params: Promise.resolve({ username: 'testuser', id: '123' }) }
      )
      expect(response.headers.get('Cache-Control')).toBeNull()
    })
  })

  describe('adhxContext enrichment', () => {
    it('omits adhxContext when tweet has no ADHX saves', async () => {
      mockFetchTweetData.mockResolvedValue(buildFxResponse())
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123456789'),
        { params: Promise.resolve({ username: 'testuser', id: '123456789' }) }
      )
      const data = await response.json()
      expect(data.adhxContext).toBeUndefined()
    })

    it('includes savedByCount for bookmarked tweets', async () => {
      // Two users bookmark the same tweet
      testInstance.db.insert(schema.bookmarks).values([
        {
          id: '123456789',
          userId: USER_A,
          author: 'testuser',
          text: 'A tweet',
          tweetUrl: 'https://x.com/testuser/status/123456789',
          processedAt: new Date().toISOString(),
        },
        {
          id: '123456789',
          userId: USER_B,
          author: 'testuser',
          text: 'A tweet',
          tweetUrl: 'https://x.com/testuser/status/123456789',
          processedAt: new Date().toISOString(),
        },
      ]).run()

      mockFetchTweetData.mockResolvedValue(buildFxResponse())
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123456789'),
        { params: Promise.resolve({ username: 'testuser', id: '123456789' }) }
      )
      const data = await response.json()
      expect(data.adhxContext).toBeDefined()
      expect(data.adhxContext.savedByCount).toBe(2)
    })

    it('does not leak user IDs in adhxContext', async () => {
      testInstance.db.insert(schema.bookmarks).values({
        id: '123456789',
        userId: USER_A,
        author: 'testuser',
        text: 'A tweet',
        tweetUrl: 'https://x.com/testuser/status/123456789',
        processedAt: new Date().toISOString(),
      }).run()

      mockFetchTweetData.mockResolvedValue(buildFxResponse())
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123456789'),
        { params: Promise.resolve({ username: 'testuser', id: '123456789' }) }
      )
      const data = await response.json()
      const json = JSON.stringify(data.adhxContext)
      expect(json).not.toContain(USER_A)
      expect(json).not.toContain(USER_B)
    })

    it('includes public tags in adhxContext', async () => {
      testInstance.db.insert(schema.oauthTokens).values({
        userId: USER_A,
        username: 'alice',
        accessToken: 'enc_token',
        refreshToken: 'enc_refresh',
        expiresAt: Date.now() + 3600000,
      }).run()

      testInstance.db.insert(schema.bookmarks).values({
        id: '123456789',
        userId: USER_A,
        author: 'testuser',
        text: 'A tweet',
        tweetUrl: 'https://x.com/testuser/status/123456789',
        processedAt: new Date().toISOString(),
      }).run()

      testInstance.db.insert(schema.bookmarkTags).values({
        userId: USER_A,
        bookmarkId: '123456789',
        tag: 'ai-tools',
      }).run()

      testInstance.db.insert(schema.tagShares).values({
        userId: USER_A,
        tag: 'ai-tools',
        shareCode: 'share-1',
        isPublic: true,
      }).run()

      mockFetchTweetData.mockResolvedValue(buildFxResponse())
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123456789'),
        { params: Promise.resolve({ username: 'testuser', id: '123456789' }) }
      )
      const data = await response.json()
      expect(data.adhxContext.publicTags).toHaveLength(1)
      expect(data.adhxContext.publicTags[0]).toEqual({
        tag: 'ai-tools',
        curator: 'alice',
        url: '/t/alice/ai-tools',
      })
    })

    it('excludes private tags from adhxContext', async () => {
      testInstance.db.insert(schema.oauthTokens).values({
        userId: USER_A,
        username: 'alice',
        accessToken: 'enc_token',
        refreshToken: 'enc_refresh',
        expiresAt: Date.now() + 3600000,
      }).run()

      testInstance.db.insert(schema.bookmarks).values({
        id: '123456789',
        userId: USER_A,
        author: 'testuser',
        text: 'A tweet',
        tweetUrl: 'https://x.com/testuser/status/123456789',
        processedAt: new Date().toISOString(),
      }).run()

      testInstance.db.insert(schema.bookmarkTags).values({
        userId: USER_A,
        bookmarkId: '123456789',
        tag: 'private-tag',
      }).run()

      testInstance.db.insert(schema.tagShares).values({
        userId: USER_A,
        tag: 'private-tag',
        shareCode: 'share-private',
        isPublic: false,
      }).run()

      mockFetchTweetData.mockResolvedValue(buildFxResponse())
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123456789'),
        { params: Promise.resolve({ username: 'testuser', id: '123456789' }) }
      )
      const data = await response.json()
      expect(data.adhxContext.savedByCount).toBe(1)
      expect(data.adhxContext.publicTags).toHaveLength(0)
    })

    it('includes previewUrl in adhxContext', async () => {
      testInstance.db.insert(schema.bookmarks).values({
        id: '123456789',
        userId: USER_A,
        author: 'testuser',
        text: 'A tweet',
        tweetUrl: 'https://x.com/testuser/status/123456789',
        processedAt: new Date().toISOString(),
      }).run()

      mockFetchTweetData.mockResolvedValue(buildFxResponse())
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123456789'),
        { params: Promise.resolve({ username: 'testuser', id: '123456789' }) }
      )
      const data = await response.json()
      expect(data.adhxContext.previewUrl).toContain('/testuser/status/123456789')
    })

    it('counts saves from multiple users correctly', async () => {
      const USER_C = 'user-c-789'
      testInstance.db.insert(schema.bookmarks).values([
        { id: '123456789', userId: USER_A, author: 'testuser', text: 'Tweet', tweetUrl: 'https://x.com/testuser/status/123456789', processedAt: new Date().toISOString() },
        { id: '123456789', userId: USER_B, author: 'testuser', text: 'Tweet', tweetUrl: 'https://x.com/testuser/status/123456789', processedAt: new Date().toISOString() },
        { id: '123456789', userId: USER_C, author: 'testuser', text: 'Tweet', tweetUrl: 'https://x.com/testuser/status/123456789', processedAt: new Date().toISOString() },
      ]).run()

      mockFetchTweetData.mockResolvedValue(buildFxResponse())
      const { GET } = await import('@/app/api/share/tweet/[username]/[id]/route')
      const response = await GET(
        createRequest('testuser', '123456789'),
        { params: Promise.resolve({ username: 'testuser', id: '123456789' }) }
      )
      const data = await response.json()
      expect(data.adhxContext.savedByCount).toBe(3)
    })
  })
})
