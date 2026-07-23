import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from './api/setup'
import { activity, type NewActivity } from '@/lib/db/schema'

/**
 * `getRelatedSaves()` (src/lib/related/query.ts) powers the "related saves"
 * footer on every public preview page. It reuses the anonymity-audited
 * `getTrendingItems()` choke point for its fallback pass, so it must uphold
 * the same invariant: never expose `activity.userId`.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { getRelatedSaves } from '@/lib/related/query'

const SECRET_USER = 'secret-user-should-never-leak'

function seedActivity(overrides: Partial<NewActivity> & { createdAt: string; bookmarkId: string }) {
  const row: NewActivity = {
    action: 'preview',
    platform: 'twitter',
    author: 'someauthor',
    url: `/someauthor/status/${overrides.bookmarkId}`,
    ...overrides,
  }
  testInstance.db.insert(activity).values(row).run()
}

describe('getRelatedSaves', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('returns an empty array when there is nothing to relate', async () => {
    const items = await getRelatedSaves({
      platform: 'twitter',
      bookmarkId: 'self-1',
      authorHandle: 'alice',
    })
    expect(items).toEqual([])
  })

  it('prefers other recent activity by the same author', async () => {
    seedActivity({ bookmarkId: 'alice-1', author: 'alice', createdAt: '2026-06-06T10:00:00Z' })
    seedActivity({ bookmarkId: 'alice-2', author: 'alice', createdAt: '2026-06-06T11:00:00Z' })
    seedActivity({ bookmarkId: 'bob-1', author: 'bob', createdAt: '2026-06-06T12:00:00Z' })

    const items = await getRelatedSaves({
      platform: 'twitter',
      bookmarkId: 'self-1',
      authorHandle: 'alice',
    })

    const aliceItems = items.filter((i) => i.author === 'alice')
    expect(aliceItems).toHaveLength(2)
    // Same-author items come first, ahead of the trending fill-in.
    expect(items[0].author).toBe('alice')
    expect(items[1].author).toBe('alice')
  })

  it('excludes the current post itself even when it has activity of its own', async () => {
    seedActivity({ bookmarkId: 'self-1', author: 'alice', createdAt: '2026-06-06T10:00:00Z' })
    seedActivity({ bookmarkId: 'alice-2', author: 'alice', createdAt: '2026-06-06T11:00:00Z' })

    const items = await getRelatedSaves({
      platform: 'twitter',
      bookmarkId: 'self-1',
      authorHandle: 'alice',
    })

    expect(items.some((i) => i.bookmarkId === 'self-1')).toBe(false)
    expect(items.map((i) => i.bookmarkId)).toEqual(['alice-2'])
  })

  it('fills remaining slots with recent trending items when the author has few posts', async () => {
    seedActivity({ bookmarkId: 'alice-2', author: 'alice', createdAt: '2026-06-06T09:00:00Z' })
    for (let i = 0; i < 8; i++) {
      seedActivity({
        bookmarkId: `other-${i}`,
        author: `author${i}`,
        createdAt: `2026-06-06T1${i}:00:00Z`,
      })
    }

    const items = await getRelatedSaves({
      platform: 'twitter',
      bookmarkId: 'self-1',
      authorHandle: 'alice',
    })

    expect(items.length).toBe(6)
    // No duplicate posts.
    const keys = items.map((i) => `${i.platform}:${i.bookmarkId}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('never returns a userId field, even when activity rows carry one', async () => {
    seedActivity({
      bookmarkId: 'alice-2',
      author: 'alice',
      createdAt: '2026-06-06T10:00:00Z',
      userId: SECRET_USER,
    })
    seedActivity({
      bookmarkId: 'bob-1',
      author: 'bob',
      createdAt: '2026-06-06T11:00:00Z',
      userId: SECRET_USER,
    })

    const items = await getRelatedSaves({
      platform: 'twitter',
      bookmarkId: 'self-1',
      authorHandle: 'alice',
    })

    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item).not.toHaveProperty('userId')
    }
    expect(JSON.stringify(items)).not.toContain(SECRET_USER)
  })

  it('strips a leading @ from the author handle before matching', async () => {
    seedActivity({ bookmarkId: 'alice-2', author: 'alice', createdAt: '2026-06-06T10:00:00Z' })

    const items = await getRelatedSaves({
      platform: 'twitter',
      bookmarkId: 'self-1',
      authorHandle: '@alice',
    })

    expect(items.some((i) => i.author === 'alice' && i.bookmarkId === 'alice-2')).toBe(true)
  })
})
