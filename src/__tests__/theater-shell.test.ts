import { describe, it, expect } from 'vitest'
import { pinKeyFirst } from '@/components/theater/TheaterShell'
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
