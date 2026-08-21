import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from './setup'
import {
  collectionEvents,
  tagShares,
  users,
  bookmarks,
  bookmarkTags,
  bookmarkMedia,
  type NewCollectionEvent,
} from '@/lib/db/schema'

/**
 * Coverage for `src/lib/discovery/rank.ts` — the single audited read choke
 * point over `collection_events`. See that file's header comment for the
 * anonymity invariant (checked separately in discovery-anonymity.test.ts).
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import {
  getCollectionLeaderboard,
  getOwnerCollectionStats,
  slugToWindow,
  windowToPath,
} from '@/lib/discovery/rank'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function iso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString()
}

function seedUser(id: string, username: string) {
  testInstance.db.insert(users).values({ id, username }).run()
}

function seedShare(userId: string, tag: string, isPublic = true) {
  testInstance.db
    .insert(tagShares)
    .values({ userId, tag, shareCode: `${userId}-${tag}`, isPublic })
    .run()
}

function seedEvent(
  overrides: Partial<NewCollectionEvent> & { ownerUserId: string; tag: string; createdAt: string },
) {
  const row: NewCollectionEvent = {
    action: 'view',
    hidden: 0,
    ...overrides,
  }
  testInstance.db.insert(collectionEvents).values(row).run()
}

describe('getCollectionLeaderboard', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('window boundaries: day includes events within 24h and excludes older ones', () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'inside')
    seedShare('u1', 'outside')
    seedEvent({ ownerUserId: 'u1', tag: 'inside', createdAt: iso(HOUR) })
    seedEvent({ ownerUserId: 'u1', tag: 'outside', createdAt: iso(25 * HOUR) })

    const items = getCollectionLeaderboard({ window: 'day' })
    const tags = items.map((i) => i.tag)
    expect(tags).toContain('inside')
    expect(tags).not.toContain('outside')
  })

  it('window boundaries: week includes events within 7d and excludes older ones', () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'inside')
    seedShare('u1', 'outside')
    seedEvent({ ownerUserId: 'u1', tag: 'inside', createdAt: iso(6 * DAY) })
    seedEvent({ ownerUserId: 'u1', tag: 'outside', createdAt: iso(8 * DAY) })

    const items = getCollectionLeaderboard({ window: 'week' })
    const tags = items.map((i) => i.tag)
    expect(tags).toContain('inside')
    expect(tags).not.toContain('outside')
  })

  it('window boundaries: month includes events within 30d and excludes older ones', () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'inside')
    seedShare('u1', 'outside')
    seedEvent({ ownerUserId: 'u1', tag: 'inside', createdAt: iso(29 * DAY) })
    seedEvent({ ownerUserId: 'u1', tag: 'outside', createdAt: iso(31 * DAY) })

    const items = getCollectionLeaderboard({ window: 'month' })
    const tags = items.map((i) => i.tag)
    expect(tags).toContain('inside')
    expect(tags).not.toContain('outside')
  })

  it("window 'all' includes everything regardless of age", () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'ancient')
    seedEvent({ ownerUserId: 'u1', tag: 'ancient', createdAt: iso(365 * DAY) })

    const items = getCollectionLeaderboard({ window: 'all' })
    expect(items.map((i) => i.tag)).toContain('ancient')
  })

  it('weighs a clone as 5x a view in the score', () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'clones')
    seedUser('u2', 'bob')
    seedShare('u2', 'views')

    // 5 views vs 1 clone — should score identically (5 == 5*1).
    for (let i = 0; i < 5; i++) {
      seedEvent({ ownerUserId: 'u2', tag: 'views', action: 'view', createdAt: iso(HOUR) })
    }
    seedEvent({ ownerUserId: 'u1', tag: 'clones', action: 'clone', createdAt: iso(HOUR) })

    const items = getCollectionLeaderboard({ window: 'week' })
    const clonesEntry = items.find((i) => i.tag === 'clones')!
    const viewsEntry = items.find((i) => i.tag === 'views')!
    expect(clonesEntry.score).toBe(5)
    expect(viewsEntry.score).toBe(5)
    expect(clonesEntry.cloneCount).toBe(1)
    expect(clonesEntry.viewCount).toBe(0)
    expect(viewsEntry.viewCount).toBe(5)
  })

  it('excludes tags that are not public, even with events', () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'private-tag', false)
    seedEvent({ ownerUserId: 'u1', tag: 'private-tag', createdAt: iso(HOUR) })

    const items = getCollectionLeaderboard({ window: 'week' })
    expect(items.map((i) => i.tag)).not.toContain('private-tag')
  })

  it('excludes events with a tag_shares row that has no matching public row at all', () => {
    seedUser('u1', 'alice')
    // No tag_shares row inserted for this tag at all.
    seedEvent({ ownerUserId: 'u1', tag: 'unshared', createdAt: iso(HOUR) })

    const items = getCollectionLeaderboard({ window: 'week' })
    expect(items.map((i) => i.tag)).not.toContain('unshared')
  })

  it('excludes hidden events', () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'ok')
    seedShare('u1', 'spammy')
    seedEvent({ ownerUserId: 'u1', tag: 'ok', createdAt: iso(HOUR) })
    seedEvent({ ownerUserId: 'u1', tag: 'spammy', createdAt: iso(HOUR), hidden: 1 })

    const items = getCollectionLeaderboard({ window: 'week' })
    const tags = items.map((i) => i.tag)
    expect(tags).toContain('ok')
    expect(tags).not.toContain('spammy')
  })

  it('breaks ties by most recent event', () => {
    seedUser('u1', 'alice')
    seedUser('u2', 'bob')
    seedShare('u1', 'older')
    seedShare('u2', 'newer')
    seedEvent({ ownerUserId: 'u1', tag: 'older', action: 'view', createdAt: iso(5 * HOUR) })
    seedEvent({ ownerUserId: 'u2', tag: 'newer', action: 'view', createdAt: iso(HOUR) })

    const items = getCollectionLeaderboard({ window: 'week' })
    expect(items[0].tag).toBe('newer')
    expect(items[0].rank).toBe(1)
    expect(items[1].tag).toBe('older')
    expect(items[1].rank).toBe(2)
  })

  it("mode 'new' orders by recency, ignoring score", () => {
    seedUser('u1', 'alice')
    seedUser('u2', 'bob')
    seedShare('u1', 'high-score-old')
    seedShare('u2', 'low-score-new')

    for (let i = 0; i < 10; i++) {
      seedEvent({
        ownerUserId: 'u1',
        tag: 'high-score-old',
        action: 'view',
        createdAt: iso(5 * HOUR),
      })
    }
    seedEvent({ ownerUserId: 'u2', tag: 'low-score-new', action: 'view', createdAt: iso(HOUR) })

    const items = getCollectionLeaderboard({ window: 'week', mode: 'new' })
    expect(items[0].tag).toBe('low-score-new')
    expect(items[1].tag).toBe('high-score-old')
  })

  it.each(['hot', 'rising'] as const)('mode %s throws not implemented', (mode) => {
    seedUser('u1', 'alice')
    seedShare('u1', 'tag')
    seedEvent({ ownerUserId: 'u1', tag: 'tag', createdAt: iso(HOUR) })

    expect(() => getCollectionLeaderboard({ window: 'week', mode })).toThrow('not implemented')
  })

  it('resolves the owning username, not a raw userId', () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'tag')
    seedEvent({ ownerUserId: 'u1', tag: 'tag', createdAt: iso(HOUR) })

    const items = getCollectionLeaderboard({ window: 'week' })
    expect(items[0].username).toBe('alice')
  })

  it('includes itemCount and tiles from the tagged bookmarks', () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'mytag')
    seedEvent({ ownerUserId: 'u1', tag: 'mytag', createdAt: iso(HOUR) })

    testInstance.db
      .insert(bookmarks)
      .values({
        id: 'post-1',
        userId: 'u1',
        author: 'alice',
        text: 'a saved post about something interesting',
        tweetUrl: 'https://x.com/alice/status/post-1',
        processedAt: iso(HOUR),
      })
      .run()
    testInstance.db
      .insert(bookmarkTags)
      .values({ userId: 'u1', bookmarkId: 'post-1', tag: 'mytag' })
      .run()
    testInstance.db
      .insert(bookmarkMedia)
      .values({
        id: 'post-1_1',
        userId: 'u1',
        bookmarkId: 'post-1',
        mediaType: 'photo',
        originalUrl: 'https://pbs.twimg.com/media/x.jpg',
      })
      .run()

    const items = getCollectionLeaderboard({ window: 'week' })
    const entry = items.find((i) => i.tag === 'mytag')!
    expect(entry.itemCount).toBe(1)
    expect(entry.tiles.length).toBe(1)
    expect(entry.tiles[0].text).toContain('a saved post')
  })

  it('respects the limit parameter', () => {
    seedUser('u1', 'alice')
    for (let i = 0; i < 5; i++) {
      seedShare('u1', `tag${i}`)
      seedEvent({ ownerUserId: 'u1', tag: `tag${i}`, createdAt: iso(HOUR) })
    }

    const items = getCollectionLeaderboard({ window: 'week', limit: 2 })
    expect(items.length).toBe(2)
  })

  it('caches the computed board so a later insert is not reflected within the TTL, but a fresh db is', () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'tag')
    seedEvent({ ownerUserId: 'u1', tag: 'tag', createdAt: iso(HOUR) })

    const first = getCollectionLeaderboard({ window: 'week' })
    expect(first.length).toBe(1)

    seedUser('u2', 'bob')
    seedShare('u2', 'tag2')
    seedEvent({ ownerUserId: 'u2', tag: 'tag2', createdAt: iso(HOUR) })

    const second = getCollectionLeaderboard({ window: 'week' })
    expect(second.length).toBe(1) // still cached

    // A brand new db instance (as a fresh test would provide) must not see
    // the previous instance's cached value.
    testInstance.close()
    testInstance = createTestDb()
    seedUser('u3', 'carol')
    seedShare('u3', 'tag3')
    seedEvent({ ownerUserId: 'u3', tag: 'tag3', createdAt: iso(HOUR) })

    const third = getCollectionLeaderboard({ window: 'week' })
    expect(third.length).toBe(1)
    expect(third[0].tag).toBe('tag3')
  })
})

describe('getOwnerCollectionStats', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('computes week-window totals and per-tag breakdown for the owner', () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'a')
    seedShare('u1', 'b')
    seedEvent({ ownerUserId: 'u1', tag: 'a', action: 'view', createdAt: iso(HOUR) })
    seedEvent({ ownerUserId: 'u1', tag: 'a', action: 'view', createdAt: iso(2 * HOUR) })
    seedEvent({ ownerUserId: 'u1', tag: 'b', action: 'clone', createdAt: iso(HOUR) })
    // Outside the week window — must not count.
    seedEvent({ ownerUserId: 'u1', tag: 'a', action: 'view', createdAt: iso(10 * DAY) })

    const stats = getOwnerCollectionStats('u1')
    expect(stats.totals.viewCount).toBe(2)
    expect(stats.totals.cloneCount).toBe(1)
    expect(stats.byTag.a).toEqual({ viewCount: 2, cloneCount: 0, rank: expect.anything() })
    expect(stats.byTag.b).toEqual({ viewCount: 0, cloneCount: 1, rank: expect.anything() })
  })

  it('sets bestRank and per-tag rank from the public week board', () => {
    seedUser('u1', 'alice')
    seedUser('u2', 'bob')
    seedShare('u1', 'a')
    seedShare('u2', 'competitor')

    // u1's tag gets fewer views than the competitor's.
    seedEvent({ ownerUserId: 'u1', tag: 'a', action: 'view', createdAt: iso(HOUR) })
    for (let i = 0; i < 3; i++) {
      seedEvent({ ownerUserId: 'u2', tag: 'competitor', action: 'view', createdAt: iso(HOUR) })
    }

    const stats = getOwnerCollectionStats('u1')
    expect(stats.byTag.a.rank).toBe(2)
    expect(stats.totals.bestRank).toBe(2)
  })

  it('reports rank null for a tag with events that never charts (e.g. private)', () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'private-tag', false)
    seedEvent({ ownerUserId: 'u1', tag: 'private-tag', action: 'view', createdAt: iso(HOUR) })

    const stats = getOwnerCollectionStats('u1')
    expect(stats.byTag['private-tag'].rank).toBeNull()
    expect(stats.totals.bestRank).toBeNull()
  })

  it('returns empty totals for an owner with no events', () => {
    seedUser('u1', 'alice')
    const stats = getOwnerCollectionStats('u1')
    expect(stats.totals).toEqual({ viewCount: 0, cloneCount: 0, bestRank: null })
    expect(stats.byTag).toEqual({})
  })
})

describe('slugToWindow / windowToPath', () => {
  it('maps slugs to window ids and back to paths', () => {
    expect(slugToWindow('today')).toBe('day')
    expect(slugToWindow('week')).toBe('week')
    expect(slugToWindow('month')).toBe('month')
    expect(slugToWindow('all-time')).toBe('all')
    expect(slugToWindow('bogus')).toBeNull()
  })

  it("week is the default path '/collections'; others get a slug segment", () => {
    expect(windowToPath('week')).toBe('/collections')
    expect(windowToPath('day')).toBe('/collections/today')
    expect(windowToPath('month')).toBe('/collections/month')
    expect(windowToPath('all')).toBe('/collections/all-time')
  })
})
