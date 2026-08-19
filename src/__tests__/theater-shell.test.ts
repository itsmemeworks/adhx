import { describe, it, expect } from 'vitest'
import {
  pinKeyFirst,
  theaterUrlSyncPath,
  isFeedEnd,
  computeCanPrev,
  computeCanNext,
  findFreshArrival,
} from '@/components/theater/TheaterShell'
import { theaterItemKey } from '@/components/theater/types'

/**
 * Pure list-reorder helper backing TheaterShell's lead-pick/shared-item
 * pinning (docs/specs/theater-first.md): moves the item matching `pinnedKey`
 * to index 0 so the rail's visual order and the keyboard-nav order are
 * always the same list.
 */

type Item = { platform: string; bookmarkId: string; url: string }

function item(bookmarkId: string): Item {
  return { platform: 'twitter', bookmarkId, url: `https://x.com/u/status/${bookmarkId}` }
}

describe('pinKeyFirst', () => {
  const items = [item('a'), item('b'), item('c'), item('d')]

  it('moves the matching item to the front, preserving the rest of the order', () => {
    const key = theaterItemKey(item('c'))
    const result = pinKeyFirst(items, key)
    expect(result.map((it) => it.bookmarkId)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('returns the list unchanged (same reference) when the key is not found', () => {
    const result = pinKeyFirst(items, theaterItemKey(item('missing')))
    expect(result).toBe(items)
  })

  it('returns the list unchanged (same reference) when the key is already first', () => {
    const key = theaterItemKey(item('a'))
    const result = pinKeyFirst(items, key)
    expect(result).toBe(items)
  })

  it('returns the list unchanged when pinnedKey is null', () => {
    const result = pinKeyFirst(items, null)
    expect(result).toBe(items)
  })
})

/**
 * theaterUrlSyncPath() backs TheaterShell's address-bar sync (theater-first.md
 * §7): guards previewPath() with the "id AND author both present" rule so a
 * malformed path (e.g. `//status/123`) never reaches history.replaceState.
 */
describe('theaterUrlSyncPath', () => {
  it('builds the canonical preview path for a tweet', () => {
    expect(theaterUrlSyncPath({ platform: 'twitter', bookmarkId: '123', author: 'someuser' })).toBe(
      '/someuser/status/123',
    )
  })

  it('builds the canonical preview path for instagram, tiktok, and youtube', () => {
    expect(
      theaterUrlSyncPath({ platform: 'instagram', bookmarkId: 'abc', author: 'someuser' }),
    ).toBe('/reels/abc')
    expect(theaterUrlSyncPath({ platform: 'tiktok', bookmarkId: '999', author: '@someuser' })).toBe(
      '/@someuser/video/999',
    )
    expect(theaterUrlSyncPath({ platform: 'youtube', bookmarkId: 'xyz', author: 'someuser' })).toBe(
      '/shorts/xyz',
    )
  })

  it('returns null when bookmarkId is missing', () => {
    expect(theaterUrlSyncPath({ platform: 'twitter', bookmarkId: null, author: 'someuser' })).toBe(
      null,
    )
    expect(
      theaterUrlSyncPath({ platform: 'twitter', bookmarkId: undefined, author: 'someuser' }),
    ).toBe(null)
    expect(theaterUrlSyncPath({ platform: 'twitter', bookmarkId: '', author: 'someuser' })).toBe(
      null,
    )
  })

  it('returns null when author is missing or empty', () => {
    expect(theaterUrlSyncPath({ platform: 'twitter', bookmarkId: '123', author: '' })).toBe(null)
  })

  it('returns null for a null item', () => {
    expect(theaterUrlSyncPath(null)).toBe(null)
  })
})

/**
 * End-of-feed waiting stage (theater-first.md addendum): the theater dead-
 * ends at the last post otherwise while fresh pulse items prepend unseen at
 * the top. These pure helpers back TheaterShell's enter/exit transitions —
 * see isFeedEnd (enters), computeCanPrev/computeCanNext (chevron state),
 * findFreshArrival (exits + auto-plays a genuinely new post).
 */
describe('isFeedEnd', () => {
  it('is true at the last index of a non-empty list', () => {
    expect(isFeedEnd(4, 3)).toBe(true)
  })

  it('is false everywhere before the last index', () => {
    expect(isFeedEnd(4, 0)).toBe(false)
    expect(isFeedEnd(4, 2)).toBe(false)
  })

  it('is false for a not-found index (-1), matching the pre-waiting clamp no-op', () => {
    expect(isFeedEnd(4, -1)).toBe(false)
  })

  it('is true for a single-item list at index 0', () => {
    expect(isFeedEnd(1, 0)).toBe(true)
  })
})

describe('computeCanPrev / computeCanNext', () => {
  it('mid-feed: prev enabled past the first item, next always enabled (not waiting)', () => {
    expect(computeCanPrev(2, false)).toBe(true)
    expect(computeCanNext(2, false)).toBe(true)
  })

  it('at the first item (not waiting): prev disabled, next enabled', () => {
    expect(computeCanPrev(0, false)).toBe(false)
    expect(computeCanNext(0, false)).toBe(true)
  })

  it('at the last real item (not waiting): next stays enabled — it leads into waiting', () => {
    expect(computeCanNext(3, false)).toBe(true)
  })

  it('while waiting: prev enabled (returns to the last post), next disabled', () => {
    expect(computeCanPrev(3, true)).toBe(true)
    expect(computeCanNext(3, true)).toBe(false)
  })

  it('no current item (-1): both disabled regardless of waiting', () => {
    expect(computeCanNext(-1, false)).toBe(false)
    expect(computeCanNext(-1, true)).toBe(false)
  })
})

describe('findFreshArrival', () => {
  it('returns null when freshKeys has nothing beyond the baseline', () => {
    const baseline = new Set(['twitter:1', 'twitter:2'])
    const freshKeys = new Set(['twitter:1', 'twitter:2'])
    expect(findFreshArrival(freshKeys, baseline)).toBe(null)
  })

  it('returns a key present in freshKeys but not in the baseline', () => {
    const baseline = new Set(['twitter:1'])
    const freshKeys = new Set(['twitter:1', 'twitter:3'])
    expect(findFreshArrival(freshKeys, baseline)).toBe('twitter:3')
  })

  it('returns the earliest-inserted new key when several arrived', () => {
    const baseline = new Set(['twitter:1'])
    const freshKeys = new Set(['twitter:1', 'twitter:2', 'twitter:3'])
    expect(findFreshArrival(freshKeys, baseline)).toBe('twitter:2')
  })

  it('returns null against an empty freshKeys set', () => {
    expect(findFreshArrival(new Set(), new Set())).toBe(null)
  })
})
