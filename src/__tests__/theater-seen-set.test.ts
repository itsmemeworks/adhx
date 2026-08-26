import { describe, it, expect } from 'vitest'
import {
  appendSeenKey,
  isSeenKey,
  parseSeenList,
  removeSeenKeys,
} from '@/components/theater/useSeenSet'

/**
 * Pure-function coverage for the theater seen-set model (spec §5):
 * localStorage key `adhx-seen-v1`, most-recent-last, capped at 500.
 */

describe('parseSeenList', () => {
  it('parses a valid JSON array of keys', () => {
    expect(parseSeenList('["twitter:1","tiktok:2"]')).toEqual(['twitter:1', 'tiktok:2'])
  })

  it('treats missing storage as empty', () => {
    expect(parseSeenList(null)).toEqual([])
    expect(parseSeenList(undefined)).toEqual([])
    expect(parseSeenList('')).toEqual([])
  })

  it('never throws on corrupt storage — treats it as empty', () => {
    expect(parseSeenList('not json')).toEqual([])
    expect(parseSeenList('{"not":"an array"}')).toEqual([])
    expect(parseSeenList('[1,2,3]')).toEqual([]) // wrong element type, all filtered out
  })

  it('drops non-string entries but keeps valid ones', () => {
    expect(parseSeenList('["twitter:1", 42, null, "tiktok:2"]')).toEqual(['twitter:1', 'tiktok:2'])
  })
})

describe('isSeenKey', () => {
  it('checks membership', () => {
    expect(isSeenKey(['twitter:1', 'tiktok:2'], 'tiktok:2')).toBe(true)
    expect(isSeenKey(['twitter:1'], 'tiktok:2')).toBe(false)
    expect(isSeenKey([], 'tiktok:2')).toBe(false)
  })
})

describe('removeSeenKeys', () => {
  it('drops the given keys and keeps the rest', () => {
    expect(removeSeenKeys(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
  })

  it('returns the same list when nothing matches', () => {
    const list = ['a', 'b']
    expect(removeSeenKeys(list, ['z'])).toBe(list)
  })
})

describe('appendSeenKey', () => {
  it('appends a new key at the end (most-recent-last)', () => {
    expect(appendSeenKey(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
  })

  it('is idempotent — appending an already-seen key converges to the same list', () => {
    const once = appendSeenKey(['a', 'b'], 'c')
    const twice = appendSeenKey(once, 'c')
    expect(twice).toEqual(once)
  })

  it('moves a re-appended key to the most-recent-last position', () => {
    expect(appendSeenKey(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a'])
  })

  it('caps at the given size, dropping the oldest entries first', () => {
    const list = Array.from({ length: 500 }, (_, i) => `k${i}`)
    const next = appendSeenKey(list, 'k500', 500)
    expect(next.length).toBe(500)
    expect(next[0]).toBe('k1') // k0 dropped
    expect(next[next.length - 1]).toBe('k500')
  })

  it('defaults the cap to 500', () => {
    const list = Array.from({ length: 500 }, (_, i) => `k${i}`)
    const next = appendSeenKey(list, 'k500')
    expect(next.length).toBe(500)
    expect(next).not.toContain('k0')
  })
})
