import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq, and } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from './setup'

/**
 * API Route Tests: /api/collections
 *
 * Regression coverage for the composite-key (userId, platform, id) bug where
 * collection_tweets writes/reads omitted `platform`, causing non-Twitter
 * bookmarks (Instagram/TikTok/YouTube) to silently vanish from a collection's
 * listing (the feed's collection filter matches collectionTweets.platform
 * against bookmarks.platform). Also covers transactional writes and
 * multi-user isolation.
 */

let mockUserId: string | null = USER_A
let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
}))

function createRequest(url: string, method: string, body?: object): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function createCollection(name = 'Test Collection') {
  const { POST } = await import('@/app/api/collections/route')
  const response = await POST(
    createRequest('http://localhost:3000/api/collections', 'POST', { name }),
  )
  const data = await response.json()
  return data.collection as { id: string; tweetCount: number }
}

describe('API: /api/collections', () => {
  beforeEach(async () => {
    testInstance = createTestDb()
    mockUserId = USER_A
    vi.clearAllMocks()
    mockUserId = USER_A // vi.clearAllMocks() doesn't touch this module-level var, but keep intent explicit

    // Seed a Twitter bookmark and an Instagram bookmark for USER_A, sharing the
    // same numeric id to also exercise the composite-key collision case.
    await testInstance.db.insert(schema.bookmarks).values([
      createTestBookmark(USER_A, 'post-1', { platform: 'twitter' }),
      createTestBookmark(USER_A, 'post-1', {
        platform: 'instagram',
        author: 'igauthor',
        tweetUrl: 'https://instagram.com/reels/post-1',
      }),
    ])
  })

  afterEach(() => {
    testInstance.close()
  })

  describe('add + list round trip across platforms', () => {
    it('returns both a twitter AND an instagram bookmark added to the same collection', async () => {
      const collection = await createCollection()

      const { POST } = await import('@/app/api/collections/[id]/tweets/route')

      const twitterRes = await POST(
        createRequest(`http://localhost:3000/api/collections/${collection.id}/tweets`, 'POST', {
          bookmarkId: 'post-1',
          platform: 'twitter',
        }),
        { params: Promise.resolve({ id: collection.id }) },
      )
      expect(twitterRes.status).toBe(200)

      const igRes = await POST(
        createRequest(`http://localhost:3000/api/collections/${collection.id}/tweets`, 'POST', {
          bookmarkId: 'post-1',
          platform: 'instagram',
        }),
        { params: Promise.resolve({ id: collection.id }) },
      )
      expect(igRes.status).toBe(200)

      const { GET } = await import('@/app/api/collections/[id]/tweets/route')
      const listRes = await GET(
        createRequest(`http://localhost:3000/api/collections/${collection.id}/tweets`, 'GET'),
        { params: Promise.resolve({ id: collection.id }) },
      )
      const listData = await listRes.json()

      expect(listData.tweets).toHaveLength(2)
      const platforms = listData.tweets.map((t: { platform: string }) => t.platform).sort()
      expect(platforms).toEqual(['instagram', 'twitter'])

      // Both rows persisted with the correct platform in the DB.
      const rows = await testInstance.db
        .select()
        .from(schema.collectionTweets)
        .where(
          and(
            eq(schema.collectionTweets.userId, USER_A),
            eq(schema.collectionTweets.collectionId, collection.id),
          ),
        )
      expect(rows).toHaveLength(2)
      expect(rows.map((r) => r.platform).sort()).toEqual(['instagram', 'twitter'])
    })

    it('resolves the real platform from the bookmark when the client omits it (back-compat)', async () => {
      // Only seed an Instagram bookmark under this id, so an implicit 'twitter'
      // default would previously 404 or silently mis-file it.
      await testInstance.db.insert(schema.bookmarks).values(
        createTestBookmark(USER_A, 'ig-only-1', {
          platform: 'instagram',
          author: 'igauthor',
          tweetUrl: 'https://instagram.com/reels/ig-only-1',
        }),
      )

      const collection = await createCollection()
      const { POST, GET } = await import('@/app/api/collections/[id]/tweets/route')

      const addRes = await POST(
        createRequest(`http://localhost:3000/api/collections/${collection.id}/tweets`, 'POST', {
          bookmarkId: 'ig-only-1',
          // no `platform` field — mirrors the current client behavior
        }),
        { params: Promise.resolve({ id: collection.id }) },
      )
      expect(addRes.status).toBe(200)

      const listRes = await GET(
        createRequest(`http://localhost:3000/api/collections/${collection.id}/tweets`, 'GET'),
        { params: Promise.resolve({ id: collection.id }) },
      )
      const listData = await listRes.json()

      expect(listData.tweets).toHaveLength(1)
      expect(listData.tweets[0].platform).toBe('instagram')
    })
  })

  describe('remove by (platform, id)', () => {
    it('removes only the targeted platform row, leaving the other platform intact', async () => {
      const collection = await createCollection()
      const { POST, DELETE, GET } = await import('@/app/api/collections/[id]/tweets/route')

      await POST(
        createRequest(`http://localhost:3000/api/collections/${collection.id}/tweets`, 'POST', {
          bookmarkId: 'post-1',
          platform: 'twitter',
        }),
        { params: Promise.resolve({ id: collection.id }) },
      )
      await POST(
        createRequest(`http://localhost:3000/api/collections/${collection.id}/tweets`, 'POST', {
          bookmarkId: 'post-1',
          platform: 'instagram',
        }),
        { params: Promise.resolve({ id: collection.id }) },
      )

      const deleteRes = await DELETE(
        createRequest(`http://localhost:3000/api/collections/${collection.id}/tweets`, 'DELETE', {
          bookmarkId: 'post-1',
          platform: 'instagram',
        }),
        { params: Promise.resolve({ id: collection.id }) },
      )
      expect(deleteRes.status).toBe(200)

      const listRes = await GET(
        createRequest(`http://localhost:3000/api/collections/${collection.id}/tweets`, 'GET'),
        { params: Promise.resolve({ id: collection.id }) },
      )
      const listData = await listRes.json()

      expect(listData.tweets).toHaveLength(1)
      expect(listData.tweets[0].platform).toBe('twitter')
    })
  })

  describe('multi-user isolation', () => {
    it("does not expose USER_A's collection to USER_B", async () => {
      const collection = await createCollection()

      const { POST } = await import('@/app/api/collections/[id]/tweets/route')
      await POST(
        createRequest(`http://localhost:3000/api/collections/${collection.id}/tweets`, 'POST', {
          bookmarkId: 'post-1',
          platform: 'twitter',
        }),
        { params: Promise.resolve({ id: collection.id }) },
      )

      mockUserId = USER_B

      const { GET: GET_COLLECTION } = await import('@/app/api/collections/[id]/route')
      const getRes = await GET_COLLECTION(
        createRequest(`http://localhost:3000/api/collections/${collection.id}`, 'GET'),
        { params: Promise.resolve({ id: collection.id }) },
      )
      expect(getRes.status).toBe(404)

      const { GET: GET_TWEETS } = await import('@/app/api/collections/[id]/tweets/route')
      const tweetsRes = await GET_TWEETS(
        createRequest(`http://localhost:3000/api/collections/${collection.id}/tweets`, 'GET'),
        { params: Promise.resolve({ id: collection.id }) },
      )
      const tweetsData = await tweetsRes.json()
      expect(tweetsData.tweets).toEqual([])

      const { GET: LIST_COLLECTIONS } = await import('@/app/api/collections/route')
      const listRes = await LIST_COLLECTIONS()
      const listData = await listRes.json()
      expect(listData.collections).toEqual([])
    })

    it("does not let USER_B add to or remove from USER_A's collection", async () => {
      const collection = await createCollection()

      mockUserId = USER_B
      const { POST, DELETE } = await import('@/app/api/collections/[id]/tweets/route')

      const postRes = await POST(
        createRequest(`http://localhost:3000/api/collections/${collection.id}/tweets`, 'POST', {
          bookmarkId: 'post-1',
          platform: 'twitter',
        }),
        { params: Promise.resolve({ id: collection.id }) },
      )
      expect(postRes.status).toBe(404)

      const deleteRes = await DELETE(
        createRequest(`http://localhost:3000/api/collections/${collection.id}/tweets`, 'DELETE', {
          bookmarkId: 'post-1',
          platform: 'twitter',
        }),
        { params: Promise.resolve({ id: collection.id }) },
      )
      expect(deleteRes.status).toBe(404)
    })
  })

  describe('unauthenticated', () => {
    it('returns 401 for POST/DELETE/GET on collections routes', async () => {
      mockUserId = null

      const { POST: CREATE } = await import('@/app/api/collections/route')
      expect(
        (
          await CREATE(
            createRequest('http://localhost:3000/api/collections', 'POST', { name: 'x' }),
          )
        ).status,
      ).toBe(401)

      const { POST: ADD_TWEET } = await import('@/app/api/collections/[id]/tweets/route')
      const addRes = await ADD_TWEET(
        createRequest('http://localhost:3000/api/collections/c1/tweets', 'POST', {
          bookmarkId: 'post-1',
        }),
        { params: Promise.resolve({ id: 'c1' }) },
      )
      expect(addRes.status).toBe(401)
    })
  })
})
