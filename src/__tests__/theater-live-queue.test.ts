import { describe, it, expect } from 'vitest'
import {
  orderUnseenFirst,
  unseenBlockLength,
  computeLiveNext,
} from '@/components/theater/TheaterShell'

/**
 * Live mode is "the last 24 hours of community activity", and what plays is
 * what you HAVEN'T watched (owner):
 *   - unseen posts sort to the front, so index 0 is always the next unwatched
 *     post and a refresh resumes there with nothing persisted;
 *   - auto-advance stops at the end of the unseen block instead of replaying
 *     watched posts;
 *   - browsing on, repeat 'all', and the explicit re-watch button all pass
 *     through that boundary.
 */

type Item = { platform: string; bookmarkId: string; url: string }
const item = (id: string): Item => ({ platform: 'twitter', bookmarkId: id, url: `/a/status/${id}` })
const key = (id: string) => `twitter:${id}`
const seenSet = (...ids: string[]) => {
  const set = new Set(ids.map(key))
  return (k: string) => set.has(k)
}

describe('orderUnseenFirst', () => {
  it('moves watched posts behind unwatched ones, preserving recency within each block', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map(item)
    const ordered = orderUnseenFirst(items, seenSet('a', 'c'))
    expect(ordered.map((i) => i.bookmarkId)).toEqual(['b', 'd', 'e', 'a', 'c'])
  })

  it('returns the same reference when nothing needs reordering', () => {
    const items = ['a', 'b'].map(item)
    expect(orderUnseenFirst(items, seenSet())).toBe(items)
    expect(orderUnseenFirst(items, seenSet('a', 'b'))).toBe(items)
  })

  it('handles an empty queue', () => {
    expect(orderUnseenFirst([], seenSet('a'))).toEqual([])
  })
})

describe('unseenBlockLength', () => {
  it('counts the leading unwatched run — the index the watched block starts at', () => {
    const ordered = orderUnseenFirst(['a', 'b', 'c'].map(item), seenSet('a'))
    expect(unseenBlockLength(ordered, seenSet('a'))).toBe(2)
  })

  it('is 0 when everything has been watched (the caught-up case)', () => {
    const items = ['a', 'b'].map(item)
    expect(unseenBlockLength(items, seenSet('a', 'b'))).toBe(0)
  })

  it('is the whole length on a first visit', () => {
    const items = ['a', 'b', 'c'].map(item)
    expect(unseenBlockLength(items, seenSet())).toBe(3)
  })
})

describe('computeLiveNext', () => {
  const base = { length: 5, unseenCount: 2, loop: false, userInitiated: false }

  it('advances inside the unseen block', () => {
    expect(computeLiveNext({ ...base, index: 0 })).toBe(1)
  })

  it('waits instead of auto-advancing into an already-watched post', () => {
    expect(computeLiveNext({ ...base, index: 1 })).toBe('waiting')
  })

  it('lets the user browse straight past the boundary', () => {
    expect(computeLiveNext({ ...base, index: 1, userInitiated: true })).toBe(2)
  })

  it('lets repeat "all" (loop) past the boundary and wrap', () => {
    expect(computeLiveNext({ ...base, index: 1, loop: true })).toBe(2)
    expect(computeLiveNext({ ...base, index: 4, loop: true })).toBe(0)
  })

  it('applies no boundary once nothing is unseen (a re-watch, or all watched)', () => {
    expect(computeLiveNext({ ...base, index: 1, unseenCount: 0 })).toBe(2)
    expect(computeLiveNext({ ...base, index: 3, unseenCount: 0 })).toBe(4)
  })

  it('still waits at the true end of the queue', () => {
    expect(computeLiveNext({ ...base, index: 4, unseenCount: 0 })).toBe('waiting')
    expect(computeLiveNext({ ...base, index: 4, unseenCount: 0, userInitiated: true })).toBe(
      'waiting',
    )
  })

  it('is a no-op for an unknown index or an empty queue', () => {
    expect(computeLiveNext({ ...base, index: -1 })).toBeNull()
    expect(computeLiveNext({ ...base, length: 0, index: 0 })).toBeNull()
  })

  it('never strands a first-time visitor: a whole-queue unseen block plays through', () => {
    const unseenCount = 5
    const path: (number | string | null)[] = []
    for (let i = 0; i < 5; i++) path.push(computeLiveNext({ ...base, index: i, unseenCount }))
    expect(path).toEqual([1, 2, 3, 4, 'waiting'])
  })
})
