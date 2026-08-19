import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, createTestBookmark, type TestDbInstance } from './setup'
import {
  activity,
  tagShares,
  bookmarkTags,
  bookmarkMedia,
  bookmarks,
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
      seedActivity({ bookmarkId: `t${i}`, createdAt: `2026-06-06T10:0${i % 10}:00Z` })
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

  it('degrades to the plain trending items when the backfill query fails', async () => {
    seedActivity({ bookmarkId: 'live1', createdAt: '2026-06-06T10:00:00Z' })
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
})
