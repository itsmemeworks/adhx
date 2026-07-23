import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, type TestDbInstance } from './api/setup'
import { activity, type NewActivity } from '@/lib/db/schema'

/**
 * Regression coverage for offset-based pagination added to the trending pulse
 * (`getTrendingItems` + `GET /api/activity`), used by `DiscoverFeed`'s
 * infinite scroll. Two invariants must hold:
 *
 *  1. `offset` pages over the DEDUPED, newest-first sequence (not raw rows) —
 *     no post repeats across pages, and `hasMore` correctly reflects whether
 *     more deduped posts remain past the current page.
 *  2. The anonymity invariant holds at ANY offset, not just the first page —
 *     `activity.userId` must never reach the response, at offset=0 or beyond.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { getTrendingItems } from '@/lib/trending/query'
import { GET as activityGET } from '@/app/api/activity/route'

const SECRET_USER = 'secret-user-should-never-leak'

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

describe('trending offset pagination', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('returns the next slice of the deduped sequence with no overlap across pages', async () => {
    // 5 distinct posts, newest = '5' (highest createdAt).
    for (let i = 1; i <= 5; i++) {
      seedActivity({
        bookmarkId: String(i),
        userId: SECRET_USER,
        createdAt: `2026-06-06T10:0${i}:00Z`,
      })
    }

    const page1 = await getTrendingItems({ limit: 2, offset: 0 })
    const page2 = await getTrendingItems({ limit: 2, offset: 2 })
    const page3 = await getTrendingItems({ limit: 2, offset: 4 })

    expect(page1.items.map((i) => i.bookmarkId)).toEqual(['5', '4'])
    expect(page2.items.map((i) => i.bookmarkId)).toEqual(['3', '2'])
    expect(page3.items.map((i) => i.bookmarkId)).toEqual(['1'])

    // No post appears on more than one page.
    const seen = new Set<string>()
    for (const page of [page1, page2, page3]) {
      for (const it of page.items) {
        expect(seen.has(it.bookmarkId!)).toBe(false)
        seen.add(it.bookmarkId!)
      }
    }

    expect(page1.hasMore).toBe(true)
    expect(page2.hasMore).toBe(true)
    expect(page3.hasMore).toBe(false)
  })

  it('collapses a post that was both previewed and saved so it appears on exactly one page', async () => {
    // 'dup' has two events (preview then save) — must collapse to a single
    // deduped entry, not consume two pagination slots.
    seedActivity({ bookmarkId: 'dup', action: 'preview', createdAt: '2026-06-06T10:00:00Z' })
    seedActivity({ bookmarkId: 'dup', action: 'save', createdAt: '2026-06-06T10:00:30Z' })
    seedActivity({ bookmarkId: 'other', createdAt: '2026-06-06T09:00:00Z' })

    const page1 = await getTrendingItems({ limit: 1, offset: 0 })
    const page2 = await getTrendingItems({ limit: 1, offset: 1 })

    expect(page1.items.map((i) => i.bookmarkId)).toEqual(['dup'])
    expect(page2.items.map((i) => i.bookmarkId)).toEqual(['other'])
    expect(page2.hasMore).toBe(false)
  })

  it('CRITICAL: getTrendingItems never exposes userId at offset > 0', async () => {
    for (let i = 1; i <= 4; i++) {
      seedActivity({
        bookmarkId: String(i),
        userId: SECRET_USER,
        createdAt: `2026-06-06T10:0${i}:00Z`,
      })
    }

    const page2 = await getTrendingItems({ limit: 2, offset: 2 })
    expect(page2.items.length).toBeGreaterThan(0)
    for (const item of page2.items) {
      expect(item).not.toHaveProperty('userId')
    }
    expect(JSON.stringify(page2.items)).not.toContain(SECRET_USER)
  })

  it('CRITICAL: GET /api/activity?offset=N never exposes userId in its JSON payload', async () => {
    for (let i = 1; i <= 4; i++) {
      seedActivity({
        bookmarkId: String(i),
        userId: SECRET_USER,
        createdAt: `2026-06-06T10:0${i}:00Z`,
      })
    }

    const req = new NextRequest('http://localhost/api/activity?offset=2')
    const res = await activityGET(req)
    const body = await res.json()

    expect(body.items.length).toBeGreaterThan(0)
    for (const item of body.items) {
      expect(item).not.toHaveProperty('userId')
    }
    expect(JSON.stringify(body)).not.toContain(SECRET_USER)
  })

  it('GET /api/activity paginates via ?offset= consistently with getTrendingItems, with no page overlap', async () => {
    for (let i = 1; i <= 5; i++) {
      seedActivity({ bookmarkId: String(i), createdAt: `2026-06-06T10:0${i}:00Z` })
    }

    const page1Res = await activityGET(new NextRequest('http://localhost/api/activity'))
    const page1 = await page1Res.json()
    expect(page1.hasMore).toBe(false) // only 5 seeded, well under the 30 default limit

    const page2Res = await activityGET(
      new NextRequest(`http://localhost/api/activity?offset=${page1.items.length}`),
    )
    const page2 = await page2Res.json()

    expect(page1.items.length).toBe(5)
    expect(page2.items.length).toBe(0)
  })

  it('ignores a negative or non-numeric offset (treats it as 0) rather than erroring', async () => {
    for (let i = 1; i <= 3; i++) {
      seedActivity({ bookmarkId: String(i), createdAt: `2026-06-06T10:0${i}:00Z` })
    }

    const res = await activityGET(new NextRequest('http://localhost/api/activity?offset=-5'))
    const body = await res.json()
    expect(body.items.map((i: { bookmarkId: string }) => i.bookmarkId)).toEqual(['3', '2', '1'])
  })
})
