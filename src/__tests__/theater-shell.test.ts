import { describe, it, expect } from 'vitest'
import { pinKeyFirst, theaterUrlSyncPath } from '@/components/theater/TheaterShell'
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
