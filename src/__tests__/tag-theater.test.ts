import { describe, it, expect } from 'vitest'
import { computeLoopedNext, computeLoopedPrev } from '@/components/theater/TheaterShell'
import { tagItemToTheaterItem, buildCollectionSeed } from '@/lib/theater/tag-seed'
import type { TagItem } from '@/lib/tags/query'

/**
 * Pure-logic tests for tag-collections-as-theater (`/t/{username}/{tag}`):
 * loop navigation (goNext/goPrev wrap instead of clamping/waiting) and the
 * `TagItem` → `TheaterItem` seed conversion. Component-level behavior
 * (chrome branching, Save-collection CTA) is exercised by
 * `theater-desktop-chrome.component.test.tsx` / manual review — these cover
 * the pure functions the parent agent asked for directly.
 */

describe('computeLoopedNext', () => {
  it('advances normally before the last item, loop on or off', () => {
    expect(computeLoopedNext(4, 0, false)).toBe(1)
    expect(computeLoopedNext(4, 2, false)).toBe(3)
    expect(computeLoopedNext(4, 0, true)).toBe(1)
    expect(computeLoopedNext(4, 2, true)).toBe(3)
  })

  it('wraps to 0 from the last item when looping', () => {
    expect(computeLoopedNext(4, 3, true)).toBe(0)
    expect(computeLoopedNext(1, 0, true)).toBe(0)
  })

  it('signals "waiting" from the last item when not looping', () => {
    expect(computeLoopedNext(4, 3, false)).toBe('waiting')
    expect(computeLoopedNext(1, 0, false)).toBe('waiting')
  })

  it('returns null for a not-found index or an empty list', () => {
    expect(computeLoopedNext(4, -1, true)).toBe(null)
    expect(computeLoopedNext(4, -1, false)).toBe(null)
    expect(computeLoopedNext(0, -1, true)).toBe(null)
  })
})

describe('computeLoopedPrev', () => {
  it('steps back normally past the first item, loop on or off', () => {
    expect(computeLoopedPrev(4, 3, false)).toBe(2)
    expect(computeLoopedPrev(4, 1, true)).toBe(0)
  })

  it('wraps to the last item from index 0 when looping', () => {
    expect(computeLoopedPrev(4, 0, true)).toBe(3)
    expect(computeLoopedPrev(1, 0, true)).toBe(0)
  })

  it('is a no-op at index 0 when not looping (existing "back does nothing at the start" behavior)', () => {
    expect(computeLoopedPrev(4, 0, false)).toBe(null)
  })

  it('returns null for a not-found index or an empty list', () => {
    expect(computeLoopedPrev(4, -1, true)).toBe(null)
    expect(computeLoopedPrev(0, -1, true)).toBe(null)
  })
})

function tagItem(overrides: Partial<TagItem> = {}): TagItem {
  return {
    bookmarkId: '1',
    platform: 'twitter',
    author: 'alice',
    authorName: 'Alice',
    authorAvatarUrl: null,
    text: 'hello world',
    thumbnailUrl: null,
    extraMediaCount: 0,
    contentType: 'text',
    createdAt: '2026-06-06T10:00:00Z',
    url: '/alice/status/1',
    externalUrl: 'https://x.com/alice/status/1',
    ...overrides,
  }
}

describe('tagItemToTheaterItem', () => {
  it('maps identity + display fields straight through', () => {
    const item = tagItemToTheaterItem(tagItem())
    expect(item.platform).toBe('twitter')
    expect(item.bookmarkId).toBe('1')
    expect(item.author).toBe('alice')
    expect(item.authorName).toBe('Alice')
    expect(item.text).toBe('hello world')
    expect(item.contentType).toBe('text')
    expect(item.createdAt).toBe('2026-06-06T10:00:00Z')
  })

  it('prefers the external (source) URL over the on-ADHX preview path', () => {
    const item = tagItemToTheaterItem(
      tagItem({ url: '/alice/status/1', externalUrl: 'https://x.com/alice/status/1' }),
    )
    expect(item.url).toBe('https://x.com/alice/status/1')
  })

  it('falls back to the preview path when there is no external URL', () => {
    const item = tagItemToTheaterItem(tagItem({ externalUrl: null }))
    expect(item.url).toBe('/alice/status/1')
  })

  it('falls back to the epoch when createdAt is null, never leaving it undefined', () => {
    const item = tagItemToTheaterItem(tagItem({ createdAt: null }))
    expect(item.createdAt).toBe(new Date(0).toISOString())
  })

  /**
   * Owner report: the collection theater showed "56y" for a saved TikTok
   * with no stored `createdAt` — the epoch sentinel backfilled above.
   * `addedAt` is the display-only field the chromes render instead: when
   * the post was first saved to ADHX (owner decision — deliberately never
   * the source platform's own publish date, for any platform).
   */
  describe('addedAt (display-only "first saved to ADHX" time)', () => {
    it('passes the TagItem addedAt straight through, regardless of platform', () => {
      const item = tagItemToTheaterItem(tagItem({ addedAt: '2026-07-01T00:00:00Z' }))
      expect(item.addedAt).toBe('2026-07-01T00:00:00Z')
    })

    it('is null when the TagItem carries no addedAt (older fixtures/consumers)', () => {
      const item = tagItemToTheaterItem(tagItem({ addedAt: undefined }))
      expect(item.addedAt).toBe(null)
    })

    it('is null when the TagItem explicitly carries a null addedAt', () => {
      const item = tagItemToTheaterItem(tagItem({ addedAt: null }))
      expect(item.addedAt).toBe(null)
    })

    it('never falls back to createdAt — the two are independent fields', () => {
      const item = tagItemToTheaterItem(
        tagItem({ createdAt: '2026-06-06T10:00:00Z', addedAt: '2026-07-01T00:00:00Z' }),
      )
      expect(item.createdAt).toBe('2026-06-06T10:00:00Z')
      expect(item.addedAt).toBe('2026-07-01T00:00:00Z')
    })
  })
})

describe('buildCollectionSeed', () => {
  it('converts every item and zeroes out the live-pulse-only counters', () => {
    const seed = buildCollectionSeed([
      tagItem({ bookmarkId: '1' }),
      tagItem({ bookmarkId: '2', platform: 'tiktok', author: 'bob' }),
    ])
    expect(seed.items).toHaveLength(2)
    expect(seed.items.map((i) => i.bookmarkId)).toEqual(['1', '2'])
    expect(seed.savedToday).toBe(0)
    expect(seed.recentActivity).toBe(0)
  })

  it('returns an empty seed for an empty collection', () => {
    const seed = buildCollectionSeed([])
    expect(seed.items).toEqual([])
  })
})
