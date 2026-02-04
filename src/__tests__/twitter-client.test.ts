import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './api/setup'

/**
 * Twitter Client Tests
 *
 * Tests Twitter API client authentication, token refresh, and bookmark fetching.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

// Mock TwitterApi class
const mockTwitterApi = {
  v2: {
    bookmarks: vi.fn(),
    singleTweet: vi.fn(),
  },
}

vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn(() => mockTwitterApi),
}))

// Mock fetch for token refresh
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock env vars
vi.stubEnv('TWITTER_CLIENT_ID', 'test-client-id')
vi.stubEnv('TWITTER_CLIENT_SECRET', 'test-client-secret')

describe('Twitter Client', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('getTwitterClient', () => {
    it('throws error when user has no tokens', async () => {
      const { getTwitterClient } = await import('@/lib/twitter/client')

      await expect(getTwitterClient('nonexistent-user')).rejects.toThrow(
        'Not authenticated. Please connect your Twitter account.'
      )
    })

    it('returns client with valid tokens', async () => {
      // Insert valid tokens
      const expiresAt = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      await testInstance.db.insert(schema.oauthTokens).values({
        userId: 'user-123',
        username: 'testuser',
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt,
        scopes: 'tweet.read bookmark.read',
      })

      const { getTwitterClient } = await import('@/lib/twitter/client')
      const client = await getTwitterClient('user-123')

      expect(client).toBeDefined()
      expect(client.v2).toBeDefined()
    })

    it('refreshes expired tokens automatically', async () => {
      // Insert expired tokens
      const expiresAt = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      await testInstance.db.insert(schema.oauthTokens).values({
        userId: 'user-123',
        username: 'testuser',
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt,
        scopes: 'tweet.read bookmark.read',
      })

      // Mock token refresh response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 7200,
          }),
      })

      const { getTwitterClient } = await import('@/lib/twitter/client')
      const client = await getTwitterClient('user-123')

      expect(client).toBeDefined()
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.twitter.com/2/oauth2/token',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('updates database with refreshed tokens', async () => {
      // Insert expired tokens
      const expiresAt = Math.floor(Date.now() / 1000) - 3600
      await testInstance.db.insert(schema.oauthTokens).values({
        userId: 'user-456',
        username: 'testuser',
        accessToken: 'expired-token',
        refreshToken: 'old-refresh-token',
        expiresAt,
        scopes: 'tweet.read',
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'brand-new-access-token',
            refresh_token: 'brand-new-refresh-token',
            expires_in: 7200,
          }),
      })

      const { getTwitterClient } = await import('@/lib/twitter/client')
      await getTwitterClient('user-456')

      // Verify tokens were updated (they are now encrypted at rest)
      const [tokens] = await testInstance.db
        .select()
        .from(schema.oauthTokens)
        .where(require('drizzle-orm').eq(schema.oauthTokens.userId, 'user-456'))

      // Import decryption to verify stored tokens
      const { safeDecryptToken } = await import('@/lib/auth/token-encryption')
      expect(safeDecryptToken(tokens.accessToken)).toBe('brand-new-access-token')
      expect(safeDecryptToken(tokens.refreshToken)).toBe('brand-new-refresh-token')
    })
  })

  describe('fetchBookmarks', () => {
    beforeEach(async () => {
      // Insert valid tokens
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      await testInstance.db.insert(schema.oauthTokens).values({
        userId: 'user-123',
        username: 'testuser',
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiresAt,
        scopes: 'tweet.read bookmark.read',
      })
    })

    it('fetches bookmarks with user and media expansions', async () => {
      mockTwitterApi.v2.bookmarks.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'tweet-1',
              text: 'Test tweet content',
              author_id: 'author-1',
              created_at: '2024-01-15T12:00:00Z',
            },
          ],
          meta: { result_count: 1 },
        },
        includes: {
          users: [{ id: 'author-1', username: 'author', name: 'Author Name' }],
          media: [],
        },
      })

      const { fetchBookmarks } = await import('@/lib/twitter/client')
      const result = await fetchBookmarks('user-123')

      expect(result.bookmarks).toHaveLength(1)
      expect(result.bookmarks[0].id).toBe('tweet-1')
      expect(result.bookmarks[0].text).toBe('Test tweet content')
      expect(result.bookmarks[0].author?.username).toBe('author')
      expect(result.resultCount).toBe(1)
    })

    it('handles pagination token', async () => {
      mockTwitterApi.v2.bookmarks.mockResolvedValueOnce({
        data: {
          data: [{ id: 'tweet-2', text: 'Another tweet', author_id: 'author-2' }],
          meta: { result_count: 1, next_token: 'next-page-token' },
        },
        includes: { users: [], media: [] },
      })

      const { fetchBookmarks } = await import('@/lib/twitter/client')
      const result = await fetchBookmarks('user-123', {
        paginationToken: 'current-page-token',
      })

      expect(result.nextToken).toBe('next-page-token')
      expect(mockTwitterApi.v2.bookmarks).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination_token: 'current-page-token',
        })
      )
    })

    it('maps media attachments correctly', async () => {
      mockTwitterApi.v2.bookmarks.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'tweet-3',
              text: 'Tweet with media',
              author_id: 'author-3',
              attachments: { media_keys: ['media-key-1'] },
            },
          ],
          meta: { result_count: 1 },
        },
        includes: {
          users: [{ id: 'author-3', username: 'mediauser', name: 'Media User' }],
          media: [
            {
              media_key: 'media-key-1',
              type: 'photo',
              url: 'https://pbs.twimg.com/photo.jpg',
              width: 1200,
              height: 800,
            },
          ],
        },
      })

      const { fetchBookmarks } = await import('@/lib/twitter/client')
      const result = await fetchBookmarks('user-123')

      expect(result.bookmarks[0].media).toHaveLength(1)
      expect(result.bookmarks[0].media![0].type).toBe('photo')
      expect(result.bookmarks[0].media![0].url).toBe('https://pbs.twimg.com/photo.jpg')
      expect(result.bookmarks[0].media![0].width).toBe(1200)
    })

    it('extracts full text from note_tweet for long tweets', async () => {
      mockTwitterApi.v2.bookmarks.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'tweet-long',
              text: 'Truncated version...',
              author_id: 'author-4',
              note_tweet: { text: 'This is the full very long tweet text that exceeds 280 characters...' },
            },
          ],
          meta: { result_count: 1 },
        },
        includes: { users: [], media: [] },
      })

      const { fetchBookmarks } = await import('@/lib/twitter/client')
      const result = await fetchBookmarks('user-123')

      expect(result.bookmarks[0].text).toBe(
        'This is the full very long tweet text that exceeds 280 characters...'
      )
    })

    it('handles empty bookmarks response', async () => {
      mockTwitterApi.v2.bookmarks.mockResolvedValueOnce({
        data: { data: [], meta: { result_count: 0 } },
        includes: { users: [], media: [] },
      })

      const { fetchBookmarks } = await import('@/lib/twitter/client')
      const result = await fetchBookmarks('user-123')

      expect(result.bookmarks).toHaveLength(0)
      expect(result.resultCount).toBe(0)
    })
  })

  describe('fetchTweet', () => {
    beforeEach(async () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      await testInstance.db.insert(schema.oauthTokens).values({
        userId: 'user-123',
        username: 'testuser',
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiresAt,
        scopes: 'tweet.read',
      })
    })

    it('fetches single tweet by ID', async () => {
      mockTwitterApi.v2.singleTweet.mockResolvedValueOnce({
        data: {
          id: 'tweet-999',
          text: 'Single tweet content',
          author_id: 'author-999',
          created_at: '2024-01-20T10:00:00Z',
        },
        includes: {
          users: [{ id: 'author-999', username: 'singleauthor', name: 'Single Author' }],
        },
      })

      const { fetchTweet } = await import('@/lib/twitter/client')
      const result = await fetchTweet('user-123', 'tweet-999')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('tweet-999')
      expect(result!.text).toBe('Single tweet content')
      expect(result!.author?.username).toBe('singleauthor')
    })

    it('returns null on fetch error', async () => {
      mockTwitterApi.v2.singleTweet.mockRejectedValueOnce(new Error('Tweet not found'))

      const { fetchTweet } = await import('@/lib/twitter/client')
      const result = await fetchTweet('user-123', 'nonexistent-tweet')

      expect(result).toBeNull()
    })

    it('extracts full text from note_tweet for long tweets', async () => {
      mockTwitterApi.v2.singleTweet.mockResolvedValueOnce({
        data: {
          id: 'long-tweet',
          text: 'Short version',
          author_id: 'author-long',
          note_tweet: { text: 'This is the complete long form content of the tweet.' },
        },
        includes: { users: [] },
      })

      const { fetchTweet } = await import('@/lib/twitter/client')
      const result = await fetchTweet('user-123', 'long-tweet')

      expect(result!.text).toBe('This is the complete long form content of the tweet.')
    })
  })

  describe('fetchAllBookmarks', () => {
    beforeEach(async () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600
      await testInstance.db.insert(schema.oauthTokens).values({
        userId: 'user-123',
        username: 'testuser',
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        expiresAt,
        scopes: 'bookmark.read',
      })
    })

    it('paginates through all bookmarks', async () => {
      // First page
      mockTwitterApi.v2.bookmarks.mockResolvedValueOnce({
        data: {
          data: [{ id: 'tweet-1', text: 'Page 1', author_id: 'a1' }],
          meta: { result_count: 1, next_token: 'page-2-token' },
        },
        includes: { users: [], media: [] },
      })
      // Second page
      mockTwitterApi.v2.bookmarks.mockResolvedValueOnce({
        data: {
          data: [{ id: 'tweet-2', text: 'Page 2', author_id: 'a2' }],
          meta: { result_count: 1 },
        },
        includes: { users: [], media: [] },
      })

      const { fetchAllBookmarks } = await import('@/lib/twitter/client')
      const result = await fetchAllBookmarks('user-123', { maxPages: 10 })

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('tweet-1')
      expect(result[1].id).toBe('tweet-2')
    })

    it('respects maxPages limit', async () => {
      // Always return a next_token to simulate endless pagination
      mockTwitterApi.v2.bookmarks.mockResolvedValue({
        data: {
          data: [{ id: 'tweet', text: 'Content', author_id: 'a' }],
          meta: { result_count: 1, next_token: 'more-pages' },
        },
        includes: { users: [], media: [] },
      })

      const { fetchAllBookmarks } = await import('@/lib/twitter/client')
      await fetchAllBookmarks('user-123', { maxPages: 3 })

      // Should only call bookmarks 3 times due to maxPages
      expect(mockTwitterApi.v2.bookmarks).toHaveBeenCalledTimes(3)
    })

    it('calls onProgress callback', async () => {
      mockTwitterApi.v2.bookmarks.mockResolvedValueOnce({
        data: {
          data: [
            { id: 't1', text: 'A', author_id: 'a' },
            { id: 't2', text: 'B', author_id: 'a' },
          ],
          meta: { result_count: 2 },
        },
        includes: { users: [], media: [] },
      })

      const onProgress = vi.fn()
      const { fetchAllBookmarks } = await import('@/lib/twitter/client')
      await fetchAllBookmarks('user-123', { onProgress })

      expect(onProgress).toHaveBeenCalledWith(2, 2)
    })
  })
})
