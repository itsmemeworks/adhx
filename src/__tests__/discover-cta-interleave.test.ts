import { describe, it, expect } from 'vitest'
import { shouldInsertCtaAfter, CTA_INTERVAL } from '@/lib/discover/interleave-cta'

describe('shouldInsertCtaAfter', () => {
  it('is false for every count before the first interval', () => {
    for (let count = 0; count < CTA_INTERVAL; count++) {
      expect(shouldInsertCtaAfter(count)).toBe(false)
    }
  })

  it('fires at the first interval (18) and every interval after that', () => {
    expect(shouldInsertCtaAfter(18)).toBe(true)
    expect(shouldInsertCtaAfter(36)).toBe(true)
    expect(shouldInsertCtaAfter(54)).toBe(true)
  })

  it('is false between intervals', () => {
    expect(shouldInsertCtaAfter(19)).toBe(false)
    expect(shouldInsertCtaAfter(35)).toBe(false)
    expect(shouldInsertCtaAfter(37)).toBe(false)
  })

  it('respects a custom interval', () => {
    expect(shouldInsertCtaAfter(5, 5)).toBe(true)
    expect(shouldInsertCtaAfter(10, 5)).toBe(true)
    expect(shouldInsertCtaAfter(4, 5)).toBe(false)
  })

  it('never fires for count 0 or a non-positive interval', () => {
    expect(shouldInsertCtaAfter(0)).toBe(false)
    expect(shouldInsertCtaAfter(18, 0)).toBe(false)
    expect(shouldInsertCtaAfter(18, -1)).toBe(false)
  })

  it('produces the expected insertion positions across a full page of items', () => {
    // Simulates the render loop in DiscoverFeed: for a list of N items, collect
    // the 1-indexed counts after which a CTA slot should appear.
    const total = 40
    const positions: number[] = []
    for (let i = 0; i < total; i++) {
      if (shouldInsertCtaAfter(i + 1)) positions.push(i + 1)
    }
    expect(positions).toEqual([18, 36])
  })
})
