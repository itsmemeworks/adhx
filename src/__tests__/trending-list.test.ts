import { describe, it, expect } from 'vitest'
import { rankItems } from '@/components/trending/TrendingRankedList'
import type { TheaterItem } from '@/components/theater/types'

/**
 * rankItems() Tests
 *
 * Pure ranking rule for the dark ranked list (/trending's "Top today"
 * semantics — distinct from the theater rail, which is pure recency):
 * highest trendCount first, newest createdAt as the tiebreak. Pure function,
 * no fetch/timer harness needed.
 */

function item(overrides: Partial<TheaterItem>): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: '1',
    author: 'someone',
    url: 'https://x.com/someone/status/1',
    createdAt: '2026-08-18T12:00:00Z',
    ...overrides,
  }
}

describe('rankItems', () => {
  it('sorts by trendCount descending', () => {
    const items = [
      item({ bookmarkId: 'a', trendCount: 1 }),
      item({ bookmarkId: 'b', trendCount: 5 }),
      item({ bookmarkId: 'c', trendCount: 3 }),
    ]
    expect(rankItems(items).map((i) => i.bookmarkId)).toEqual(['b', 'c', 'a'])
  })

  it('breaks ties by newest createdAt first', () => {
    const items = [
      item({ bookmarkId: 'old', trendCount: 4, createdAt: '2026-08-17T00:00:00Z' }),
      item({ bookmarkId: 'new', trendCount: 4, createdAt: '2026-08-18T00:00:00Z' }),
    ]
    expect(rankItems(items).map((i) => i.bookmarkId)).toEqual(['new', 'old'])
  })

  it('treats missing trendCount as 0', () => {
    const items = [
      item({ bookmarkId: 'untouched' }),
      item({ bookmarkId: 'trending', trendCount: 2 }),
    ]
    expect(rankItems(items).map((i) => i.bookmarkId)).toEqual(['trending', 'untouched'])
  })

  it('does not mutate the input array', () => {
    const items = [
      item({ bookmarkId: 'a', trendCount: 1 }),
      item({ bookmarkId: 'b', trendCount: 5 }),
    ]
    const original = [...items]
    rankItems(items)
    expect(items).toEqual(original)
  })
})
