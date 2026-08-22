import { describe, it, expect } from 'vitest'
import { tiktokCreatedAtFromId } from '@/lib/media/tiktok-id'

/**
 * TikTok video ids are Snowflake-style: the high 32 bits are the Unix
 * creation time in seconds, so the real post date is recoverable from the id
 * alone. Owner report: saved TikToks showed "56y" as the post age on the
 * collection theater — the epoch sentinel backfilled for a null `createdAt`.
 */
describe('tiktokCreatedAtFromId', () => {
  it('derives the real post date from a real Snowflake-style id', () => {
    expect(tiktokCreatedAtFromId('7673414867981831440')).toBe('2026-08-13T07:28:42.000Z')
  })

  it('returns null for a non-numeric/garbage id', () => {
    expect(tiktokCreatedAtFromId('not-a-number')).toBe(null)
    expect(tiktokCreatedAtFromId('')).toBe(null)
    expect(tiktokCreatedAtFromId('@someuser')).toBe(null)
  })

  it('returns null for an out-of-range (tiny) id — below the ~2014 sanity floor', () => {
    expect(tiktokCreatedAtFromId('1')).toBe(null)
    expect(tiktokCreatedAtFromId('0')).toBe(null)
  })

  it('returns null for an absurdly large id — above the ~2096 sanity ceiling', () => {
    // 2^96 worth of high bits, far past the year-4000000000-seconds ceiling.
    expect(tiktokCreatedAtFromId('999999999999999999999999999999')).toBe(null)
  })
})
