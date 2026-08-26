import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from './api/setup'
import { activity, type NewActivity } from '@/lib/db/schema'

/**
 * Regression coverage for the short-lived cache added around
 * `getTrendingItems()` (src/lib/trending/query.ts) — a burst-absorbing TTL
 * cache in front of the public trending/activity read path.
 *
 * Two things must hold:
 *  1. Repeated calls within the TTL window return the SAME cached value
 *     without re-querying (this is the whole point of the cache).
 *  2. The cache must never bleed between distinct `db` instances — otherwise
 *     a fresh test database (or, in principle, any future reconnect) could
 *     serve stale data from an unrelated database.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { getTrendingItems } from '@/lib/trending/query'

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

describe('getTrendingItems cache', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('returns a cached result for a repeated call within the TTL window', async () => {
    seedActivity({ bookmarkId: '1', createdAt: '2026-06-06T10:00:00Z' })

    const first = await getTrendingItems()
    expect(first.items).toHaveLength(1)

    // Insert a second row directly — a fresh (uncached) query would now see 2
    // items. If the cache is working, the next call still returns the first
    // snapshot.
    seedActivity({ bookmarkId: '2', createdAt: '2026-06-06T11:00:00Z' })

    const second = await getTrendingItems()
    expect(second.items).toHaveLength(1)
    expect(second).toEqual(first)
  })

  it('does not bleed cached results across different db instances', async () => {
    seedActivity({ bookmarkId: 'a', createdAt: '2026-06-06T10:00:00Z' })
    const fromFirstDb = await getTrendingItems()
    expect(fromFirstDb.items).toHaveLength(1)
    expect(fromFirstDb.items[0].bookmarkId).toBe('a')

    // Swap in a brand-new db instance, as a fresh test (or a real reconnect)
    // would. The same default-args call must reflect the NEW instance's data,
    // not the previous instance's cached value.
    testInstance.close()
    testInstance = createTestDb()
    seedActivity({ bookmarkId: 'b', createdAt: '2026-06-06T10:00:00Z' })

    const fromSecondDb = await getTrendingItems()
    expect(fromSecondDb.items).toHaveLength(1)
    expect(fromSecondDb.items[0].bookmarkId).toBe('b')
  })

  it('keeps platform-filtered canonical windows distinct', async () => {
    seedActivity({ bookmarkId: 'tw', platform: 'twitter', createdAt: '2026-06-06T10:00:00Z' })
    seedActivity({
      bookmarkId: 'tk',
      platform: 'tiktok',
      author: 'tkuser',
      url: '/@tkuser/video/tk',
      createdAt: '2026-06-06T11:00:00Z',
    })

    const all = await getTrendingItems()
    const twitterOnly = await getTrendingItems({ platform: 'twitter' })

    expect(all.items.length).toBe(2)
    expect(twitterOnly.items.length).toBe(1)
    expect(twitterOnly.items[0].platform).toBe('twitter')
  })

  it('applies minTrend to the canonical window before pagination', async () => {
    seedActivity({
      bookmarkId: 'hot',
      action: 'preview',
      createdAt: '2026-06-06T10:00:00Z',
    })
    seedActivity({
      bookmarkId: 'cold',
      action: 'save',
      createdAt: '2026-06-06T11:00:00Z',
    })

    const result = await getTrendingItems({ minTrend: 1, limit: 1 })

    expect(result.items.map((item) => item.bookmarkId)).toEqual(['hot'])
    expect(result.hasMore).toBe(false)
  })

  it('reuses one canonical cache window across limit and offset combinations', async () => {
    seedActivity({ bookmarkId: 'old', createdAt: '2026-06-06T10:00:00Z' })
    seedActivity({ bookmarkId: 'new', createdAt: '2026-06-06T11:00:00Z' })

    expect((await getTrendingItems({ limit: 1 })).items[0].bookmarkId).toBe('new')

    // A separately-keyed offset query would see this newly inserted row and
    // return "new" at offset 1. The canonical cached window remains
    // ["new", "old"], so offset 1 deterministically returns "old".
    seedActivity({ bookmarkId: 'newest', createdAt: '2026-06-06T12:00:00Z' })
    const secondPage = await getTrendingItems({ limit: 1, offset: 1 })

    expect(secondPage.items.map((item) => item.bookmarkId)).toEqual(['old'])
  })
})
