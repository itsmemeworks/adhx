import { describe, it, expect } from 'vitest'
import { mergeFeedItems, replaceFeedItem } from '@/components/theater/useTheaterFeed'
import type { TrendingItem } from '@/lib/trending/query'

/**
 * Pure merge logic for the theater's live feed poll (spec §4): an unknown key
 * NEWER than the current top inserts at the top and is reported via freshKeys;
 * an unknown key that is OLDER appends quietly at the bottom (an old post must
 * never surface at the top of Up next as "new"); anything already present
 * keeps its exact object reference and position so playback isn't disturbed
 * by a poll tick.
 */

const make = (
  bookmarkId: string,
  platform: TrendingItem['platform'] = 'twitter',
  createdAt = '2026-06-08T00:00:00Z',
): TrendingItem => ({
  action: 'save',
  platform,
  bookmarkId,
  author: 'someone',
  url: `/someone/status/${bookmarkId}`,
  createdAt,
})

const NEWER = '2026-06-09T00:00:00Z'
const OLDER = '2026-06-07T00:00:00Z'

describe('mergeFeedItems', () => {
  it('returns prev unchanged (same reference) when nothing new arrives', () => {
    const prev = [make('1'), make('2')]
    const { items, freshKeys } = mergeFeedItems(prev, [make('1'), make('2')])
    expect(items).toBe(prev)
    expect(freshKeys).toEqual([])
  })

  it('prepends genuinely new (newer) items and reports their keys as fresh', () => {
    const a = make('1')
    const b = make('2')
    const c = make('3', 'twitter', NEWER)
    const { items, freshKeys } = mergeFeedItems([a, b], [c, a, b])
    expect(items.map((i) => i.bookmarkId)).toEqual(['3', '1', '2'])
    expect(freshKeys).toEqual(['twitter:3'])
  })

  it('appends unknown-but-older items at the bottom, NOT as fresh', () => {
    // The regression this guards: the seed and the poll can cover slightly
    // different windows, so the first poll may "discover" items that are
    // actually older than everything already shown. They must not jump the
    // queue or get the new-item accent.
    const a = make('1')
    const b = make('2')
    const old = make('9', 'twitter', OLDER)
    const { items, freshKeys } = mergeFeedItems([a, b], [a, b, old])
    expect(items.map((i) => i.bookmarkId)).toEqual(['1', '2', '9'])
    expect(freshKeys).toEqual([])
  })

  it('handles newer and older unknowns in one tick', () => {
    const a = make('1')
    const fresh = make('3', 'twitter', NEWER)
    const old = make('9', 'twitter', OLDER)
    const { items, freshKeys } = mergeFeedItems([a], [fresh, a, old])
    expect(items.map((i) => i.bookmarkId)).toEqual(['3', '1', '9'])
    expect(freshKeys).toEqual(['twitter:3'])
  })

  it('preserves object identity for items that already existed', () => {
    const a = make('1')
    const b = make('2')
    const { items } = mergeFeedItems([a, b], [make('3', 'twitter', NEWER), make('1'), make('2')])
    // The '1' and '2' entries in the merged list must be the SAME objects —
    // not new ones with equal content — so an in-flight <video> isn't
    // disturbed by a poll tick.
    expect(items[1]).toBe(a)
    expect(items[2]).toBe(b)
  })

  it('preserves existing order — fresh items only ever land at the top', () => {
    const a = make('1')
    const b = make('2')
    const c = make('3')
    const { items } = mergeFeedItems([a, b, c], [make('4', 'twitter', NEWER), a, c, b])
    expect(items.map((i) => i.bookmarkId)).toEqual(['4', '1', '2', '3'])
  })

  it('does not treat items with the same bookmarkId on different platforms as duplicates', () => {
    const tw = make('1', 'twitter')
    const tk = make('1', 'tiktok', NEWER)
    const { items, freshKeys } = mergeFeedItems([tw], [tw, tk])
    expect(items.length).toBe(2)
    expect(freshKeys).toEqual(['tiktok:1'])
  })

  it('handles an empty prev list — everything is fresh', () => {
    const a = make('1')
    const { items, freshKeys } = mergeFeedItems([], [a])
    expect(items).toEqual([a])
    expect(freshKeys).toEqual(['twitter:1'])
  })
})

describe('replaceFeedItem', () => {
  it('swaps the matching key in place and keeps neighbors', () => {
    const a = make('1')
    const b = make('2')
    const upgraded = { ...a, text: 'resolved' }
    const prev = [a, b]
    const next = replaceFeedItem(prev, upgraded)
    expect(next).not.toBe(prev)
    expect(next[0]).toBe(upgraded)
    expect(next[1]).toBe(b)
  })

  it('prepends when the key is new', () => {
    const a = make('1')
    const b = make('9')
    expect(replaceFeedItem([a], b).map((i) => i.bookmarkId)).toEqual(['9', '1'])
  })

  it('returns prev when the object is already at that key', () => {
    const a = make('1')
    const prev = [a]
    expect(replaceFeedItem(prev, a)).toBe(prev)
  })
})
