import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, USER_A, USER_B, type TestDbInstance } from './setup'
import { collectionEvents, tagShares } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * recordCollectionEvent() — the write path for Discovery leaderboard events
 * (docs/specs/discovery-leaderboards.md §3–§4, §9).
 *
 * Verifies: happy-path view + clone insert, self-view no-op, private-tag
 * no-op, signed-in 30-min dedupe, anonymous 60s dedupe (across viewers), and
 * that errors are swallowed (never throws), matching `recordActivity()`.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { recordCollectionEvent } from '@/lib/discovery/record'

function makePublic(ownerUserId: string, tag: string) {
  testInstance.db
    .insert(tagShares)
    .values({ userId: ownerUserId, tag, shareCode: `${ownerUserId}-${tag}`, isPublic: true })
    .run()
}

function eventsFor(ownerUserId: string, tag: string) {
  return testInstance.db
    .select()
    .from(collectionEvents)
    .where(and(eq(collectionEvents.ownerUserId, ownerUserId), eq(collectionEvents.tag, tag)))
    .all()
}

describe('recordCollectionEvent', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })

  afterEach(() => {
    testInstance.close()
  })

  it('records a view event on a public collection', () => {
    makePublic(USER_B, 'memes')

    recordCollectionEvent({ action: 'view', ownerUserId: USER_B, tag: 'memes', viewerId: USER_A })

    const rows = eventsFor(USER_B, 'memes')
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('view')
    expect(rows[0].viewerId).toBe(USER_A)
    expect(rows[0].hidden).toBe(0)
  })

  it('records a clone event on a public collection', () => {
    makePublic(USER_B, 'memes')

    recordCollectionEvent({ action: 'clone', ownerUserId: USER_B, tag: 'memes', viewerId: USER_A })

    const rows = eventsFor(USER_B, 'memes')
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('clone')
  })

  it('records an anonymous event with a null viewerId', () => {
    makePublic(USER_B, 'memes')

    recordCollectionEvent({ action: 'view', ownerUserId: USER_B, tag: 'memes', viewerId: null })

    const rows = eventsFor(USER_B, 'memes')
    expect(rows).toHaveLength(1)
    expect(rows[0].viewerId).toBeNull()
  })

  it('is a no-op when the viewer is the collection owner (self-view)', () => {
    makePublic(USER_B, 'memes')

    recordCollectionEvent({ action: 'view', ownerUserId: USER_B, tag: 'memes', viewerId: USER_B })

    expect(eventsFor(USER_B, 'memes')).toHaveLength(0)
  })

  it('is a no-op when the collection is private', () => {
    testInstance.db
      .insert(tagShares)
      .values({ userId: USER_B, tag: 'private-tag', shareCode: 'private-code', isPublic: false })
      .run()

    recordCollectionEvent({
      action: 'view',
      ownerUserId: USER_B,
      tag: 'private-tag',
      viewerId: USER_A,
    })

    expect(eventsFor(USER_B, 'private-tag')).toHaveLength(0)
  })

  it('is a no-op when the tag has no tag_shares row at all', () => {
    recordCollectionEvent({
      action: 'view',
      ownerUserId: USER_B,
      tag: 'never-shared',
      viewerId: USER_A,
    })

    expect(eventsFor(USER_B, 'never-shared')).toHaveLength(0)
  })

  it('dedupes a signed-in viewer within the 30-minute window', () => {
    makePublic(USER_B, 'memes')
    const now = new Date('2026-08-21T12:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    recordCollectionEvent({ action: 'view', ownerUserId: USER_B, tag: 'memes', viewerId: USER_A })

    // 29 minutes later — still within the window, should be skipped.
    vi.setSystemTime(new Date(now.getTime() + 29 * 60 * 1000))
    recordCollectionEvent({ action: 'view', ownerUserId: USER_B, tag: 'memes', viewerId: USER_A })

    expect(eventsFor(USER_B, 'memes')).toHaveLength(1)

    vi.useRealTimers()
  })

  it('records again for the same signed-in viewer after the 30-minute window elapses', () => {
    makePublic(USER_B, 'memes')
    const now = new Date('2026-08-21T12:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    recordCollectionEvent({ action: 'view', ownerUserId: USER_B, tag: 'memes', viewerId: USER_A })

    // 31 minutes later — outside the window, should record again.
    vi.setSystemTime(new Date(now.getTime() + 31 * 60 * 1000))
    recordCollectionEvent({ action: 'view', ownerUserId: USER_B, tag: 'memes', viewerId: USER_A })

    expect(eventsFor(USER_B, 'memes')).toHaveLength(2)

    vi.useRealTimers()
  })

  it('a different signed-in viewer is not deduped against another viewer', () => {
    makePublic(USER_B, 'memes')

    recordCollectionEvent({ action: 'view', ownerUserId: USER_B, tag: 'memes', viewerId: USER_A })
    recordCollectionEvent({
      action: 'view',
      ownerUserId: USER_B,
      tag: 'memes',
      viewerId: 'user-c-789',
    })

    expect(eventsFor(USER_B, 'memes')).toHaveLength(2)
  })

  it('dedupes anonymous events within the 60-second floor, regardless of viewer', () => {
    makePublic(USER_B, 'memes')
    const now = new Date('2026-08-21T12:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    recordCollectionEvent({ action: 'view', ownerUserId: USER_B, tag: 'memes', viewerId: USER_A })

    // 30 seconds later, a different anonymous request — still within the
    // 60s anonymous floor for (owner, tag, action), so it's skipped even
    // though the first event came from a signed-in viewer.
    vi.setSystemTime(new Date(now.getTime() + 30 * 1000))
    recordCollectionEvent({ action: 'view', ownerUserId: USER_B, tag: 'memes', viewerId: null })

    expect(eventsFor(USER_B, 'memes')).toHaveLength(1)

    vi.useRealTimers()
  })

  it('records an anonymous event again after the 60-second floor elapses', () => {
    makePublic(USER_B, 'memes')
    const now = new Date('2026-08-21T12:00:00Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    recordCollectionEvent({ action: 'view', ownerUserId: USER_B, tag: 'memes', viewerId: null })

    vi.setSystemTime(new Date(now.getTime() + 61 * 1000))
    recordCollectionEvent({ action: 'view', ownerUserId: USER_B, tag: 'memes', viewerId: null })

    expect(eventsFor(USER_B, 'memes')).toHaveLength(2)

    vi.useRealTimers()
  })

  it('never throws, even after the sqlite handle is closed', () => {
    makePublic(USER_B, 'memes')
    testInstance.close()

    expect(() =>
      recordCollectionEvent({
        action: 'view',
        ownerUserId: USER_B,
        tag: 'memes',
        viewerId: USER_A,
      }),
    ).not.toThrow()
  })

  it('is a no-op when ownerUserId or tag is missing', () => {
    makePublic(USER_B, 'memes')

    recordCollectionEvent({ action: 'view', ownerUserId: '', tag: 'memes', viewerId: USER_A })
    recordCollectionEvent({ action: 'view', ownerUserId: USER_B, tag: '', viewerId: USER_A })

    expect(eventsFor(USER_B, 'memes')).toHaveLength(0)
  })
})
