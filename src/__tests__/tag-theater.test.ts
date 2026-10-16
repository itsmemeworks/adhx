import { describe, it, expect } from 'vitest'
import { computeLoopedNext, computeLoopedPrev } from '@/components/theater/TheaterShell'

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
