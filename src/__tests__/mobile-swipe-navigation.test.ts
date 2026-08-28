import { describe, expect, it } from 'vitest'
import { resolveMobileSwipe } from '@/components/theater/useMobileSwipeNavigation'

describe('resolveMobileSwipe', () => {
  const start = { x: 90, y: 320, at: 100 }

  it('maps an upward swipe to next and a downward swipe to previous', () => {
    expect(resolveMobileSwipe(start, { x: 94, y: 240, at: 420 })).toBe('next')
    expect(resolveMobileSwipe(start, { x: 86, y: 400, at: 420 })).toBe('prev')
  })

  it('accepts a short, fast thumb flick', () => {
    expect(resolveMobileSwipe(start, { x: 92, y: 282, at: 280 })).toBe('next')
  })

  it('rejects taps, horizontal drags, and slow holds', () => {
    expect(resolveMobileSwipe(start, { x: 92, y: 310, at: 180 })).toBeNull()
    expect(resolveMobileSwipe(start, { x: 170, y: 260, at: 300 })).toBeNull()
    expect(resolveMobileSwipe(start, { x: 92, y: 230, at: 1_100 })).toBeNull()
  })
})
