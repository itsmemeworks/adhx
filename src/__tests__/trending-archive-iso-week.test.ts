import { describe, it, expect } from 'vitest'
import {
  isoWeekOf,
  isoWeekSlugOf,
  isoWeekStart,
  isoWeeksInYear,
  isoWeekRange,
  parseIsoWeekSlug,
  formatIsoWeekRange,
  shiftWeekSlug,
  currentIsoWeekSlug,
  isCurrentIsoWeek,
} from '@/lib/trending/archive'

/**
 * ISO-8601 week helper tests. Expected values verified independently against
 * Python's `datetime.date.isocalendar()` (the reference ISO week implementation)
 * for every case below — see the PR description for the verification transcript.
 */

describe('isoWeekOf', () => {
  it('handles the ordinary case', () => {
    expect(isoWeekOf(new Date('2026-07-20T00:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 30 })
    expect(isoWeekOf(new Date('2026-07-26T00:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 30 })
    expect(isoWeekOf(new Date('2026-07-27T00:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 31 })
  })

  it('rolls a late-December date into next ISO year week 1', () => {
    // 2025-12-29 is a Monday and belongs to 2026's first ISO week.
    expect(isoWeekOf(new Date('2025-12-29T00:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 1 })
    expect(isoWeekOf(new Date('2025-12-31T00:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 1 })
  })

  it('handles Jan 1 landing in the previous ISO year (53-week year)', () => {
    // 2021-01-01 is a Friday and belongs to 2020's 53rd ISO week.
    expect(isoWeekOf(new Date('2020-12-31T00:00:00Z'))).toEqual({ isoYear: 2020, isoWeek: 53 })
    expect(isoWeekOf(new Date('2021-01-01T00:00:00Z'))).toEqual({ isoYear: 2020, isoWeek: 53 })
  })

  it('handles Jan 4 boundary (always ISO week 1)', () => {
    expect(isoWeekOf(new Date('2026-01-04T00:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 1 })
    expect(isoWeekOf(new Date('2026-01-05T00:00:00Z'))).toEqual({ isoYear: 2026, isoWeek: 2 })
  })

  it('rolls late-December dates forward into the next ISO year (non-53-week case)', () => {
    expect(isoWeekOf(new Date('2024-12-30T00:00:00Z'))).toEqual({ isoYear: 2025, isoWeek: 1 })
    expect(isoWeekOf(new Date('2024-12-31T00:00:00Z'))).toEqual({ isoYear: 2025, isoWeek: 1 })
  })
})

describe('isoWeekSlugOf', () => {
  it('zero-pads and lowercases', () => {
    expect(isoWeekSlugOf({ isoYear: 2026, isoWeek: 1 })).toBe('2026-w01')
    expect(isoWeekSlugOf({ isoYear: 2026, isoWeek: 30 })).toBe('2026-w30')
    expect(isoWeekSlugOf({ isoYear: 2020, isoWeek: 53 })).toBe('2020-w53')
  })
})

describe('isoWeekStart / isoWeekRange', () => {
  it('week 1 starts on the Monday on/before Jan 4', () => {
    expect(isoWeekStart(2026, 1).toISOString()).toBe('2025-12-29T00:00:00.000Z')
    expect(isoWeekStart(2026, 30).toISOString()).toBe('2026-07-20T00:00:00.000Z')
  })

  it('range end is exclusive and exactly 7 days after start', () => {
    const { start, end } = isoWeekRange(2026, 30)
    expect(start.toISOString()).toBe('2026-07-20T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-07-27T00:00:00.000Z')
  })

  it('round-trips through isoWeekOf for every week boundary', () => {
    for (const [year, week] of [
      [2026, 1],
      [2026, 30],
      [2026, 52],
      [2020, 53],
      [2025, 1],
    ] as const) {
      const { start } = isoWeekRange(year, week)
      expect(isoWeekOf(start)).toEqual({ isoYear: year, isoWeek: week })
    }
  })
})

describe('isoWeeksInYear', () => {
  it('reports 52 for an ordinary year and 53 for a long year', () => {
    // 2025 is an ordinary 52-week year; 2020 and 2026 are both 53-week years.
    expect(isoWeeksInYear(2025)).toBe(52)
    expect(isoWeeksInYear(2020)).toBe(53)
    expect(isoWeeksInYear(2026)).toBe(53)
  })
})

describe('parseIsoWeekSlug', () => {
  it('parses valid slugs case-insensitively', () => {
    expect(parseIsoWeekSlug('2026-w30')).toEqual({ isoYear: 2026, isoWeek: 30 })
    expect(parseIsoWeekSlug('2026-W30')).toEqual({ isoYear: 2026, isoWeek: 30 })
    expect(parseIsoWeekSlug('  2026-w30  ')).toEqual({ isoYear: 2026, isoWeek: 30 })
  })

  it('rejects malformed slugs', () => {
    expect(parseIsoWeekSlug('2026-30')).toBeNull()
    expect(parseIsoWeekSlug('2026-w3')).toBeNull()
    expect(parseIsoWeekSlug('26-w30')).toBeNull()
    expect(parseIsoWeekSlug('not-a-week')).toBeNull()
    expect(parseIsoWeekSlug('2026-w00')).toBeNull()
  })

  it('rejects a week number that does not exist for that ISO year', () => {
    // 2025 has only 52 ISO weeks.
    expect(parseIsoWeekSlug('2025-w53')).toBeNull()
    // 2020 and 2026 both have 53.
    expect(parseIsoWeekSlug('2020-w53')).toEqual({ isoYear: 2020, isoWeek: 53 })
    expect(parseIsoWeekSlug('2026-w53')).toEqual({ isoYear: 2026, isoWeek: 53 })
  })
})

describe('formatIsoWeekRange', () => {
  it('formats a same-month range', () => {
    const { start, end } = isoWeekRange(2026, 30)
    expect(formatIsoWeekRange(start, end)).toBe('Jul 20–26, 2026')
  })

  it('formats a cross-month range within the same year', () => {
    // 2026-W27 is Jun 29 - Jul 5, 2026.
    const { start, end } = isoWeekRange(2026, 27)
    expect(formatIsoWeekRange(start, end)).toBe('Jun 29 – Jul 5, 2026')
  })

  it('formats a cross-year range', () => {
    // 2026-W01 is Dec 29, 2025 - Jan 4, 2026.
    const { start, end } = isoWeekRange(2026, 1)
    expect(formatIsoWeekRange(start, end)).toBe('Dec 29, 2025 – Jan 4, 2026')
  })
})

describe('shiftWeekSlug', () => {
  it('moves forward and backward across a year boundary', () => {
    expect(shiftWeekSlug('2026-w01', -1)).toBe('2025-w52')
    expect(shiftWeekSlug('2025-w52', 1)).toBe('2026-w01')
  })

  it('returns null for an invalid slug', () => {
    expect(shiftWeekSlug('nope', 1)).toBeNull()
  })
})

describe('currentIsoWeekSlug / isCurrentIsoWeek', () => {
  it('agree with each other for "now"', () => {
    expect(isCurrentIsoWeek(currentIsoWeekSlug())).toBe(true)
  })

  it('is false for a week far in the past', () => {
    expect(isCurrentIsoWeek('2020-w01')).toBe(false)
  })
})
