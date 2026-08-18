import { describe, it, expect } from 'vitest'
import { swipeDirection } from '@/components/theater/TheaterMobileChrome'

/**
 * Pure swipe-gesture decision for the mobile theater reel (spec §8): a
 * vertical swipe on the stage advances/retreats, gated to a dominant
 * vertical axis (|dy| > |dx| * 1.5) so horizontal scrubbing/taps never
 * misfire navigation.
 */

describe('swipeDirection', () => {
  it('returns "next" for an upward swipe past the threshold', () => {
    expect(swipeDirection(0, -60)).toBe('next')
  })

  it('returns "prev" for a downward swipe past the threshold', () => {
    expect(swipeDirection(0, 60)).toBe('prev')
  })

  it('returns null below the distance threshold (a tap)', () => {
    expect(swipeDirection(0, -30)).toBeNull()
    expect(swipeDirection(0, 30)).toBeNull()
  })

  it('returns null when horizontal movement dominates', () => {
    expect(swipeDirection(80, -60)).toBeNull()
  })

  it('returns null for a pure horizontal swipe (scrub)', () => {
    expect(swipeDirection(-70, 5)).toBeNull()
  })

  it('requires |dy| to exceed |dx| * 1.5, not just equal it', () => {
    expect(swipeDirection(32, -48)).toBeNull() // 48 <= 32*1.5 (48) -> rejected
    expect(swipeDirection(20, -48)).toBe('next') // 48 > 20*1.5 (30) -> accepted
  })

  it('accepts the distance threshold itself (only strictly-below is rejected)', () => {
    expect(swipeDirection(0, -48)).toBe('next')
    expect(swipeDirection(0, -47)).toBeNull()
  })
})
