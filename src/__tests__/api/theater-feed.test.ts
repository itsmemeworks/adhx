import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { createTestDb, createTestBookmark, type TestDbInstance } from './setup'
import {
  activity,
  tagShares,
  bookmarkTags,
  bookmarkMedia,
  bookmarkLinks,
  bookmarks,
  moderatedPosts,
  userBans,
  type NewActivity,
} from '@/lib/db/schema'

/**
 * Coverage for `getTheaterFeed()` (src/lib/theater/feed.ts) — the server-side
 * seed for the theater (docs/specs/theater-first.md §4).
 *
 * Mirrors the `@/lib/db` mock pattern used by the other trending tests
 * (trending-cache.test.ts) so `getTrendingItems()` (called internally) reads
 * the same in-memory database as the backfill queries.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { getTheaterFeed } from '@/lib/theater/feed'

/** getTheaterFeed's live pulse now restricts to the last 24h (LIVE_WINDOW_HOURS) — seed relative to now. */
const minsAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

function seedActivity(overrides: Partial<NewActivity> & { createdAt: string; bookmarkId: string }) {
  const row: NewActivity = {
    action: 'save',
    platform: 'twitter',
    author: 'someauthor',
    url: `/someauthor/status/${overrides.bookmarkId}`,
    ...overrides,
  }
  testInstance.db.insert(activity).values(row).run()
}

/** Seed a bookmark tagged with a PUBLICLY shared tag, for backfill coverage. */
function seedPublicTagBookmark(opts: {
  userId: string
  tag: string
  bookmarkId: string
  platform?: string
  author?: string
  processedAt?: string
}) {
  const platform = opts.platform ?? 'twitter'
  testInstance.db
    .insert(tagShares)
    .values({
      userId: opts.userId,
      tag: opts.tag,
      shareCode: `${opts.userId}-${opts.tag}`,
      isPublic: true,
    })
    .onConflictDoNothing()
    .run()
  testInstance.db
    .insert(bookmarks)
    .values(
      createTestBookmark(opts.userId, opts.bookmarkId, {
        platform,
        author: opts.author ?? 'publicauthor',
        processedAt: opts.processedAt ?? new Date().toISOString(),
      }),
    )
    .run()
  testInstance.db
    .insert(bookmarkTags)
    .values({ userId: opts.userId, platform, bookmarkId: opts.bookmarkId, tag: opts.tag })
    .run()
}

describe('getTheaterFeed', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('returns the live trending items unchanged when there are enough of them', async () => {
    for (let i = 0; i < 15; i++) {
      seedActivity({ bookmarkId: `t${i}`, createdAt: minsAgo(i + 1) })
    }

    const seed = await getTheaterFeed()

    expect(seed.items).toHaveLength(15)
    expect(seed.items.every((item) => item.action === 'save')).toBe(true)
  })

  it('backfills from public tags when the live pulse is short', async () => {
    // Only 3 live activity events — below THEATER_MIN_ITEMS (12).
    seedActivity({ bookmarkId: 'live1', createdAt: '2026-06-06T10:00:00Z' })
    seedActivity({ bookmarkId: 'live2', createdAt: '2026-06-06T10:01:00Z' })
    seedActivity({ bookmarkId: 'live3', createdAt: '2026-06-06T10:02:00Z' })

    for (let i = 0; i < 10; i++) {
      seedPublicTagBookmark({ userId: 'curator', tag: 'faves', bookmarkId: `pub${i}` })
    }

    const seed = await getTheaterFeed()

    expect(seed.items.length).toBeGreaterThan(3)
    const backfilled = seed.items.filter((item) => item.bookmarkId?.startsWith('pub'))
    expect(backfilled.length).toBeGreaterThan(0)
  })

  it('never includes a userId key on any returned item, live or backfilled', async () => {
    seedActivity({ bookmarkId: 'live1', createdAt: '2026-06-06T10:00:00Z' })
    for (let i = 0; i < 10; i++) {
      seedPublicTagBookmark({ userId: 'curator', tag: 'faves', bookmarkId: `pub${i}` })
    }

    const seed = await getTheaterFeed()

    expect(seed.items.length).toBeGreaterThan(0)
    for (const item of seed.items) {
      expect(Object.keys(item)).not.toContain('userId')
    }
  })

  it('dedupes backfill against posts already present from the live pulse', async () => {
    // Same post (twitter:dup1) is both live-recorded AND behind a public tag.
    seedActivity({ bookmarkId: 'dup1', createdAt: '2026-06-06T10:00:00Z' })
    seedPublicTagBookmark({ userId: 'curator', tag: 'faves', bookmarkId: 'dup1' })
    for (let i = 0; i < 10; i++) {
      seedPublicTagBookmark({ userId: 'curator', tag: 'faves', bookmarkId: `pub${i}` })
    }

    const seed = await getTheaterFeed()

    const dupCount = seed.items.filter((item) => item.bookmarkId === 'dup1').length
    expect(dupCount).toBe(1)
  })

  it('ignores a private tag when backfilling', async () => {
    seedActivity({ bookmarkId: 'live1', createdAt: '2026-06-06T10:00:00Z' })
    testInstance.db
      .insert(tagShares)
      .values({ userId: 'curator', tag: 'secret', shareCode: 'curator-secret', isPublic: false })
      .run()
    testInstance.db
      .insert(bookmarks)
      .values(createTestBookmark('curator', 'private1', { platform: 'twitter' }))
      .run()
    testInstance.db
      .insert(bookmarkTags)
      .values({ userId: 'curator', platform: 'twitter', bookmarkId: 'private1', tag: 'secret' })
      .run()

    const seed = await getTheaterFeed()

    expect(seed.items.some((item) => item.bookmarkId === 'private1')).toBe(false)
  })

  it('excludes hidden posts while preserving visible public-tag backfill order', async () => {
    seedActivity({ bookmarkId: 'live1', createdAt: minsAgo(5) })
    seedPublicTagBookmark({
      userId: 'curator',
      tag: 'faves',
      bookmarkId: 'visible-newer',
      processedAt: '2026-08-20T12:00:00.000Z',
    })
    seedPublicTagBookmark({
      userId: 'curator',
      tag: 'faves',
      bookmarkId: 'hidden-middle',
      processedAt: '2026-08-20T11:00:00.000Z',
    })
    seedPublicTagBookmark({
      userId: 'curator',
      tag: 'faves',
      bookmarkId: 'visible-older',
      processedAt: '2026-08-20T10:00:00.000Z',
    })
    testInstance.db
      .insert(moderatedPosts)
      .values({
        platform: 'twitter',
        bookmarkId: 'hidden-middle',
        hidden: 1,
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
      })
      .run()

    const seed = await getTheaterFeed()
    const backfillIds = seed.items
      .map((item) => item.bookmarkId)
      .filter((id) => id?.startsWith('visible') || id === 'hidden-middle')

    expect(backfillIds).toEqual(['visible-newer', 'visible-older'])
  })

  it('returns an empty feed when post moderation storage is unreadable', async () => {
    seedActivity({ bookmarkId: 'live1', createdAt: minsAgo(5) })
    seedPublicTagBookmark({ userId: 'curator', tag: 'faves', bookmarkId: 'uncertain' })
    testInstance.sqlite.exec('DROP TABLE moderated_posts')

    const seed = await getTheaterFeed()

    expect(seed).toEqual({ items: [], savedToday: 0, recentActivity: 0 })
  })

  it('excludes backfill rows owned by banned curators', async () => {
    seedPublicTagBookmark({ userId: 'allowed-curator', tag: 'faves', bookmarkId: 'allowed' })
    seedPublicTagBookmark({ userId: 'banned-curator', tag: 'faves', bookmarkId: 'banned' })
    testInstance.db
      .insert(userBans)
      .values({
        userId: 'banned-curator',
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
      })
      .run()

    const seed = await getTheaterFeed()

    expect(seed.items.map((item) => item.bookmarkId)).toContain('allowed')
    expect(seed.items.map((item) => item.bookmarkId)).not.toContain('banned')
  })

  it('returns an empty feed when the ban store is unreadable', async () => {
    seedActivity({ bookmarkId: 'live1', createdAt: minsAgo(5) })
    seedPublicTagBookmark({ userId: 'curator', tag: 'faves', bookmarkId: 'uncertain' })
    testInstance.sqlite.exec('DROP TABLE user_bans')

    const seed = await getTheaterFeed()

    expect(seed).toEqual({ items: [], savedToday: 0, recentActivity: 0 })
  })

  it('scopes media to the exact curator tuple when owners saved the same post id', async () => {
    seedPublicTagBookmark({
      userId: 'older-curator',
      tag: 'faves',
      bookmarkId: 'shared-id',
      author: 'older-author',
      processedAt: '2026-08-20T10:00:00.000Z',
    })
    seedPublicTagBookmark({
      userId: 'newer-curator',
      tag: 'faves',
      bookmarkId: 'shared-id',
      author: 'newer-author',
      processedAt: '2026-08-20T12:00:00.000Z',
    })
    testInstance.db
      .update(bookmarks)
      .set({ text: 'newer curator metadata' })
      .where(and(eq(bookmarks.userId, 'newer-curator'), eq(bookmarks.id, 'shared-id')))
      .run()
    testInstance.db
      .insert(bookmarkMedia)
      .values([
        {
          id: 'older-media',
          userId: 'older-curator',
          platform: 'twitter',
          bookmarkId: 'shared-id',
          mediaType: 'photo',
          originalUrl: 'https://private.example/older.jpg',
        },
        {
          id: 'newer-media',
          userId: 'newer-curator',
          platform: 'twitter',
          bookmarkId: 'shared-id',
          mediaType: 'photo',
          originalUrl: 'https://public.example/newer.jpg',
        },
      ])
      .run()

    const seed = await getTheaterFeed()
    const item = seed.items.find((candidate) => candidate.bookmarkId === 'shared-id')

    expect(item?.author).toBe('newer-author')
    expect(item?.text).toBe('newer curator metadata')
    expect(item?.thumbnailUrl).toBe('https://public.example/newer.jpg')
    expect(JSON.stringify(item)).not.toContain('older-curator')
    expect(JSON.stringify(item)).not.toContain('newer-curator')
  })

  it('degrades to the plain trending items when the backfill query fails', async () => {
    seedActivity({ bookmarkId: 'live1', createdAt: minsAgo(5) })
    // Drop a table the backfill query depends on so it throws.
    testInstance.sqlite.exec('DROP TABLE tag_shares')

    const seed = await getTheaterFeed()

    expect(seed.items).toHaveLength(1)
    expect(seed.items[0].bookmarkId).toBe('live1')
  })

  it('resolves a thumbnail from the first attached media on a backfilled item', async () => {
    seedActivity({ bookmarkId: 'live1', createdAt: '2026-06-06T10:00:00Z' })
    seedPublicTagBookmark({ userId: 'curator', tag: 'faves', bookmarkId: 'pubmedia' })
    for (let i = 0; i < 10; i++) {
      seedPublicTagBookmark({ userId: 'curator', tag: 'faves', bookmarkId: `pub${i}` })
    }
    testInstance.db
      .insert(bookmarkMedia)
      .values({
        id: 'pubmedia_0',
        userId: 'curator',
        platform: 'twitter',
        bookmarkId: 'pubmedia',
        mediaType: 'photo',
        originalUrl: 'https://example.com/photo.jpg',
        previewUrl: 'https://example.com/photo-preview.jpg',
      })
      .run()

    const seed = await getTheaterFeed()

    const item = seed.items.find((i) => i.bookmarkId === 'pubmedia')
    expect(item?.thumbnailUrl).toBe('https://example.com/photo-preview.jpg')
    expect(item?.contentType).toBe('photo')
  })

  /**
   * Owner report: playlist time chips looked like they showed the source
   * network's post date. Backfilled items carried `bookmarks.createdAt` (the
   * X publish date) as their event time and no `addedAt` at all — so the chip
   * (which reads `addedAt`) vanished, and a post's publish date drove the
   * merge's freshness comparison. Both times are ADHX-side now.
   */
  it('times a backfilled item by when it was added to ADHX, not when it was posted', async () => {
    seedActivity({ bookmarkId: 'live1', createdAt: '2026-06-06T10:00:00Z' })
    const postedAt = '2019-03-04T09:00:00.000Z'
    const addedToAdhxAt = '2026-08-20T12:34:56.000Z'
    testInstance.db
      .insert(tagShares)
      .values({ userId: 'curator', tag: 'faves', shareCode: 'curator-faves', isPublic: true })
      .onConflictDoNothing()
      .run()
    seedPublicTagBookmark({
      userId: 'curator',
      tag: 'faves',
      bookmarkId: 'oldpost',
      processedAt: addedToAdhxAt,
    })
    testInstance.db
      .update(bookmarks)
      .set({ createdAt: postedAt })
      .where(eq(bookmarks.id, 'oldpost'))
      .run()

    const seed = await getTheaterFeed()

    const item = seed.items.find((i) => i.bookmarkId === 'oldpost')
    expect(item?.addedAt).toBe(addedToAdhxAt)
    expect(item?.createdAt).toBe(addedToAdhxAt)
    expect(item?.createdAt).not.toBe(postedAt)
  })

  // spec §6b — link expansions attached via the live getTrendingItems() path
  // (getTheaterFeed passes live items through unchanged).
  it('attaches textLinks from bookmark_links for a saved post', async () => {
    seedActivity({ bookmarkId: 'linked1', createdAt: minsAgo(5) })
    testInstance.db
      .insert(bookmarks)
      .values(createTestBookmark('owner-1', 'linked1', { platform: 'twitter' }))
      .run()
    testInstance.db
      .insert(bookmarkLinks)
      .values({
        userId: 'owner-1',
        platform: 'twitter',
        bookmarkId: 'linked1',
        originalUrl: 'https://t.co/abc123',
        expandedUrl: 'https://example.com/article',
        linkType: 'link',
      })
      .run()

    const seed = await getTheaterFeed()

    const item = seed.items.find((i) => i.bookmarkId === 'linked1')
    expect(item?.textLinks).toEqual([
      {
        shortUrl: 'https://t.co/abc123',
        expandedUrl: 'https://example.com/article',
        linkType: 'link',
      },
    ])
    // No extra keys leak onto the TextLinkRef shape.
    expect(Object.keys(item!.textLinks![0]).sort()).toEqual(
      ['expandedUrl', 'linkType', 'shortUrl'].sort(),
    )
  })

  it('leaves textLinks absent for a post with no bookmark_links row (preview-only)', async () => {
    seedActivity({ bookmarkId: 'nolinks', createdAt: '2026-06-06T10:00:00Z' })

    const seed = await getTheaterFeed()

    const item = seed.items.find((i) => i.bookmarkId === 'nolinks')
    expect(item?.textLinks).toBeUndefined()
  })
})
