import { describe, it, expect } from 'vitest'
import {
  appendSeenKey,
  compactSeenOperations,
  isSeenKey,
  parseSeenList,
  removeSeenKeys,
  type SeenOperation,
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

describe('compactSeenOperations', () => {
  it('converges concurrent marks created from the same starting snapshot', () => {
    const base = [operation('base', true, 1, 'seed')]

    // Both writers independently read exactly `base`; neither can see the
    // other's operation before writing its unique operation key.
    const tabAResult = compactSeenOperations([...base, operation('from-a', true, 2, 'tab-a')])
    const tabBResult = compactSeenOperations([...base, operation('from-b', true, 2, 'tab-b')])
    expect(tabAResult.seen).toEqual(['base', 'from-a'])
    expect(tabBResult.seen).toEqual(['base', 'from-b'])

    // Interleave the writes after both reads completed. Unique operation IDs
    // mean the second writer cannot overwrite the first writer's mark.
    const persisted = new Map<string, SeenOperation>()
    for (const entry of tabAResult.operations) persisted.set(entry.id, entry)
    for (const entry of tabBResult.operations) persisted.set(entry.id, entry)
    const converged = compactSeenOperations([...persisted.values()])
    expect(converged.seen).toEqual(['base', 'from-a', 'from-b'])
  })

  it('does not resurrect an explicitly unmarked key from another stale snapshot', () => {
    const initialMark = operation('watched', true, 1, 'seed')
    const remoteUnmark = operation('watched', false, 2, 'tab-a')

    // Tab B still believes `watched` is seen, but marking another key emits
    // only that targeted operation—not its stale full-array snapshot.
    const staleTabDifferentMark = operation('different', true, 3, 'tab-b')
    const resolved = compactSeenOperations([initialMark, remoteUnmark, staleTabDifferentMark])

    expect(resolved.seen).toEqual(['different'])
    expect(resolved.operations.find((entry) => entry.key === 'watched')?.seen).toBe(false)
  })

  it('retains the globally newest 500 marks regardless of stale local ordering', () => {
    const persisted = Array.from({ length: 500 }, (_, index) =>
      operation(`persisted-${index}`, true, 1_000 + index, 'persisted'),
    )
    const staleOldMark = operation('stale-memory-only', true, 10, 'stale-tab')
    const globallyNewest = operation('newest', true, 2_000, 'fresh-tab')
    const resolved = compactSeenOperations([...persisted, staleOldMark, globallyNewest])

    expect(resolved.seen).toHaveLength(500)
    expect(resolved.seen).not.toContain('stale-memory-only')
    expect(resolved.seen).not.toContain('persisted-0')
    expect(resolved.seen).toContain('persisted-499')
    expect(resolved.seen[resolved.seen.length - 1]).toBe('newest')
  })

  it('drops capped marks without manufacturing tombstones', () => {
    const marks = Array.from({ length: 501 }, (_, index) =>
      operation(`key-${index}`, true, index + 1, 'writer'),
    )
    const resolved = compactSeenOperations(marks)

    expect(resolved.seen).not.toContain('key-0')
    expect(resolved.operations.some((entry) => entry.key === 'key-0')).toBe(false)
  })

  it('uses a deterministic writer tie-break for concurrent same-key operations', () => {
    const mark = operation('same', true, 5, 'tab-a')
    const unmark = operation('same', false, 5, 'tab-b')

    expect(compactSeenOperations([unmark, mark]).seen).toEqual([])
    expect(compactSeenOperations([mark, unmark]).seen).toEqual([])
  })

  it('retains the deterministic newest 500 tombstones', () => {
    const marks = Array.from({ length: 700 }, (_, index) =>
      operation(`seen-${index}`, true, index + 1, 'marks'),
    )
    const tombstones = Array.from({ length: 700 }, (_, index) =>
      operation(`gone-${index}`, false, 10_000 + index, 'unmarks'),
    )
    const resolved = compactSeenOperations([...marks, ...tombstones])

    expect(resolved.seen).toHaveLength(500)
    expect(resolved.operations).toHaveLength(1_000)
    expect(resolved.operations.some((entry) => entry.key === 'gone-0')).toBe(false)
    expect(resolved.operations.some((entry) => entry.key === 'gone-699')).toBe(true)
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

function operation(
  key: string,
  seen: boolean,
  clock: number,
  writer: string,
  sequence = 1,
): SeenOperation {
  return {
    version: 2,
    id: `${clock}.${writer}.${sequence}`,
    key,
    seen,
    clock,
    writer,
    sequence,
  }
}

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
