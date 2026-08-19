import { describe, it, expect } from 'vitest'
import {
  pinKeyFirst,
  theaterUrlSyncPath,
  isScrollableTarget,
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
 * isScrollableTarget() backs the mobile gesture split between a theater
 * swipe and native scroll/selection/link behavior. Exercised with minimal
 * duck-typed stand-ins for `Element` (closest/parentElement) rather than a
 * real DOM, since this suite runs in the `node` vitest environment — a
 * `getOverflowY` override replaces `window.getComputedStyle`.
 */
describe('isScrollableTarget', () => {
  // `Element.parentElement` is typed as `HTMLElement | null` (not `Element`)
  // in lib.dom, so the stand-in returns `HTMLElement` to satisfy that field.
  function fakeEl(overrides: Partial<HTMLElement> = {}): HTMLElement {
    return {
      closest: () => null,
      parentElement: null,
      ...overrides,
    } as unknown as HTMLElement
  }

  it('returns false for a null target', () => {
    expect(isScrollableTarget(null, null)).toBe(false)
  })

  it('returns true when the target or an ancestor matches the opt-out selector (data-theater-scroll, a, button, input, textarea)', () => {
    const match = fakeEl()
    const el = fakeEl({ closest: () => match })
    expect(isScrollableTarget(el, null)).toBe(true)
  })

  it('returns false when nothing opts out and no ancestor up to root is independently scrollable', () => {
    const root = fakeEl()
    const el = fakeEl({ parentElement: root })
    expect(isScrollableTarget(el, root, () => 'visible')).toBe(false)
  })

  it('returns true for an ancestor between the target and root that is independently scrollable (e.g. StageArticle’s own reader, which we cannot tag)', () => {
    const root = fakeEl()
    const scrollableAncestor = fakeEl({ parentElement: root })
    const el = fakeEl({ parentElement: scrollableAncestor })
    const getOverflowY = (node: Element) => (node === scrollableAncestor ? 'auto' : 'visible')
    expect(isScrollableTarget(el, root, getOverflowY)).toBe(true)
  })

  it('treats overflow-y: scroll the same as auto', () => {
    const root = fakeEl()
    const el = fakeEl({ parentElement: root })
    expect(isScrollableTarget(el, root, () => 'scroll')).toBe(true)
  })

  it('does not consider root itself, even when root is scrollable — the walk stops before it', () => {
    const root = fakeEl()
    const el = fakeEl({ parentElement: root })
    const getOverflowY = (node: Element) => (node === root ? 'auto' : 'visible')
    expect(isScrollableTarget(el, root, getOverflowY)).toBe(false)
  })
})
