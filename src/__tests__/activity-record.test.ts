import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from './api/setup'
import { activity } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { recordActivity, previewPath } from '@/lib/activity/record'

const rows = () => testInstance.db.select().from(activity).orderBy(desc(activity.id)).all()

describe('activity — recordActivity', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('appends a save with server-resolved content', () => {
    recordActivity({
      action: 'save',
      platform: 'twitter',
      bookmarkId: '123',
      author: 'naval',
      authorName: 'Naval',
      text: 'The most important skill',
      thumbnailUrl: 'https://pbs.twimg.com/x.jpg',
      url: '/naval/status/123',
      userId: 'user-a',
    })
    const all = rows()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({
      action: 'save',
      platform: 'twitter',
      bookmarkId: '123',
      author: 'naval',
      authorName: 'Naval',
      url: '/naval/status/123',
      userId: 'user-a',
    })
    expect(all[0].createdAt).toBeTruthy()
  })

  it('de-dupes the same action+platform+bookmark inside the window', () => {
    const input = {
      action: 'preview' as const,
      platform: 'twitter',
      bookmarkId: '1',
      author: 'a',
      url: '/a/status/1',
    }
    recordActivity(input)
    recordActivity(input)
    recordActivity(input)
    expect(rows()).toHaveLength(1)
  })

  it('keeps distinct content and distinct actions on the same item', () => {
    recordActivity({
      action: 'preview',
      platform: 'twitter',
      bookmarkId: '1',
      author: 'a',
      url: '/a/status/1',
    })
    recordActivity({
      action: 'save',
      platform: 'twitter',
      bookmarkId: '1',
      author: 'a',
      url: '/a/status/1',
    })
    recordActivity({
      action: 'preview',
      platform: 'tiktok',
      bookmarkId: '1',
      author: 'a',
      url: '/@a/video/1',
    })
    expect(rows()).toHaveLength(3)
  })

  it('collapses whitespace and caps long text with an ellipsis', () => {
    recordActivity({
      action: 'save',
      platform: 'twitter',
      bookmarkId: '9',
      author: 'a',
      text: 'word '.repeat(120), // ~600 chars
      url: '/a/status/9',
    })
    const [row] = rows()
    expect(row.text!.length).toBeLessThanOrEqual(240)
    expect(row.text!.endsWith('…')).toBe(true)
  })

  it('drops a non-http thumbnail but keeps http(s) and /api/ proxy urls', () => {
    recordActivity({
      action: 'save',
      platform: 'twitter',
      bookmarkId: 'a',
      author: 'a',
      url: '/a/status/a',
      thumbnailUrl: 'javascript:alert(1)',
    })
    recordActivity({
      action: 'save',
      platform: 'twitter',
      bookmarkId: 'b',
      author: 'a',
      url: '/a/status/b',
      thumbnailUrl: '/api/media/instagram/thumbnail?id=x',
    })
    recordActivity({
      action: 'save',
      platform: 'twitter',
      bookmarkId: 'c',
      author: 'a',
      url: '/a/status/c',
      thumbnailUrl: 'https://cdn/x.jpg',
    })
    const byId = Object.fromEntries(rows().map((r) => [r.bookmarkId, r.thumbnailUrl]))
    expect(byId['a']).toBeNull()
    expect(byId['b']).toBe('/api/media/instagram/thumbnail?id=x')
    expect(byId['c']).toBe('https://cdn/x.jpg')
  })

  it('ignores events missing required identifiers', () => {
    recordActivity({ action: 'save', platform: 'twitter', bookmarkId: '', author: 'a', url: '/a' })
    recordActivity({ action: 'save', platform: 'twitter', bookmarkId: '1', author: '', url: '/a' })
    recordActivity({ action: 'save', platform: 'twitter', bookmarkId: '1', author: 'a', url: '' })
    expect(rows()).toHaveLength(0)
  })
})

describe('activity — previewPath', () => {
  it('builds on-ADHX preview paths per platform', () => {
    expect(previewPath('twitter', 'naval', '123')).toBe('/naval/status/123')
    expect(previewPath('instagram', 'someone', 'Cwnj8')).toBe('/reels/Cwnj8')
    expect(previewPath('tiktok', 'user', '999')).toBe('/@user/video/999')
  })
})
