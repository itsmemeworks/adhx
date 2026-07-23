import { describe, it, expect } from 'vitest'
import {
  isValidTwitterHandle,
  passesThinContentGate,
  isoWeekSlug,
  completedWeekSlugs,
} from '@/lib/sitemap/queries'

describe('isValidTwitterHandle', () => {
  it('accepts word-character handles up to 15 chars', () => {
    expect(isValidTwitterHandle('elonmusk')).toBe(true)
    expect(isValidTwitterHandle('a')).toBe(true)
    expect(isValidTwitterHandle('a_b_c_123')).toBe(true)
    expect(isValidTwitterHandle('x'.repeat(15))).toBe(true)
  })

  it('rejects handles over 15 chars, empty, or with invalid characters', () => {
    expect(isValidTwitterHandle('x'.repeat(16))).toBe(false)
    expect(isValidTwitterHandle('')).toBe(false)
    expect(isValidTwitterHandle(null)).toBe(false)
    expect(isValidTwitterHandle(undefined)).toBe(false)
    expect(isValidTwitterHandle('has-a-dash')).toBe(false)
    expect(isValidTwitterHandle('has a space')).toBe(false)
    expect(isValidTwitterHandle('@leadingAt')).toBe(false)
    expect(isValidTwitterHandle('emoji🙂')).toBe(false)
  })
})

describe('passesThinContentGate', () => {
  const base = { hasMedia: false, isArticle: false, textLength: 0, saved: false }

  it('passes when the post has media', () => {
    expect(passesThinContentGate({ ...base, hasMedia: true })).toBe(true)
  })

  it('passes when the post is an article', () => {
    expect(passesThinContentGate({ ...base, isArticle: true })).toBe(true)
  })

  it('passes when text length is at least 80 chars', () => {
    expect(passesThinContentGate({ ...base, textLength: 80 })).toBe(true)
    expect(passesThinContentGate({ ...base, textLength: 200 })).toBe(true)
  })

  it('fails when text length is just under 80 chars', () => {
    expect(passesThinContentGate({ ...base, textLength: 79 })).toBe(false)
  })

  it('passes when the post was saved by someone, regardless of content', () => {
    expect(passesThinContentGate({ ...base, saved: true })).toBe(true)
  })

  it('fails when none of the criteria hold', () => {
    expect(passesThinContentGate(base)).toBe(false)
    expect(passesThinContentGate({ ...base, textLength: 10 })).toBe(false)
  })
})

describe('isoWeekSlug', () => {
  it('matches well-known ISO week edge cases', () => {
    // 2024-01-01 is a Monday -> ISO week 2024-W01.
    expect(isoWeekSlug(new Date('2024-01-01T00:00:00Z'))).toBe('2024-w01')
    // 2023-01-01 is a Sunday -> belongs to the last ISO week of 2022 (W52).
    expect(isoWeekSlug(new Date('2023-01-01T00:00:00Z'))).toBe('2022-w52')
    // 2021-01-01 is a Friday -> belongs to the 53rd ISO week of 2020.
    expect(isoWeekSlug(new Date('2021-01-01T00:00:00Z'))).toBe('2020-w53')
  })

  it('always assigns January 4th to week 1 (the ISO 8601 definition)', () => {
    expect(isoWeekSlug(new Date('2026-01-04T00:00:00Z'))).toBe('2026-w01')
    expect(isoWeekSlug(new Date('2020-01-04T00:00:00Z'))).toBe('2020-w01')
  })
})

describe('completedWeekSlugs', () => {
  it('returns distinct completed weeks, newest first, excluding the current week', () => {
    // "now" is Thursday 2026-07-23, in ISO week 2026-w30.
    const now = new Date('2026-07-23T12:00:00Z')
    const timestamps = [
      '2026-07-20T10:00:00Z', // 2026-w30 (current week, excluded)
      '2026-07-13T10:00:00Z', // 2026-w29
      '2026-07-14T09:00:00Z', // 2026-w29 (dup week)
      '2026-06-01T09:00:00Z', // 2026-w23
    ]
    expect(completedWeekSlugs(timestamps, now)).toEqual(['2026-w29', '2026-w23'])
  })

  it('excludes the current in-progress week even as its only entry', () => {
    const now = new Date('2026-07-23T12:00:00Z')
    expect(completedWeekSlugs(['2026-07-21T00:00:00Z'], now)).toEqual([])
  })

  it('ignores unparseable timestamps', () => {
    const now = new Date('2026-07-23T12:00:00Z')
    expect(completedWeekSlugs(['not-a-date', '2026-06-01T00:00:00Z'], now)).toEqual(['2026-w23'])
  })

  it('orders weeks that straddle the Dec/Jan ISO week-numbering-year boundary', () => {
    // Dec 29 2025 (Mon) starts the ISO week containing Jan 1 2026 (Thu), so
    // per the ISO 8601 rule it's numbered 2026-w01, not 2025-wXX.
    expect(isoWeekSlug(new Date('2025-12-29T00:00:00Z'))).toBe('2026-w01')
    expect(isoWeekSlug(new Date('2026-01-05T00:00:00Z'))).toBe('2026-w02')

    const now = new Date('2026-01-15T00:00:00Z') // 2026-w03
    const timestamps = ['2025-12-29T00:00:00Z', '2026-01-05T00:00:00Z']
    expect(completedWeekSlugs(timestamps, now)).toEqual(['2026-w02', '2026-w01'])
  })
})
