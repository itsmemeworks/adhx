import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from './setup'
import { activity, type NewActivity } from '@/lib/db/schema'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { GET } from '@/app/api/activity/route'

function seed(overrides: Partial<NewActivity> & { createdAt: string; bookmarkId: string }) {
  const row: NewActivity = {
    action: 'save',
    platform: 'twitter',
    author: 'a',
    url: `/a/status/${overrides.bookmarkId}`,
    ...overrides,
  }
  testInstance.db.insert(activity).values(row).run()
}

describe('GET /api/activity', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('returns recent events newest-first', async () => {
    seed({ bookmarkId: '1', createdAt: '2026-06-06T10:00:00Z' })
    seed({ bookmarkId: '2', createdAt: '2026-06-06T11:00:00Z' })
    seed({ bookmarkId: '3', createdAt: '2026-06-06T12:00:00Z' })

    const res = await GET()
    const { items } = await res.json()
    expect(items.map((i: { url: string }) => i.url)).toEqual([
      '/a/status/3',
      '/a/status/2',
      '/a/status/1',
    ])
  })

  it('NEVER exposes userId (pulse is anonymous)', async () => {
    seed({ bookmarkId: '1', createdAt: '2026-06-06T10:00:00Z', userId: 'secret-user' })
    const res = await GET()
    const { items } = await res.json()
    expect(items).toHaveLength(1)
    expect(items[0]).not.toHaveProperty('userId')
    expect(JSON.stringify(items)).not.toContain('secret-user')
  })

  it('types preview-only items from the recorded contentType (articles render rich)', async () => {
    // A previewed-but-never-saved article has no bookmark to derive its type
    // from, so it must fall back to the type recorded at preview time — else it
    // renders as a bare "Saved post" text card.
    seed({
      bookmarkId: 'art-1',
      createdAt: '2026-06-06T10:00:00Z',
      action: 'preview',
      contentType: 'article',
      text: "NASA's 'Photoshop Moon'",
      thumbnailUrl: 'https://pbs.twimg.com/media/cover.jpg',
    })
    const res = await GET()
    const { items } = await res.json()
    const item = items.find((i: { bookmarkId: string }) => i.bookmarkId === 'art-1')
    expect(item.contentType).toBe('article')
    expect(item.text).toBe("NASA's 'Photoshop Moon'")
    expect(item.thumbnailUrl).toBe('https://pbs.twimg.com/media/cover.jpg')
  })

  it('collapses repeats of the same action+platform+url', async () => {
    seed({ bookmarkId: '1', createdAt: '2026-06-06T10:00:00Z' })
    seed({ bookmarkId: '1', createdAt: '2026-06-06T10:00:30Z' }) // same url, later
    seed({ bookmarkId: '2', createdAt: '2026-06-06T10:01:00Z' })

    const res = await GET()
    const { items } = await res.json()
    const urls = items.map((i: { url: string }) => i.url)
    expect(urls).toEqual(['/a/status/2', '/a/status/1'])
  })

  it('collapses a post that was both previewed and saved into one item', async () => {
    // Different actions for the same post (common now that sync records a save
    // per new bookmark) must yield ONE card — two would collide on the React
    // key `platform:bookmarkId` and warn / duplicate.
    seed({ bookmarkId: 'p1', action: 'preview', createdAt: '2026-06-06T10:00:00Z' })
    seed({ bookmarkId: 'p1', action: 'save', createdAt: '2026-06-06T10:00:30Z' })

    const res = await GET()
    const { items } = await res.json()
    expect(items.filter((i: { bookmarkId: string }) => i.bookmarkId === 'p1')).toHaveLength(1)
  })

  it('caps the number of items returned', async () => {
    for (let i = 0; i < 45; i++) {
      seed({ bookmarkId: String(i), createdAt: `2026-06-06T10:${String(i).padStart(2, '0')}:00Z` })
    }
    const res = await GET()
    const { items } = await res.json()
    expect(items.length).toBe(30)
  })

  it('sends a short cache header for liveliness', async () => {
    seed({ bookmarkId: '1', createdAt: '2026-06-06T10:00:00Z' })
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toContain('max-age=5')
  })
})
