import { afterEach, describe, expect, it, vi } from 'vitest'
import { TtlLruCache } from '@/lib/cache/ttl-lru'

describe('TtlLruCache', () => {
  afterEach(() => vi.useRealTimers())

  it('enforces its hard maximum and evicts the least-recently-used entry', () => {
    const cache = new TtlLruCache<string, number>({ maxSize: 2, ttlMs: 1_000 })

    cache.set('a', 1).set('b', 2)
    expect(cache.get('a')).toBe(1) // refresh a, making b the LRU entry
    cache.set('c', 3)

    expect(cache.size).toBe(2)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe(3)
  })

  it('deletes an expired entry when it is read', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
    const cache = new TtlLruCache<string, number>({ maxSize: 2, ttlMs: 10 })
    cache.set('expired', 1)

    vi.advanceTimersByTime(10)

    expect(cache.get('expired')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('sweeps expired entries before evicting live entries for capacity', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
    const cache = new TtlLruCache<string, number>({ maxSize: 2, ttlMs: 10 })
    cache.set('old', 1)
    vi.advanceTimersByTime(5)
    cache.set('live', 2)
    vi.advanceTimersByTime(5)

    cache.set('new', 3)

    expect(cache.size).toBe(2)
    expect(cache.get('old')).toBeUndefined()
    expect(cache.get('live')).toBe(2)
    expect(cache.get('new')).toBe(3)
  })

  it('supports targeted deletion and clearing', () => {
    const cache = new TtlLruCache<string, number>({ maxSize: 3, ttlMs: 1_000 })
    cache.set('a', 1).set('b', 2)

    expect(cache.delete('a')).toBe(true)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.size).toBe(1)

    cache.clear()
    expect(cache.size).toBe(0)
  })
})
