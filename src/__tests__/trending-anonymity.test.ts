import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, type TestDbInstance } from './api/setup'
import { activity, bookmarks, type NewActivity } from '@/lib/db/schema'

/**
 * ANONYMITY INVARIANT regression test.
 *
 * The public pulse / trending source is anonymous by construction: `activity.userId`
 * is stored only for future moderation and must NEVER reach a read path. Both
 * `getTrendingItems()` (the single audited choke point) and `GET /api/trending`
 * (its public wrapper) must return items that carry no `userId` field and never
 * leak a stored user identifier.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { getTrendingItems } from '@/lib/trending/query'
import { GET as trendingGET } from '@/app/api/trending/route'

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

describe('trending anonymity invariant', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('getTrendingItems() never returns a userId field', async () => {
    seedActivity({ bookmarkId: '1', createdAt: '2026-06-06T10:00:00Z', userId: SECRET_USER })
    seedActivity({
      bookmarkId: '2',
      createdAt: '2026-06-06T11:00:00Z',
      action: 'preview',
      userId: SECRET_USER,
    })

    const { items } = await getTrendingItems()

    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item).not.toHaveProperty('userId')
    }
    expect(JSON.stringify(items)).not.toContain(SECRET_USER)
  })

  it('getTrendingItems() does not leak the saver userId via the enriched bookmark join', async () => {
    // A saved bookmark owned by SECRET_USER — enrichment joins bookmarks for the
    // save count / content type. The join must not surface the owner's id.
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
    seedActivity({ bookmarkId: 'tweet-99', createdAt: '2026-06-06T12:00:00Z', userId: SECRET_USER })

    const { items } = await getTrendingItems()

    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item).not.toHaveProperty('userId')
    }
    expect(JSON.stringify(items)).not.toContain(SECRET_USER)
  })

  it('GET /api/trending never exposes userId in its JSON payload', async () => {
    seedActivity({ bookmarkId: '1', createdAt: '2026-06-06T10:00:00Z', userId: SECRET_USER })

    const req = new NextRequest('http://localhost/api/trending')
    const res = await trendingGET(req)
    const body = await res.json()

    expect(body.items.length).toBeGreaterThan(0)
    for (const item of body.items) {
      expect(item).not.toHaveProperty('userId')
    }
    expect(JSON.stringify(body)).not.toContain(SECRET_USER)
  })

  it('GET /api/trending?platform=x filters without leaking userId', async () => {
    seedActivity({
      bookmarkId: 'tw',
      platform: 'twitter',
      createdAt: '2026-06-06T10:00:00Z',
      userId: SECRET_USER,
    })
    seedActivity({
      bookmarkId: 'tk',
      platform: 'tiktok',
      author: 'tkuser',
      url: '/@tkuser/video/tk',
      createdAt: '2026-06-06T11:00:00Z',
      userId: SECRET_USER,
    })

    const req = new NextRequest('http://localhost/api/trending?platform=x')
    const res = await trendingGET(req)
    const body = await res.json()

    expect(body.items.every((i: { platform: string }) => i.platform === 'twitter')).toBe(true)
    expect(JSON.stringify(body)).not.toContain(SECRET_USER)
  })
})
