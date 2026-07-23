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
  captureException: vi.fn(),
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

  describe('Per-platform media URLs', () => {
    async function feedMedia(id: string) {
      const { GET } = await import('@/app/api/feed/route')
      const data = await (await GET(createRequest({ unreadOnly: 'false' }))).json()
      return data.items.find((i: { id: string }) => i.id === id)?.media?.[0]
    }

    it('Instagram video → IG stream + download + thumbnail proxy URLs (NOT the Twitter proxy)', async () => {
      await testInstance.db.insert(schema.bookmarks).values(
        createTestBookmark(USER_A, 'DXVsqQ7CSXw', {
          platform: 'instagram',
          category: 'video',
          tweetUrl: 'https://www.instagram.com/reel/DXVsqQ7CSXw/',
        }),
      )
      await testInstance.db.insert(schema.bookmarkMedia).values({
        id: 'DXVsqQ7CSXw_photo_0',
        userId: USER_A,
        platform: 'instagram',
        bookmarkId: 'DXVsqQ7CSXw',
        mediaType: 'video',
        originalUrl: 'https://scontent.cdninstagram.com/poster.jpg',
        previewUrl: 'https://scontent.cdninstagram.com/poster.jpg',
      })

      const media = await feedMedia('DXVsqQ7CSXw')
      expect(media.mediaType).toBe('video')
      expect(media.url).toBe('/api/media/instagram/video?id=DXVsqQ7CSXw')
      expect(media.shareUrl).toBe('/api/media/instagram/video/download?id=DXVsqQ7CSXw')
      expect(media.thumbnailUrl).toBe('/api/media/instagram/thumbnail?id=DXVsqQ7CSXw')
      expect(media.url).not.toContain('/api/media/video?author=')
    })

    it('TikTok video → TikTok stream + download + thumbnail proxy URLs', async () => {
      await testInstance.db.insert(schema.bookmarks).values(
        createTestBookmark(USER_A, '7648011069385919752', {
          platform: 'tiktok',
          author: 'animalsunseenofficial',
          category: 'video',
        }),
      )
      await testInstance.db.insert(schema.bookmarkMedia).values({
        id: '7648011069385919752_video_0',
        userId: USER_A,
        platform: 'tiktok',
        bookmarkId: '7648011069385919752',
        mediaType: 'video',
        originalUrl: 'tiktok',
      })

      const media = await feedMedia('7648011069385919752')
      expect(media.url).toBe(
        '/api/media/tiktok/video?username=animalsunseenofficial&id=7648011069385919752',
      )
      expect(media.shareUrl).toContain('/api/media/tiktok/video/download')
      expect(media.thumbnailUrl).toContain('/api/media/tiktok/thumbnail')
    })

    it('Instagram photo row → poster + IG link-out (graceful fallback, not a dead player)', async () => {
      await testInstance.db.insert(schema.bookmarks).values(
        createTestBookmark(USER_A, 'photopost1', {
          platform: 'instagram',
          category: 'photo',
          tweetUrl: 'https://www.instagram.com/p/photopost1/',
        }),
      )
      await testInstance.db.insert(schema.bookmarkMedia).values({
        id: 'photopost1_photo_0',
        userId: USER_A,
        platform: 'instagram',
        bookmarkId: 'photopost1',
        mediaType: 'photo',
        originalUrl: 'https://scontent.cdninstagram.com/p.jpg',
      })

      const media = await feedMedia('photopost1')
      expect(media.mediaType).toBe('photo')
      expect(media.url).toBe('/api/media/instagram/thumbnail?id=photopost1')
      expect(media.shareUrl).toBe('https://www.instagram.com/p/photopost1/')
    })
  })

  describe('Multi-user isolation', () => {
    it('only returns bookmarks for current user', async () => {
      // Create bookmarks for both users
      await testInstance.db
        .insert(schema.bookmarks)
        .values([
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
      await testInstance.db
        .insert(schema.bookmarks)
        .values([createTestBookmark(USER_A, 'tweet-1'), createTestBookmark(USER_B, 'tweet-1')])

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

  describe('Direct id lookup (?id=)', () => {
    it('returns a bookmark by id even when it is already read (bypasses unreadOnly)', async () => {
      await testInstance.db
        .insert(schema.bookmarks)
        .values([createTestBookmark(USER_A, 'tweet-1'), createTestBookmark(USER_A, 'tweet-2')])
      // Mark tweet-1 as read — the default feed (unreadOnly) would hide it.
      await testInstance.db.insert(schema.readStatus).values({
        userId: USER_A,
        bookmarkId: 'tweet-1',
        readAt: new Date().toISOString(),
      })

      const { GET } = await import('@/app/api/feed/route')
      // No unreadOnly param → defaults to true; the id lookup must still resolve it.
      const response = await GET(createRequest({ id: 'tweet-1' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.items).toHaveLength(1)
      expect(data.items[0].id).toBe('tweet-1')
      expect(data.items[0].isRead).toBe(true)
    })

    it('never returns another user’s bookmark by id', async () => {
      await testInstance.db.insert(schema.bookmarks).values([createTestBookmark(USER_B, 'tweet-b')])

      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ id: 'tweet-b' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.items).toHaveLength(0)
    })
  })

  describe('Tag filtering', () => {
    beforeEach(async () => {
      // Create bookmarks with tags
      await testInstance.db
        .insert(schema.bookmarks)
        .values([
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
        }),
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

    it('non-numeric page falls back to page 1 instead of erroring', async () => {
      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ page: 'abc', unreadOnly: 'false' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.pagination.page).toBe(1)
      expect(data.items.length).toBeGreaterThan(0)
    })

    it('page=0 is treated as page 1', async () => {
      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ page: '0', unreadOnly: 'false' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.pagination.page).toBe(1)
    })

    it('non-numeric limit falls back to the default limit instead of erroring', async () => {
      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ limit: 'abc', unreadOnly: 'false' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.pagination.limit).toBe(50)
    })

    it('negative limit is clamped to the default, not treated as unbounded', async () => {
      // Push the collection past the default page size so an unbounded
      // (unclamped) negative LIMIT would visibly return more than 50 rows.
      const extra = Array.from({ length: 45 }, (_, i) =>
        createTestBookmark(USER_A, `extra-${i + 1}`, {
          processedAt: new Date(Date.now() - (i + 100) * 1000).toISOString(),
        }),
      )
      await testInstance.db.insert(schema.bookmarks).values(extra)

      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ limit: '-1', unreadOnly: 'false' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.pagination.limit).toBe(50)
      expect(data.items.length).toBe(50)
    })

    it('limit above 100 is clamped to 100', async () => {
      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ limit: '99999', unreadOnly: 'false' }))

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.pagination.limit).toBe(100)
    })
  })

  describe('Unread filter', () => {
    beforeEach(async () => {
      await testInstance.db
        .insert(schema.bookmarks)
        .values([
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
      await testInstance.db
        .insert(schema.bookmarks)
        .values([
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

  describe('Sort', () => {
    it('sorts by processedAt desc by default', async () => {
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 'tweet-old', {
          processedAt: '2024-01-01T00:00:00Z',
          createdAt: '2024-06-01T00:00:00Z',
        }),
        createTestBookmark(USER_A, 'tweet-new', {
          processedAt: '2024-06-01T00:00:00Z',
          createdAt: '2024-01-01T00:00:00Z',
        }),
      ])

      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ unreadOnly: 'false' }))
      const data = await response.json()

      expect(data.items[0].id).toBe('tweet-new') // newer processedAt first
      expect(data.items[1].id).toBe('tweet-old')
    })

    it('sorts by createdAt desc when sort=posted', async () => {
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 'tweet-old-post', {
          processedAt: '2024-06-01T00:00:00Z',
          createdAt: '2024-01-01T00:00:00Z',
        }),
        createTestBookmark(USER_A, 'tweet-new-post', {
          processedAt: '2024-01-01T00:00:00Z',
          createdAt: '2024-06-01T00:00:00Z',
        }),
      ])

      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ sort: 'posted', unreadOnly: 'false' }))
      const data = await response.json()

      expect(data.items[0].id).toBe('tweet-new-post') // newer createdAt first
      expect(data.items[1].id).toBe('tweet-old-post')
    })

    it('sorts by processedAt asc when sortDir=asc', async () => {
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 'tweet-old', {
          processedAt: '2024-01-01T00:00:00Z',
        }),
        createTestBookmark(USER_A, 'tweet-new', {
          processedAt: '2024-06-01T00:00:00Z',
        }),
      ])

      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ sortDir: 'asc', unreadOnly: 'false' }))
      const data = await response.json()

      expect(data.items[0].id).toBe('tweet-old') // older processedAt first
      expect(data.items[1].id).toBe('tweet-new')
    })

    it('sorts by createdAt asc when sort=posted&sortDir=asc', async () => {
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 'tweet-old-post', {
          processedAt: '2024-06-01T00:00:00Z',
          createdAt: '2024-01-01T00:00:00Z',
        }),
        createTestBookmark(USER_A, 'tweet-new-post', {
          processedAt: '2024-01-01T00:00:00Z',
          createdAt: '2024-06-01T00:00:00Z',
        }),
      ])

      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(
        createRequest({ sort: 'posted', sortDir: 'asc', unreadOnly: 'false' }),
      )
      const data = await response.json()

      expect(data.items[0].id).toBe('tweet-old-post') // older createdAt first
      expect(data.items[1].id).toBe('tweet-new-post')
    })

    it('defaults to desc when sortDir is invalid', async () => {
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 'tweet-old', {
          processedAt: '2024-01-01T00:00:00Z',
        }),
        createTestBookmark(USER_A, 'tweet-new', {
          processedAt: '2024-06-01T00:00:00Z',
        }),
      ])

      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ sortDir: 'invalid', unreadOnly: 'false' }))
      const data = await response.json()

      expect(data.items[0].id).toBe('tweet-new') // desc by default
      expect(data.items[1].id).toBe('tweet-old')
    })

    it('ISO createdAt values sort correctly with posted sort', async () => {
      // Regression test: non-ISO dates (like Twitter format) caused incorrect sort
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 'tweet-jan', {
          createdAt: '2024-01-15T10:00:00.000Z',
        }),
        createTestBookmark(USER_A, 'tweet-mar', {
          createdAt: '2024-03-15T10:00:00.000Z',
        }),
        createTestBookmark(USER_A, 'tweet-feb', {
          createdAt: '2024-02-15T10:00:00.000Z',
        }),
      ])

      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ sort: 'posted', unreadOnly: 'false' }))
      const data = await response.json()

      expect(data.items[0].id).toBe('tweet-mar')
      expect(data.items[1].id).toBe('tweet-feb')
      expect(data.items[2].id).toBe('tweet-jan')
    })

    it('null createdAt sorts last when sort=posted', async () => {
      await testInstance.db.insert(schema.bookmarks).values([
        createTestBookmark(USER_A, 'tweet-no-date', {
          processedAt: '2024-06-01T00:00:00Z',
          createdAt: null,
        }),
        createTestBookmark(USER_A, 'tweet-with-date', {
          processedAt: '2024-01-01T00:00:00Z',
          createdAt: '2024-03-01T00:00:00Z',
        }),
      ])

      const { GET } = await import('@/app/api/feed/route')
      const response = await GET(createRequest({ sort: 'posted', unreadOnly: 'false' }))
      const data = await response.json()

      expect(data.items[0].id).toBe('tweet-with-date')
      expect(data.items[1].id).toBe('tweet-no-date') // null sorts last
    })
  })

  describe('Manual filter', () => {
    beforeEach(async () => {
      await testInstance.db
        .insert(schema.bookmarks)
        .values([
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
