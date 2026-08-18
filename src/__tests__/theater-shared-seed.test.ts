import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Coverage for `src/lib/theater/shared-seed.ts` — the shared-mode seed
 * assembly + per-platform mappers used by the preview pages (Phase 3,
 * docs/specs/theater-first.md §3).
 *
 * `buildSharedSeed()` is a thin wrapper over `getTheaterFeed()` (already
 * covered end-to-end against a real in-memory DB in
 * `src/__tests__/api/theater-feed.test.ts`), so here `getTheaterFeed` is
 * mocked directly — these tests only need to prove the shared-item-leads +
 * dedupe + degrade-on-failure behavior, not re-derive the feed itself.
 */

const getTheaterFeedMock = vi.fn()

vi.mock('@/lib/theater/feed', () => ({
  getTheaterFeed: () => getTheaterFeedMock(),
}))

import {
  buildSharedSeed,
  tweetToTheaterItem,
  reelToTheaterItem,
  tiktokToTheaterItem,
  youtubeToTheaterItem,
} from '@/lib/theater/shared-seed'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterItem } from '@/components/theater/types'

function item(overrides: Partial<TheaterItem> & { bookmarkId: string }): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    author: 'someone',
    url: '/someone/status/1',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildSharedSeed', () => {
  beforeEach(() => {
    getTheaterFeedMock.mockReset()
  })

  it('leads with the shared item, followed by the rest of the feed', async () => {
    const shared = item({ platform: 'twitter', bookmarkId: 'shared-1' })
    const other = item({ platform: 'tiktok', bookmarkId: 'other-1', author: 'other' })
    getTheaterFeedMock.mockResolvedValue({ items: [other], savedToday: 3, recentActivity: 10 })

    const { seed, sharedItem } = await buildSharedSeed(shared)

    expect(sharedItem).toBe(shared)
    expect(seed.items[0]).toBe(shared)
    expect(seed.items).toHaveLength(2)
    expect(seed.items[1]).toBe(other)
    expect(seed.savedToday).toBe(3)
    expect(seed.recentActivity).toBe(10)
  })

  it('dedupes the shared post out of the ambient feed by theaterItemKey', async () => {
    const shared = item({ platform: 'twitter', bookmarkId: 'dup-1' })
    // Same post already present in the live pulse (e.g. it's also trending) —
    // must not appear twice.
    const duplicate = item({ platform: 'twitter', bookmarkId: 'dup-1', text: 'stale copy' })
    const other = item({ platform: 'instagram', bookmarkId: 'other-2' })
    getTheaterFeedMock.mockResolvedValue({
      items: [duplicate, other],
      savedToday: 0,
      recentActivity: 0,
    })

    const { seed } = await buildSharedSeed(shared)

    const keys = seed.items.map(theaterItemKey)
    expect(keys).toEqual([theaterItemKey(shared), theaterItemKey(other)])
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('degrades to a solo-item seed when the ambient feed read fails', async () => {
    const shared = item({ platform: 'twitter', bookmarkId: 'solo-1' })
    getTheaterFeedMock.mockRejectedValue(new Error('no such table: activity'))

    const { seed, sharedItem } = await buildSharedSeed(shared)

    expect(sharedItem).toBe(shared)
    expect(seed.items).toEqual([shared])
    expect(seed.savedToday).toBe(0)
    expect(seed.recentActivity).toBe(0)
  })
})

describe('per-platform mappers', () => {
  it('tweetToTheaterItem maps fields without ever carrying a userId key', () => {
    const out = tweetToTheaterItem({
      id: '123',
      author: 'testauthor',
      authorName: 'Test Author',
      authorAvatarUrl: 'https://example.com/a.jpg',
      text: 'hello world',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      contentType: 'photo',
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    expect(out).not.toHaveProperty('userId')
    expect(out.platform).toBe('twitter')
    expect(out.bookmarkId).toBe('123')
    expect(out.author).toBe('testauthor')
    expect(out.authorName).toBe('Test Author')
    expect(out.authorAvatarUrl).toBe('https://example.com/a.jpg')
    expect(out.text).toBe('hello world')
    expect(out.thumbnailUrl).toBe('https://example.com/thumb.jpg')
    expect(out.contentType).toBe('photo')
    expect(out.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(out.url).toBe('https://x.com/testauthor/status/123')
  })

  it('reelToTheaterItem is always contentType video and strips a leading @', () => {
    const out = reelToTheaterItem({
      id: 'abc123',
      author: '@somereel',
      authorName: 'Some Reel',
      text: 'caption',
      thumbnailUrl: '/api/media/instagram/thumbnail?id=abc123',
    })

    expect(out).not.toHaveProperty('userId')
    expect(out.platform).toBe('instagram')
    expect(out.contentType).toBe('video')
    expect(out.author).toBe('somereel')
    expect(out.url).toBe('https://www.instagram.com/reel/abc123/')
  })

  it('tiktokToTheaterItem derives the thumbnail proxy URL and a snowflake createdAt', () => {
    // A TikTok id whose high 32 bits decode to a plausible 2024 timestamp.
    const secs = Math.floor(new Date('2024-06-01T00:00:00Z').getTime() / 1000)
    const id = (BigInt(secs) << BigInt(32)).toString()

    const out = tiktokToTheaterItem({
      id,
      handle: 'sometiktoker',
      author: 'sometiktoker',
      authorName: 'Some TikToker',
      text: 'a caption',
    })

    expect(out).not.toHaveProperty('userId')
    expect(out.platform).toBe('tiktok')
    expect(out.contentType).toBe('video')
    expect(out.thumbnailUrl).toBe(`/api/media/tiktok/thumbnail?username=sometiktoker&id=${id}`)
    expect(out.url).toBe(`https://www.tiktok.com/@sometiktoker/video/${id}`)
    expect(new Date(out.createdAt).getUTCFullYear()).toBe(2024)
  })

  it('tiktokToTheaterItem falls back to now() when the id does not decode to a plausible date', () => {
    const out = tiktokToTheaterItem({
      id: '1',
      handle: 'someone',
      author: null,
      authorName: null,
      text: null,
    })

    expect(out.author).toBe('someone')
    expect(Number.isNaN(new Date(out.createdAt).getTime())).toBe(false)
  })

  it('youtubeToTheaterItem is always contentType video with the i.ytimg.com thumbnail', () => {
    const out = youtubeToTheaterItem({
      id: 'dQw4w9WgXcQ',
      author: '@somechannel',
      authorName: 'Some Channel',
      text: 'a title',
    })

    expect(out).not.toHaveProperty('userId')
    expect(out.platform).toBe('youtube')
    expect(out.contentType).toBe('video')
    expect(out.author).toBe('somechannel')
    expect(out.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(out.url).toBe('https://www.youtube.com/shorts/dQw4w9WgXcQ')
  })
})
