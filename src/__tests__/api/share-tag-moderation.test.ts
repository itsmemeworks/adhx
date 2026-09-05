import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestBookmark, createTestDb, type TestDbInstance, USER_A, USER_B } from './setup'

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
  getCurrentUserId: vi.fn(async () => USER_A),
}))
vi.mock('@/lib/discovery/record', () => ({ recordCollectionEvent: vi.fn() }))

const pairs = [
  { id: 'collision', platform: 'twitter', text: 'Hidden tweet' },
  { id: 'collision', platform: 'instagram', text: 'Visible reel' },
  { id: 'already-saved', platform: 'twitter', text: 'Hidden existing save' },
]

async function hideTwitterPosts() {
  await testInstance.db.insert(schema.moderatedPosts).values(
    pairs
      .filter((pair) => pair.platform === 'twitter')
      .map((pair) => ({
        platform: pair.platform,
        bookmarkId: pair.id,
        hidden: 1,
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
      })),
  )
}

async function readPlaylist(variant: string) {
  const req = new NextRequest('http://localhost:3000/api/share/tag/public-code')
  if (variant === 'code') {
    const { GET } = await import('@/app/api/share/tag/[code]/route')
    return GET(req, { params: Promise.resolve({ code: 'public-code' }) })
  }
  const { GET } = await import('@/app/api/share/tag/by-name/[username]/[tag]/route')
  return GET(req, { params: Promise.resolve({ username: 'curator', tag: 'playlist' }) })
}

async function clonePlaylist(variant: string) {
  const req = new NextRequest('http://localhost:3000/api/share/tag/public-code/clone', {
    method: 'POST',
  })
  if (variant === 'code') {
    const { POST } = await import('@/app/api/share/tag/[code]/clone/route')
    return POST(req, { params: Promise.resolve({ code: 'public-code' }) })
  }
  const { POST } = await import('@/app/api/share/tag/by-name/[username]/[tag]/clone/route')
  return POST(req, { params: Promise.resolve({ username: 'curator', tag: 'playlist' }) })
}

describe.each(['code', 'by-name'])('Public playlist moderation (%s)', (variant) => {
  beforeEach(async () => {
    testInstance = createTestDb()
    vi.clearAllMocks()
    await testInstance.db.insert(schema.users).values({ id: USER_B, username: 'curator' })
    await testInstance.db.insert(schema.tagShares).values({
      userId: USER_B,
      tag: 'playlist',
      shareCode: 'public-code',
      isPublic: true,
    })
    for (const pair of pairs) {
      await testInstance.db
        .insert(schema.bookmarks)
        .values(createTestBookmark(USER_B, pair.id, pair))
      await testInstance.db.insert(schema.bookmarkTags).values({
        userId: USER_B,
        platform: pair.platform,
        bookmarkId: pair.id,
        tag: 'playlist',
      })
      await testInstance.db.insert(schema.bookmarkMedia).values({
        userId: USER_B,
        platform: pair.platform,
        bookmarkId: pair.id,
        id: `${pair.platform}-${pair.id}`,
        mediaType: 'photo',
        originalUrl: 'https://example.com/photo.jpg',
      })
      await testInstance.db.insert(schema.bookmarkLinks).values({
        userId: USER_B,
        platform: pair.platform,
        bookmarkId: pair.id,
        expandedUrl: 'https://example.com/article',
        linkType: 'article',
      })
    }
  })
  afterEach(() => testInstance.close())

  it('rechecks hidden posts, filters counts and media by platform, and disables response caching', async () => {
    expect((await (await readPlaylist(variant)).json()).tweetCount).toBe(3)
    await hideTwitterPosts()
    const response = await readPlaylist(variant)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const data = await response.json()
    expect(data.tweetCount).toBe(1)
    expect(data.tweets).toHaveLength(1)
    expect(data.tweets[0].text).toBe('Visible reel')
    expect(data.tweets[0].media.map((media: { id: string }) => media.id)).toEqual([
      'instagram-collision',
    ])
  })

  it('never clones hidden posts, their media or links, or tags an existing hidden save', async () => {
    await hideTwitterPosts()
    await testInstance.db
      .insert(schema.bookmarks)
      .values(createTestBookmark(USER_A, 'already-saved'))
    // A hidden same-id bookmark in the recipient must not inflate skipped counts.
    await testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, 'collision'))
    const response = await clonePlaylist(variant)
    expect(response.status).toBe(200)
    const data = await response.json()
    if (variant === 'code') {
      expect(data).toMatchObject({ cloned: 1, skipped: 0, total: 1, clonedIds: ['collision'] })
    } else {
      expect(data).toMatchObject({ clonedCount: 1, taggedCount: 1 })
    }
    const saved = await testInstance.db
      .select()
      .from(schema.bookmarks)
      .where(eq(schema.bookmarks.userId, USER_A))
    expect(saved).toHaveLength(3)
    for (const table of [schema.bookmarkTags, schema.bookmarkMedia, schema.bookmarkLinks]) {
      const rows = await testInstance.db.select().from(table).where(eq(table.userId, USER_A))
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ bookmarkId: 'collision', platform: 'instagram' })
    }
  })

  it('returns an empty success without writes when every post is hidden', async () => {
    await hideTwitterPosts()
    await testInstance.db.insert(schema.moderatedPosts).values({
      platform: 'instagram',
      bookmarkId: 'collision',
      hidden: 1,
      createdAt: new Date().toISOString(),
      createdBy: 'admin',
    })
    expect((await (await readPlaylist(variant)).json()).tweetCount).toBe(0)
    const response = await clonePlaylist(variant)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(variant === 'code' ? data.cloned : data.clonedCount).toBe(0)
    expect(
      await testInstance.db
        .select()
        .from(schema.bookmarkTags)
        .where(eq(schema.bookmarkTags.userId, USER_A)),
    ).toEqual([])
  })

  it.each(['banned owner', 'missing bans', 'missing moderation'])(
    'withholds reads and prevents all clone writes with %s',
    async (condition) => {
      // Confirm previously visible content is no longer exposed after moderation changes.
      expect((await readPlaylist(variant)).status).toBe(200)
      if (condition === 'banned owner') {
        await testInstance.db.insert(schema.userBans).values({
          userId: USER_B,
          createdAt: new Date().toISOString(),
          createdBy: 'admin',
        })
      } else if (condition === 'missing bans') {
        testInstance.sqlite.exec('DROP TABLE user_bans')
      } else {
        testInstance.sqlite.exec('DROP TABLE moderated_posts')
      }
      const response = await readPlaylist(variant)
      expect(response.status).toBe(404)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({ error: 'Tag not found' })
      expect((await clonePlaylist(variant)).status).toBe(404)
      for (const table of [
        schema.bookmarks,
        schema.bookmarkTags,
        schema.bookmarkMedia,
        schema.bookmarkLinks,
      ]) {
        expect(await testInstance.db.select().from(table).where(eq(table.userId, USER_A))).toEqual(
          [],
        )
      }
      const { recordCollectionEvent } = await import('@/lib/discovery/record')
      expect(recordCollectionEvent).not.toHaveBeenCalled()
    },
  )
})
