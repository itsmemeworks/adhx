import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatCount, formatRelativeTime, formatCompactRelativeTime, truncate } from '@/lib/utils/format'

/**
 * Format Utilities Tests
 *
 * Tests number formatting, relative time formatting, and text truncation.
 */

describe('formatCount', () => {
  it('formats numbers under 1000 without suffix', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(1)).toBe('1')
    expect(formatCount(999)).toBe('999')
  })

  it('formats thousands with K suffix', () => {
    expect(formatCount(1000)).toBe('1.0K')
    expect(formatCount(1500)).toBe('1.5K')
    expect(formatCount(10000)).toBe('10.0K')
    expect(formatCount(999999)).toBe('1000.0K')
  })

  it('formats millions with M suffix', () => {
    expect(formatCount(1000000)).toBe('1.0M')
    expect(formatCount(1500000)).toBe('1.5M')
    expect(formatCount(10000000)).toBe('10.0M')
    expect(formatCount(999999999)).toBe('1000.0M')
  })

  it('handles edge cases at boundaries', () => {
    expect(formatCount(999)).toBe('999')
    expect(formatCount(1000)).toBe('1.0K')
    expect(formatCount(999999)).toBe('1000.0K')
    expect(formatCount(1000000)).toBe('1.0M')
  })

  it('handles decimal precision correctly', () => {
    expect(formatCount(1234)).toBe('1.2K')
    expect(formatCount(1250)).toBe('1.3K') // Rounds up
    expect(formatCount(1249)).toBe('1.2K') // Rounds down
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    // Mock Date.now to return a fixed time for consistent tests
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats today', () => {
    expect(formatRelativeTime('2024-06-15T10:00:00Z')).toBe('Today')
    expect(formatRelativeTime('2024-06-15T00:00:00Z')).toBe('Today')
  })

  it('formats yesterday', () => {
    expect(formatRelativeTime('2024-06-14T12:00:00Z')).toBe('Yesterday')
    expect(formatRelativeTime('2024-06-14T00:00:00Z')).toBe('Yesterday')
  })

  it('formats days ago (2-6 days)', () => {
    expect(formatRelativeTime('2024-06-13T12:00:00Z')).toBe('2d ago')
    expect(formatRelativeTime('2024-06-10T12:00:00Z')).toBe('5d ago')
    expect(formatRelativeTime('2024-06-09T12:00:00Z')).toBe('6d ago')
  })

  it('formats weeks ago (7-29 days)', () => {
    expect(formatRelativeTime('2024-06-08T12:00:00Z')).toBe('1w ago')
    expect(formatRelativeTime('2024-06-01T12:00:00Z')).toBe('2w ago')
    expect(formatRelativeTime('2024-05-17T12:00:00Z')).toBe('4w ago')
  })

  it('formats months ago (30-364 days)', () => {
    expect(formatRelativeTime('2024-05-15T12:00:00Z')).toBe('1mo ago')
    expect(formatRelativeTime('2024-03-15T12:00:00Z')).toBe('3mo ago')
    expect(formatRelativeTime('2023-07-15T12:00:00Z')).toBe('11mo ago')
  })

  it('formats years ago (365+ days)', () => {
    expect(formatRelativeTime('2023-06-15T12:00:00Z')).toBe('1y ago')
    expect(formatRelativeTime('2022-06-15T12:00:00Z')).toBe('2y ago')
    expect(formatRelativeTime('2019-06-15T12:00:00Z')).toBe('5y ago')
  })

  it('handles ISO date strings with different formats', () => {
    expect(formatRelativeTime('2024-06-15')).toBe('Today')
    // Note: 2024-06-14T23:59:59.999Z is only ~12 hours before 2024-06-15T12:00:00Z
    // so it's still "Today" (diffDays = 0) since we count full 24-hour periods
    expect(formatRelativeTime('2024-06-14T23:59:59.999Z')).toBe('Today')
  })
})

describe('formatCompactRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats less than 1 minute as "now"', () => {
    expect(formatCompactRelativeTime('2024-06-15T11:59:30Z')).toBe('now')
    expect(formatCompactRelativeTime('2024-06-15T11:59:59Z')).toBe('now')
  })

  it('formats minutes (1-59)', () => {
    expect(formatCompactRelativeTime('2024-06-15T11:30:00Z')).toBe('30m')
    expect(formatCompactRelativeTime('2024-06-15T11:45:00Z')).toBe('15m')
    expect(formatCompactRelativeTime('2024-06-15T11:01:00Z')).toBe('59m')
  })

  it('formats hours (1-23)', () => {
    expect(formatCompactRelativeTime('2024-06-15T09:00:00Z')).toBe('3h')
    expect(formatCompactRelativeTime('2024-06-15T11:00:00Z')).toBe('1h')
    expect(formatCompactRelativeTime('2024-06-14T13:00:00Z')).toBe('23h')
  })

  it('formats days (1-6)', () => {
    expect(formatCompactRelativeTime('2024-06-14T12:00:00Z')).toBe('1d')
    expect(formatCompactRelativeTime('2024-06-13T12:00:00Z')).toBe('2d')
    expect(formatCompactRelativeTime('2024-06-09T12:00:00Z')).toBe('6d')
  })

  it('formats weeks (1-4)', () => {
    expect(formatCompactRelativeTime('2024-06-08T12:00:00Z')).toBe('1w')
    expect(formatCompactRelativeTime('2024-06-01T12:00:00Z')).toBe('2w')
    expect(formatCompactRelativeTime('2024-05-17T12:00:00Z')).toBe('4w')
  })

  it('formats months (1-11)', () => {
    expect(formatCompactRelativeTime('2024-05-15T12:00:00Z')).toBe('1mo')
    expect(formatCompactRelativeTime('2024-03-15T12:00:00Z')).toBe('3mo')
    expect(formatCompactRelativeTime('2023-07-15T12:00:00Z')).toBe('11mo')
  })

  it('formats years (1+)', () => {
    expect(formatCompactRelativeTime('2023-06-15T12:00:00Z')).toBe('1y')
    expect(formatCompactRelativeTime('2022-06-15T12:00:00Z')).toBe('2y')
    expect(formatCompactRelativeTime('2019-06-15T12:00:00Z')).toBe('5y')
  })

  it('does not include "ago" suffix', () => {
    const result = formatCompactRelativeTime('2024-06-10T12:00:00Z')
    expect(result).toBe('5d')
    expect(result).not.toContain('ago')
  })

  it('boundary: exactly 1 minute shows "1m" not "now"', () => {
    expect(formatCompactRelativeTime('2024-06-15T11:59:00Z')).toBe('1m')
  })

  it('boundary: exactly 60 minutes shows "1h" not "60m"', () => {
    expect(formatCompactRelativeTime('2024-06-15T11:00:00Z')).toBe('1h')
  })
})

describe('truncate', () => {
  it('returns original text if under max length', () => {
    expect(truncate('Hello', 10)).toBe('Hello')
    expect(truncate('Hello', 5)).toBe('Hello')
  })

  it('truncates text at max length with ellipsis', () => {
    expect(truncate('Hello World', 8)).toBe('Hello W\u2026')
    expect(truncate('Hello World', 6)).toBe('Hello\u2026')
  })

  it('uses Unicode ellipsis character', () => {
    const result = truncate('Long text here', 10)
    expect(result).toContain('\u2026') // Unicode ellipsis
    expect(result).not.toContain('...') // Not ASCII ellipsis
  })

  it('trims whitespace before ellipsis', () => {
    expect(truncate('Hello World', 7)).toBe('Hello\u2026')
  })

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('')
  })

  it('handles single character', () => {
    expect(truncate('A', 10)).toBe('A')
    expect(truncate('A', 1)).toBe('A')
  })

  it('handles exact length match', () => {
    expect(truncate('Hello', 5)).toBe('Hello')
    expect(truncate('Hello!', 6)).toBe('Hello!')
  })

  it('handles very short max length', () => {
    expect(truncate('Hello', 2)).toBe('H\u2026')
    expect(truncate('Hello', 1)).toBe('\u2026')
  })

  it('preserves Unicode characters', () => {
    // Note: emoji 🌍 counts as 2 characters in JS string length (surrogate pair)
    // 'Hello 🌍 ' = 9 chars (5 + 1 + 2 + 1), so maxLength=10 gives 'Hello 🌍' + ellipsis
    expect(truncate('Hello 🌍 World', 10)).toBe('Hello 🌍\u2026')
  })
})
