import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from './api/setup'
import { activity, bookmarks, type NewActivity } from '@/lib/db/schema'

/**
 * `src/lib/trending/archive.ts` data-layer tests: week bucketing/dedup,
 * current-week exclusion, and the anonymity invariant it must uphold
 * alongside `./query` (see trending-anonymity.test.ts for the sibling suite).
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import {
  listArchiveWeeks,
  getArchiveItems,
  isoWeekOf,
  isoWeekSlugOf,
  isoWeekRange,
  currentIsoWeekSlug,
  shiftWeekSlug,
} from '@/lib/trending/archive'

const SECRET_USER = 'secret-user-should-never-leak'

// A week comfortably clear of "now", computed relative to the real current
// week so this suite never accidentally targets the in-progress week
// regardless of what day it's run.
const PAST_SLUG = shiftWeekSlug(currentIsoWeekSlug(), -6)!
const PAST_START = isoWeekRange(
  Number(PAST_SLUG.split('-w')[0]),
  Number(PAST_SLUG.split('-w')[1]),
).start

function isoAt(dayOffset: number, hour = 12): string {
  const d = new Date(PAST_START.getTime())
  d.setUTCDate(d.getUTCDate() + dayOffset)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString()
}

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

describe('trending archive', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  describe('listArchiveWeeks', () => {
    it('buckets activity into the correct ISO week and dedupes per post', async () => {
      // Two events for the same post within the week — counts once.
      seedActivity({ bookmarkId: 'a', createdAt: isoAt(0), action: 'preview' })
      seedActivity({ bookmarkId: 'a', createdAt: isoAt(1), action: 'save' })
      // A different post, same week.
      seedActivity({ bookmarkId: 'b', createdAt: isoAt(2) })

      const weeks = await listArchiveWeeks()
      const found = weeks.find((w) => w.slug === PAST_SLUG)
      expect(found).toBeDefined()
      expect(found!.itemCount).toBe(2)
    })

    it('excludes the current in-progress week', async () => {
      seedActivity({ bookmarkId: 'now-1', createdAt: new Date().toISOString() })
      seedActivity({ bookmarkId: 'past-1', createdAt: isoAt(0) })

      const weeks = await listArchiveWeeks()
      expect(weeks.some((w) => w.slug === currentIsoWeekSlug())).toBe(false)
      expect(weeks.some((w) => w.slug === PAST_SLUG)).toBe(true)
    })

    it('orders weeks newest first', async () => {
      const olderSlug = shiftWeekSlug(PAST_SLUG, -2)!
      const olderParts = olderSlug.split('-w')
      const olderStart = isoWeekRange(Number(olderParts[0]), Number(olderParts[1])).start

      seedActivity({ bookmarkId: 'recent', createdAt: isoAt(0) })
      seedActivity({
        bookmarkId: 'older',
        createdAt: new Date(olderStart.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      })

      const weeks = await listArchiveWeeks()
      const recentIdx = weeks.findIndex((w) => w.slug === PAST_SLUG)
      const olderIdx = weeks.findIndex((w) => w.slug === olderSlug)
      expect(recentIdx).toBeGreaterThanOrEqual(0)
      expect(olderIdx).toBeGreaterThan(recentIdx)
    })

    it('never exposes userId', async () => {
      seedActivity({ bookmarkId: 'a', createdAt: isoAt(0), userId: SECRET_USER })
      const weeks = await listArchiveWeeks()
      expect(JSON.stringify(weeks)).not.toContain(SECRET_USER)
      for (const w of weeks) {
        expect(w).not.toHaveProperty('userId')
      }
    })
  })

  describe('getArchiveItems', () => {
    it('returns null for an unparseable slug', async () => {
      expect(await getArchiveItems('not-a-week')).toBeNull()
    })

    it('returns null for the current in-progress week', async () => {
      seedActivity({ bookmarkId: 'a', createdAt: new Date().toISOString() })
      expect(await getArchiveItems(currentIsoWeekSlug())).toBeNull()
    })

    it('returns null for a valid, empty week', async () => {
      expect(await getArchiveItems(PAST_SLUG)).toBeNull()
    })

    it('only includes activity within the week range (boundary-exclusive at the end)', async () => {
      seedActivity({ bookmarkId: 'in-week', createdAt: isoAt(0, 0) }) // Monday 00:00 — inclusive start
      seedActivity({ bookmarkId: 'before', createdAt: isoAt(-1) }) // previous week
      seedActivity({ bookmarkId: 'after', createdAt: isoAt(7, 0) }) // next week's Monday 00:00 — exclusive end

      const result = await getArchiveItems(PAST_SLUG)
      expect(result).not.toBeNull()
      const ids = result!.items.map((i) => i.bookmarkId)
      expect(ids).toContain('in-week')
      expect(ids).not.toContain('before')
      expect(ids).not.toContain('after')
    })

    it('dedupes multiple events for the same post, keeping the newest', async () => {
      seedActivity({
        bookmarkId: 'a',
        createdAt: isoAt(0),
        action: 'preview',
        text: 'old preview text',
      })
      seedActivity({
        bookmarkId: 'a',
        createdAt: isoAt(1),
        action: 'save',
        text: 'newer save text',
      })

      const result = await getArchiveItems(PAST_SLUG)
      expect(result!.items.filter((i) => i.bookmarkId === 'a')).toHaveLength(1)
      expect(result!.items.find((i) => i.bookmarkId === 'a')?.text).toBe('newer save text')
      expect(result!.totalCount).toBe(1)
    })

    it('ranks by save count then recency', async () => {
      seedActivity({ bookmarkId: 'popular', createdAt: isoAt(0) })
      seedActivity({ bookmarkId: 'unpopular-but-newer', createdAt: isoAt(2) })

      testInstance.db
        .insert(bookmarks)
        .values([
          {
            id: 'popular',
            userId: 'user-1',
            author: 'someauthor',
            text: 'popular post',
            tweetUrl: 'https://x.com/someauthor/status/popular',
            processedAt: new Date().toISOString(),
          },
          {
            id: 'popular',
            userId: 'user-2',
            author: 'someauthor',
            text: 'popular post',
            tweetUrl: 'https://x.com/someauthor/status/popular',
            processedAt: new Date().toISOString(),
          },
        ])
        .run()

      const result = await getArchiveItems(PAST_SLUG)
      expect(result!.items[0].bookmarkId).toBe('popular')
      expect(result!.items[0].saveCount).toBe(2)
    })

    it('never exposes userId even through the enriched bookmark join', async () => {
      testInstance.db
        .insert(bookmarks)
        .values({
          id: 'tweet-99',
          userId: SECRET_USER,
          author: 'someauthor',
          text: 'a saved tweet',
          tweetUrl: 'https://x.com/someauthor/status/tweet-99',
          processedAt: new Date().toISOString(),
        })
        .run()
      seedActivity({ bookmarkId: 'tweet-99', createdAt: isoAt(0), userId: SECRET_USER })

      const result = await getArchiveItems(PAST_SLUG)
      expect(result).not.toBeNull()
      expect(JSON.stringify(result)).not.toContain(SECRET_USER)
      for (const item of result!.items) {
        expect(item).not.toHaveProperty('userId')
      }
    })

    it('caps items at 50 per week', async () => {
      for (let i = 0; i < 60; i++) {
        seedActivity({ bookmarkId: `post-${i}`, createdAt: isoAt(0, i % 24) })
      }
      const result = await getArchiveItems(PAST_SLUG)
      expect(result!.items.length).toBe(50)
      expect(result!.totalCount).toBe(60)
    })
  })

  describe('isoWeekSlugOf sanity vs. seeded fixtures', () => {
    it('PAST_SLUG round-trips through isoWeekOf', () => {
      expect(isoWeekSlugOf(isoWeekOf(PAST_START))).toBe(PAST_SLUG)
    })
  })
})
