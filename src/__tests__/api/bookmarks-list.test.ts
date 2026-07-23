import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from './setup'

/**
 * API Route Tests: GET /api/bookmarks
 *
 * Verifies multi-user isolation and — the composite-key fix — that related
 * tags/media/read-status are looked up by (platform, bookmarkId), not just
 * bookmarkId, so a same numeric id saved on two platforms for one user
 * doesn't cross-contaminate each other's related data.
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

vi.mock('@/lib/sentry', () => ({
  metrics: {
    bookmarkAdded: vi.fn(),
  },
  captureException: vi.fn(),
}))

function createRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/bookmarks${query}`)
}

describe('API: GET /api/bookmarks', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = USER_A
    vi.clearAllMocks()
  })

  afterEach(() => {
    testInstance.close()
  })

  it('returns 401 when not authenticated', async () => {
    mockUserId = null

    const { GET } = await import('@/app/api/bookmarks/route')
    const response = await GET(createRequest())

    expect(response.status).toBe(401)
  })

  it("does not return another user's bookmarks", async () => {
    await testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, 'tweet-a'))
    await testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_B, 'tweet-b'))

    const { GET } = await import('@/app/api/bookmarks/route')
    const response = await GET(createRequest())

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.bookmarks).toHaveLength(1)
    expect(data.bookmarks[0].id).toBe('tweet-a')
  })

  it('does not cross-contaminate tags/media/read-status across platforms sharing the same numeric id', async () => {
    // Same user, same numeric id, two different platforms — the composite
    // primary key is (userId, platform, id), so these are distinct bookmarks.
    await testInstance.db.insert(schema.bookmarks).values(
      createTestBookmark(USER_A, '1000', {
        platform: 'twitter',
        author: 'twitteruser',
        tweetUrl: 'https://twitter.com/twitteruser/status/1000',
      }),
    )
    await testInstance.db.insert(schema.bookmarks).values(
      createTestBookmark(USER_A, '1000', {
        platform: 'tiktok',
        author: 'tiktokuser',
        tweetUrl: 'https://tiktok.com/@tiktokuser/video/1000',
      }),
    )

    await testInstance.db.insert(schema.bookmarkTags).values([
      { userId: USER_A, platform: 'twitter', bookmarkId: '1000', tag: 'tweet-tag' },
      { userId: USER_A, platform: 'tiktok', bookmarkId: '1000', tag: 'tiktok-tag' },
    ])

    await testInstance.db.insert(schema.bookmarkMedia).values([
      {
        id: 'twitter-media-1',
        userId: USER_A,
        platform: 'twitter',
        bookmarkId: '1000',
        mediaType: 'photo',
        originalUrl: 'https://pbs.twimg.com/twitter-photo.jpg',
      },
      {
        id: 'tiktok-media-1',
        userId: USER_A,
        platform: 'tiktok',
        bookmarkId: '1000',
        mediaType: 'video',
        originalUrl: 'https://tiktokcdn.com/tiktok-video.mp4',
      },
    ])

    // Only the TikTok bookmark has been read.
    await testInstance.db.insert(schema.readStatus).values({
      userId: USER_A,
      platform: 'tiktok',
      bookmarkId: '1000',
      readAt: new Date().toISOString(),
    })

    const { GET } = await import('@/app/api/bookmarks/route')
    const response = await GET(createRequest())

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.bookmarks).toHaveLength(2)

    const twitterBookmark = data.bookmarks.find(
      (b: { platform: string }) => b.platform === 'twitter',
    )
    const tiktokBookmark = data.bookmarks.find((b: { platform: string }) => b.platform === 'tiktok')

    expect(twitterBookmark.tags).toEqual(['tweet-tag'])
    expect(twitterBookmark.media).toHaveLength(1)
    expect(twitterBookmark.media[0].id).toBe('twitter-media-1')
    expect(twitterBookmark.isRead).toBe(false)

    expect(tiktokBookmark.tags).toEqual(['tiktok-tag'])
    expect(tiktokBookmark.media).toHaveLength(1)
    expect(tiktokBookmark.media[0].id).toBe('tiktok-media-1')
    expect(tiktokBookmark.isRead).toBe(true)
  })
})
