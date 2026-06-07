import { describe, it, expect } from 'vitest'
import {
  dayDiff,
  effectiveCurrent,
  recordDay,
  isValidDay,
  type StreakState,
} from '@/lib/triage/streak'

describe('triage streak — dayDiff', () => {
  it('counts whole calendar days, including month/year boundaries', () => {
    expect(dayDiff('2026-06-05', '2026-06-05')).toBe(0)
    expect(dayDiff('2026-06-05', '2026-06-06')).toBe(1)
    expect(dayDiff('2026-06-05', '2026-06-12')).toBe(7)
    expect(dayDiff('2026-06-30', '2026-07-01')).toBe(1)
    expect(dayDiff('2026-12-31', '2027-01-01')).toBe(1)
    expect(dayDiff('2026-06-06', '2026-06-05')).toBe(-1)
  })
})

describe('triage streak — isValidDay', () => {
  it('accepts YYYY-MM-DD only', () => {
    expect(isValidDay('2026-06-05')).toBe(true)
    expect(isValidDay('2026-6-5')).toBe(false)
    expect(isValidDay('nonsense')).toBe(false)
    expect(isValidDay(undefined)).toBe(false)
    expect(isValidDay(20260605)).toBe(false)
  })
})

describe('triage streak — effectiveCurrent (display, no mutation)', () => {
  const state: StreakState = { current: 7, longest: 10, lastActiveDate: '2026-06-05' }
  it('is 0 when there is no state', () => {
    expect(effectiveCurrent(null, '2026-06-05')).toBe(0)
  })
  it('keeps the streak when active today or yesterday', () => {
    expect(effectiveCurrent(state, '2026-06-05')).toBe(7) // today
    expect(effectiveCurrent(state, '2026-06-06')).toBe(7) // yesterday → still alive
  })
  it('shows 0 once a full day has been missed', () => {
    expect(effectiveCurrent(state, '2026-06-07')).toBe(0) // missed the 6th
    expect(effectiveCurrent(state, '2026-07-01')).toBe(0)
  })
})

describe('triage streak — recordDay (mutation)', () => {
  it('starts a streak from nothing', () => {
    expect(recordDay(null, '2026-06-05')).toEqual({
      current: 1,
      longest: 1,
      lastActiveDate: '2026-06-05',
    })
  })

  it('is idempotent within the same day', () => {
    const s: StreakState = { current: 3, longest: 5, lastActiveDate: '2026-06-05' }
    expect(recordDay(s, '2026-06-05')).toEqual(s)
  })

  it('increments on a consecutive day', () => {
    const s: StreakState = { current: 3, longest: 5, lastActiveDate: '2026-06-05' }
    expect(recordDay(s, '2026-06-06')).toEqual({
      current: 4,
      longest: 5,
      lastActiveDate: '2026-06-06',
    })
  })

  it('updates longest when the current run exceeds it', () => {
    const s: StreakState = { current: 5, longest: 5, lastActiveDate: '2026-06-05' }
    expect(recordDay(s, '2026-06-06')).toEqual({
      current: 6,
      longest: 6,
      lastActiveDate: '2026-06-06',
    })
  })

  it('resets to 1 after a missed day (keeps longest)', () => {
    const s: StreakState = { current: 9, longest: 9, lastActiveDate: '2026-06-05' }
    expect(recordDay(s, '2026-06-08')).toEqual({
      current: 1,
      longest: 9,
      lastActiveDate: '2026-06-08',
    })
  })

  it('ignores out-of-order (clock-skew) days', () => {
    const s: StreakState = { current: 4, longest: 9, lastActiveDate: '2026-06-05' }
    expect(recordDay(s, '2026-06-04')).toEqual(s)
  })
})
