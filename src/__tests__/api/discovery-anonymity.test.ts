import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from './setup'
import { collectionEvents, tagShares, users, type NewCollectionEvent } from '@/lib/db/schema'

/**
 * ANONYMITY INVARIANT regression test for the Discovery leaderboard, mirroring
 * `src/__tests__/trending-anonymity.test.ts`.
 *
 * `collectionEvents.viewerId` is stored only for write-side dedupe/moderation
 * (see `src/lib/discovery/record.ts`) and must NEVER reach a read path.
 * `getCollectionLeaderboard()` and `getOwnerCollectionStats()` (both in
 * `src/lib/discovery/rank.ts`) must never return a `viewerId`/`viewer_id` at
 * any depth, and entries must expose only a public `username` — never the
 * raw `ownerUserId`/`userId`.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { getCollectionLeaderboard, getOwnerCollectionStats } from '@/lib/discovery/rank'

const SECRET_VIEWER = 'secret-viewer-should-never-leak'
const OWNER_ID = 'owner-user-id-should-never-leak-raw'

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
  const row: NewCollectionEvent = { action: 'view', hidden: 0, ...overrides }
  testInstance.db.insert(collectionEvents).values(row).run()
}

/** Recursively checks that no key at any depth of `value` is a viewer/user-id-shaped key. */
function assertNoForbiddenKeys(value: unknown, forbiddenKeys: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoForbiddenKeys(item, forbiddenKeys)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      const lower = key.toLowerCase()
      expect(forbiddenKeys.some((f) => lower === f.toLowerCase())).toBe(false)
      assertNoForbiddenKeys(v, forbiddenKeys)
    }
  }
}

describe('discovery leaderboard anonymity invariant', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('getCollectionLeaderboard() never returns a viewerId/userId field', () => {
    seedUser(OWNER_ID, 'publicowner')
    seedShare(OWNER_ID, 'tag')
    seedEvent({
      ownerUserId: OWNER_ID,
      tag: 'tag',
      createdAt: new Date().toISOString(),
      viewerId: SECRET_VIEWER,
    })

    const items = getCollectionLeaderboard({ window: 'all' })
    expect(items.length).toBeGreaterThan(0)

    for (const item of items) {
      expect(item).not.toHaveProperty('viewerId')
      expect(item).not.toHaveProperty('viewer_id')
      expect(item).not.toHaveProperty('userId')
      expect(item).not.toHaveProperty('ownerUserId')
    }
    assertNoForbiddenKeys(items, [
      'viewerId',
      'viewer_id',
      'userId',
      'user_id',
      'ownerUserId',
      'owner_user_id',
    ])
    expect(JSON.stringify(items)).not.toContain(SECRET_VIEWER)
    expect(JSON.stringify(items)).not.toContain(OWNER_ID)
  })

  it('getOwnerCollectionStats() never returns a viewerId/userId field', () => {
    seedUser(OWNER_ID, 'publicowner')
    seedShare(OWNER_ID, 'tag')
    seedEvent({
      ownerUserId: OWNER_ID,
      tag: 'tag',
      createdAt: new Date().toISOString(),
      viewerId: SECRET_VIEWER,
    })

    const stats = getOwnerCollectionStats(OWNER_ID)

    assertNoForbiddenKeys(stats, [
      'viewerId',
      'viewer_id',
      'userId',
      'user_id',
      'ownerUserId',
      'owner_user_id',
    ])
    expect(JSON.stringify(stats)).not.toContain(SECRET_VIEWER)
    expect(JSON.stringify(stats)).not.toContain(OWNER_ID)
  })

  it('leaderboard entries expose only the public username, never the raw owner id, even across many viewers', () => {
    seedUser(OWNER_ID, 'publicowner')
    seedShare(OWNER_ID, 'tag')
    for (let i = 0; i < 5; i++) {
      seedEvent({
        ownerUserId: OWNER_ID,
        tag: 'tag',
        createdAt: new Date(Date.now() - i * 1000).toISOString(),
        viewerId: `${SECRET_VIEWER}-${i}`,
      })
    }

    const items = getCollectionLeaderboard({ window: 'all' })
    const entry = items.find((i) => i.tag === 'tag')!
    expect(entry.username).toBe('publicowner')
    expect(JSON.stringify(items)).not.toContain(OWNER_ID)
    expect(JSON.stringify(items)).not.toContain(SECRET_VIEWER)
  })
})
