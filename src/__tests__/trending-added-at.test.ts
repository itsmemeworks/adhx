import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, createTestBookmark, type TestDbInstance } from './api/setup'
import { activity, bookmarks, type NewActivity } from '@/lib/db/schema'

/**
 * Owner report: the collection theater's time chip "kept changing" — it was
 * rendering `createdAt`, the pulse EVENT time (refreshed on every re-preview/
 * save/send), not a stable post age. `addedAt` is the fix: the earliest of
 * any saver's `bookmarks.processedAt` and the earliest `activity.createdAt`
 * event, which by construction (MIN) never moves once set. Deliberately
 * never the source platform's own publish date, for any platform.
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

describe('getTrendingItems addedAt (stable display time)', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('is the saved bookmark processedAt, earlier than the save activity event that recorded it', async () => {
    // A post only surfaces in the pulse via an activity row (getTrendingItems
    // reads recent `activity`, then enriches from `bookmarks`) — this
    // mirrors `recordActivity('save')` firing at slightly later wall-clock
    // time than the DB insert's own `processedAt`.
    testInstance.db
      .insert(bookmarks)
      .values(
        createTestBookmark('owner-1', 'saved1', {
          platform: 'twitter',
          processedAt: '2026-06-01T00:00:00Z',
        }),
      )
      .run()
    seedActivity({ bookmarkId: 'saved1', createdAt: '2026-06-01T00:00:05Z' })

    const { items } = await getTrendingItems()

    const item = items.find((i) => i.bookmarkId === 'saved1')
    expect(item?.addedAt).toBe('2026-06-01T00:00:00Z')
  })

  it('is the earliest activity.createdAt for a preview-only post with no saved bookmark', async () => {
    seedActivity({ bookmarkId: 'previewonly', createdAt: '2026-06-05T00:00:00Z' })
    // A later event for the same post must not move the earliest-seen time.
    seedActivity({
      bookmarkId: 'previewonly',
      action: 'preview',
      createdAt: '2026-06-06T00:00:00Z',
    })

    const { items } = await getTrendingItems()

    const item = items.find((i) => i.bookmarkId === 'previewonly')
    expect(item?.addedAt).toBe('2026-06-05T00:00:00Z')
  })

  it('takes the earlier of the saved processedAt and the first activity event (lexical MIN)', async () => {
    // The post was previewed by other visitors before this user ever saved it.
    testInstance.db
      .insert(bookmarks)
      .values(
        createTestBookmark('owner-1', 'both1', {
          platform: 'twitter',
          processedAt: '2026-06-10T00:00:00Z',
        }),
      )
      .run()
    seedActivity({ bookmarkId: 'both1', action: 'preview', createdAt: '2026-06-03T00:00:00Z' })

    const { items } = await getTrendingItems()

    const item = items.find((i) => i.bookmarkId === 'both1')
    expect(item?.addedAt).toBe('2026-06-03T00:00:00Z')
  })

  it('never reflects a later re-save/re-preview — addedAt is stable once the earliest event is recorded', async () => {
    testInstance.db
      .insert(bookmarks)
      .values(
        createTestBookmark('owner-1', 'stable1', {
          platform: 'twitter',
          processedAt: '2026-06-01T00:00:00Z',
        }),
      )
      .run()
    seedActivity({ bookmarkId: 'stable1', createdAt: '2026-06-01T00:00:00Z' })
    // A second saver re-saves much later — the earliest processedAt (MIN)
    // must still win, not this fresher one.
    testInstance.db
      .insert(bookmarks)
      .values(
        createTestBookmark('owner-2', 'stable1', {
          platform: 'twitter',
          processedAt: '2026-08-01T00:00:00Z',
        }),
      )
      .run()
    seedActivity({ bookmarkId: 'stable1', createdAt: '2026-08-01T00:00:00Z' })

    const { items } = await getTrendingItems()

    const item = items.find((i) => i.bookmarkId === 'stable1')
    expect(item?.addedAt).toBe('2026-06-01T00:00:00Z')
  })
})
