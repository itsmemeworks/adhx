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

import { recordActivity, recordSharePulse, previewPath } from '@/lib/activity/record'

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
    expect(row.text!.length).toBeLessThanOrEqual(500)
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

  it('stores sanitized textLinks and quote as JSON, capped at 8 links', () => {
    const links = Array.from({ length: 12 }, (_, i) => ({
      shortUrl: `https://t.co/${i}`,
      expandedUrl: `https://example.com/${i}`,
      linkType: 'link',
    }))
    recordActivity({
      action: 'preview',
      platform: 'twitter',
      bookmarkId: 'links1',
      author: 'a',
      url: '/a/status/links1',
      textLinks: links,
      quote: {
        author: 'quoter',
        authorName: 'Quoter Name',
        text: 'the quoted text',
        authorAvatarUrl: 'https://pbs.twimg.com/q.jpg',
      },
    })
    const [row] = rows()
    const storedLinks = JSON.parse(row.textLinks!)
    expect(storedLinks).toHaveLength(8)
    expect(storedLinks[0]).toEqual({
      shortUrl: 'https://t.co/0',
      expandedUrl: 'https://example.com/0',
      linkType: 'link',
    })
    const storedQuote = JSON.parse(row.quoteJson!)
    expect(storedQuote).toEqual({
      author: 'quoter',
      authorName: 'Quoter Name',
      text: 'the quoted text',
      authorAvatarUrl: 'https://pbs.twimg.com/q.jpg',
    })
  })

  it('drops textLinks entries without a valid http(s) expandedUrl', () => {
    recordActivity({
      action: 'preview',
      platform: 'twitter',
      bookmarkId: 'links2',
      author: 'a',
      url: '/a/status/links2',
      textLinks: [
        { expandedUrl: 'javascript:alert(1)' },
        { expandedUrl: 'https://good.example/x' },
      ],
    })
    const [row] = rows()
    expect(JSON.parse(row.textLinks!)).toEqual([
      { shortUrl: null, expandedUrl: 'https://good.example/x', linkType: null },
    ])
  })

  it('stores null for textLinks/quote when absent, and drops a quote with no author or text', () => {
    recordActivity({
      action: 'preview',
      platform: 'twitter',
      bookmarkId: 'none1',
      author: 'a',
      url: '/a/status/none1',
    })
    recordActivity({
      action: 'preview',
      platform: 'twitter',
      bookmarkId: 'none2',
      author: 'a',
      url: '/a/status/none2',
      quote: { author: '', text: null },
    })
    const byId = Object.fromEntries(rows().map((r) => [r.bookmarkId, r]))
    expect(byId['none1'].textLinks).toBeNull()
    expect(byId['none1'].quoteJson).toBeNull()
    expect(byId['none2'].quoteJson).toBeNull()
  })
})

describe('activity — previewPath', () => {
  it('builds on-ADHX preview paths per platform', () => {
    expect(previewPath('twitter', 'naval', '123')).toBe('/naval/status/123')
    expect(previewPath('instagram', 'someone', 'Cwnj8')).toBe('/reels/Cwnj8')
    expect(previewPath('tiktok', 'user', '999')).toBe('/@user/video/999')
  })
})

describe('activity — recordSharePulse', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('copies display fields from an existing pulse row and ignores unknown posts', () => {
    recordActivity({
      action: 'preview',
      platform: 'instagram',
      bookmarkId: 'reel1',
      author: 'nature',
      authorName: 'Nature',
      text: 'funny cat',
      thumbnailUrl: '/api/media/instagram/thumbnail?id=reel1',
      contentType: 'video',
      url: '/reels/reel1',
    })

    recordSharePulse({ platform: 'instagram', bookmarkId: 'reel1', userId: 'user-a' })
    recordSharePulse({ platform: 'instagram', bookmarkId: 'never-seen' })

    const all = rows()
    const shares = all.filter((r) => r.action === 'share')
    expect(shares).toHaveLength(1)
    expect(shares[0]).toMatchObject({
      action: 'share',
      platform: 'instagram',
      bookmarkId: 'reel1',
      author: 'nature',
      authorName: 'Nature',
      text: 'funny cat',
      thumbnailUrl: '/api/media/instagram/thumbnail?id=reel1',
      url: '/reels/reel1',
      userId: 'user-a',
    })
  })

  it('de-dupes share of the same post inside the window', () => {
    recordActivity({
      action: 'preview',
      platform: 'tiktok',
      bookmarkId: '1',
      author: 'a',
      url: '/@a/video/1',
    })
    recordSharePulse({ platform: 'tiktok', bookmarkId: '1' })
    recordSharePulse({ platform: 'tiktok', bookmarkId: '1' })
    expect(rows().filter((r) => r.action === 'share')).toHaveLength(1)
  })

  it('copies textLinks and quote forward from the source pulse row', () => {
    recordActivity({
      action: 'preview',
      platform: 'twitter',
      bookmarkId: 'qt1',
      author: 'a',
      url: '/a/status/qt1',
      textLinks: [{ expandedUrl: 'https://example.com/article' }],
      quote: { author: 'someone', text: 'quoted content' },
    })
    recordSharePulse({ platform: 'twitter', bookmarkId: 'qt1' })

    const share = rows().find((r) => r.action === 'share')!
    expect(JSON.parse(share.textLinks!)).toEqual([
      { shortUrl: null, expandedUrl: 'https://example.com/article', linkType: null },
    ])
    expect(JSON.parse(share.quoteJson!)).toEqual({
      author: 'someone',
      authorName: null,
      text: 'quoted content',
      authorAvatarUrl: null,
    })
  })
})
