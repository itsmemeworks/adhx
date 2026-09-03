/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SEEN_BATCH_PREFIX,
  SEEN_OPERATION_PREFIX,
  SEEN_STORAGE_KEY,
  useSeenSet,
} from '@/components/theater/useSeenSet'

function storedSeen(): string[] {
  return JSON.parse(window.localStorage.getItem(SEEN_STORAGE_KEY) ?? '[]') as string[]
}

function operationKeys(): string[] {
  return Array.from({ length: window.localStorage.length }, (_, index) =>
    window.localStorage.key(index),
  ).filter((key): key is string => key?.startsWith(SEEN_OPERATION_PREFIX) ?? false)
}

function batchKeys(): string[] {
  return Array.from({ length: window.localStorage.length }, (_, index) =>
    window.localStorage.key(index),
  ).filter((key): key is string => key?.startsWith(SEEN_BATCH_PREFIX) ?? false)
}

function authorityKeys(): string[] {
  return [...operationKeys(), ...batchKeys()]
}

function physicalOperationCount(): number {
  return authorityKeys().reduce((count, key) => {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? 'null') as {
      operations?: unknown[]
    } | null
    return count + (Array.isArray(parsed?.operations) ? parsed.operations.length : 1)
  }, 0)
}

function dispatchOperationStorage(storageKey: string) {
  act(() => {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: storageKey,
        newValue: window.localStorage.getItem(storageKey),
        storageArea: window.localStorage,
      }),
    )
  })
}

function dispatchLegacyStorage() {
  act(() => {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: SEEN_STORAGE_KEY,
        newValue: window.localStorage.getItem(SEEN_STORAGE_KEY),
        storageArea: window.localStorage,
      }),
    )
  })
}

async function flushStorageEvents() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe('useSeenSet cross-tab convergence', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('migrates the legacy array once and keeps seenOnEntry frozen', () => {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(['legacy-a', 'legacy-b']))
    const tab = renderHook(() => useSeenSet())

    expect(tab.result.current.ready).toBe(true)
    expect(tab.result.current.seenOnEntry).toEqual(['legacy-a', 'legacy-b'])
    expect(operationKeys()).toHaveLength(0)
    expect(batchKeys()).toHaveLength(1)

    act(() => tab.result.current.markSeen('new'))

    expect(storedSeen()).toEqual(['legacy-a', 'legacy-b', 'new'])
    expect(tab.result.current.seenOnEntry).toEqual(['legacy-a', 'legacy-b'])
  })

  it('hydrates legacy without overwriting it when V2 migration fails', () => {
    const legacy = ['legacy-a', 'legacy-b']
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(legacy))
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith(SEEN_BATCH_PREFIX)) {
        throw new DOMException('quota', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    })

    const tab = renderHook(() => useSeenSet())

    expect(tab.result.current.ready).toBe(true)
    expect(tab.result.current.seenOnEntry).toEqual(legacy)
    expect(tab.result.current.isSeen('legacy-a')).toBe(true)
    expect(window.localStorage.getItem(SEEN_STORAGE_KEY)).toBe(JSON.stringify(legacy))
    expect(authorityKeys()).toHaveLength(0)
  })

  it('persists both tab marks and converges through operation events', async () => {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(['base']))
    const tabA = renderHook(() => useSeenSet())
    const tabB = renderHook(() => useSeenSet())

    act(() => tabA.result.current.markSeen('from-a'))
    expect(storedSeen()).toEqual(['base', 'from-a'])
    expect(tabB.result.current.isSeen('from-a')).toBe(false)

    act(() => tabB.result.current.markSeen('from-b'))
    expect(storedSeen()).toEqual(['base', 'from-a', 'from-b'])

    const newestOperationKey = operationKeys().at(-1)
    expect(newestOperationKey).toBeDefined()
    dispatchOperationStorage(newestOperationKey!)
    await flushStorageEvents()

    expect(tabA.result.current.isSeen('from-a')).toBe(true)
    expect(tabA.result.current.isSeen('from-b')).toBe(true)
    expect(tabB.result.current.isSeen('from-a')).toBe(true)
    expect(tabB.result.current.isSeen('from-b')).toBe(true)
    expect(tabA.result.current.seenOnEntry).toEqual(['base'])
    expect(tabB.result.current.seenOnEntry).toEqual(['base'])
  })

  it('does not let a stale tab resurrect a remote explicit unmark', async () => {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(['watched']))
    const tabA = renderHook(() => useSeenSet())
    const tabB = renderHook(() => useSeenSet())

    act(() => tabA.result.current.unmarkSeen(['watched']))
    expect(tabA.result.current.isSeen('watched')).toBe(false)
    expect(tabB.result.current.isSeen('watched')).toBe(true)

    // Tab B has not received a storage event and still has stale React state.
    act(() => tabB.result.current.markSeen('different'))
    expect(tabB.result.current.isSeen('watched')).toBe(false)
    expect(tabB.result.current.isSeen('different')).toBe(true)
    expect(storedSeen()).toEqual(['different'])

    const newestOperationKey = operationKeys().at(-1)
    expect(newestOperationKey).toBeDefined()
    dispatchOperationStorage(newestOperationKey!)
    await flushStorageEvents()
    expect(tabA.result.current.isSeen('watched')).toBe(false)
    expect(tabA.result.current.isSeen('different')).toBe(true)
  })

  it('allows a removed key to be marked again later', () => {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(['a']))
    const tab = renderHook(() => useSeenSet())

    act(() => tab.result.current.unmarkSeen(['a']))
    expect(tab.result.current.isSeen('a')).toBe(false)

    act(() => tab.result.current.markSeen('a'))
    expect(tab.result.current.isSeen('a')).toBe(true)
    expect(storedSeen()).toEqual(['a'])
  })

  it('ignores stale legacy additions after V2 migration', async () => {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(['base']))
    const tab = renderHook(() => useSeenSet())
    act(() => tab.result.current.markSeen('v2-new'))

    // A pre-V2 tab cannot safely prove provenance after migration. Its stale
    // addition triggers only an authority refresh.
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(['base', 'old-tab-mark']))
    dispatchLegacyStorage()
    await flushStorageEvents()

    expect(storedSeen()).toEqual(['base', 'v2-new'])
    expect(tab.result.current.isSeen('v2-new')).toBe(true)
    expect(tab.result.current.isSeen('old-tab-mark')).toBe(false)
  })

  it('ignores legacy omissions after a newer V2 projection', async () => {
    // A publishes ['a']; B advances V2 authority to ['a', 'b']; then stale A
    // writes ['a'] again. The omission cannot prove a real removal.
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(['a']))
    const tab = renderHook(() => useSeenSet())
    const staleAProjection = JSON.stringify(['a'])
    act(() => tab.result.current.markSeen('b'))
    expect(storedSeen()).toEqual(['a', 'b'])

    window.localStorage.setItem(SEEN_STORAGE_KEY, staleAProjection)
    dispatchLegacyStorage()
    await flushStorageEvents()

    expect(storedSeen()).toEqual(['a', 'b'])
    expect(tab.result.current.isSeen('a')).toBe(true)
    expect(tab.result.current.isSeen('b')).toBe(true)
  })

  it('drops failed tab-only writes when durable authority recovers', async () => {
    const tab = renderHook(() => useSeenSet())
    const originalSetItem = Storage.prototype.setItem
    let failOldMark = true
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (
        failOldMark &&
        key.startsWith(SEEN_OPERATION_PREFIX) &&
        value.includes('"key":"old-local"')
      ) {
        failOldMark = false
        throw new DOMException('quota', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    })

    act(() => tab.result.current.markSeen('old-local'))
    expect(tab.result.current.isSeen('old-local')).toBe(true)
    vi.restoreAllMocks()

    const other = renderHook(() => useSeenSet())
    const removals = ['old-local', ...Array.from({ length: 500 }, (_, index) => `gone-${index}`)]
    act(() => other.result.current.unmarkSeen(removals))
    expect(operationKeys()).toHaveLength(0)
    expect(batchKeys()).toHaveLength(1)

    dispatchOperationStorage(`${SEEN_BATCH_PREFIX}already-pruned`)
    await flushStorageEvents()
    expect(tab.result.current.isSeen('old-local')).toBe(false)

    act(() => tab.result.current.markSeen('different'))
    tab.unmount()
    const restarted = renderHook(() => useSeenSet())
    expect(restarted.result.current.isSeen('old-local')).toBe(false)
    expect(restarted.result.current.isSeen('different')).toBe(true)
  })

  it('retains an unmark against an arbitrarily delayed older write', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T20:00:00Z'))
    const tab = renderHook(() => useSeenSet())
    const delayedClock = Date.now() - 1_000
    const delayedOperation = {
      version: 2,
      id: `${delayedClock}.delayed-writer.1`,
      key: 'same-key',
      seen: true,
      clock: delayedClock,
      writer: 'delayed-writer',
      sequence: 1,
    }

    // The other renderer computed this older mark but has not persisted it.
    act(() => tab.result.current.unmarkSeen(['same-key']))
    expect(tab.result.current.isSeen('same-key')).toBe(false)
    expect(batchKeys()).toHaveLength(1)

    vi.setSystemTime(new Date('2036-08-26T20:00:00Z'))
    const delayedStorageKey = `${SEEN_OPERATION_PREFIX}${delayedOperation.id}`
    window.localStorage.setItem(delayedStorageKey, JSON.stringify(delayedOperation))
    dispatchOperationStorage(delayedStorageKey)
    act(() => vi.runOnlyPendingTimers())

    expect(tab.result.current.isSeen('same-key')).toBe(false)
    expect(window.localStorage.getItem(delayedStorageKey)).toBeNull()
    expect(batchKeys()).toHaveLength(1)
  })

  it('does not schedule tombstone pruning timers', () => {
    const tab = renderHook(() => useSeenSet())
    const timerSpy = vi.spyOn(globalThis, 'setTimeout')

    act(() => tab.result.current.unmarkSeen(['retained-key']))
    expect(batchKeys()).toHaveLength(1)
    expect(tab.result.current.isSeen('retained-key')).toBe(false)
    expect(timerSpy.mock.calls.some(([, delay]) => typeof delay === 'number' && delay > 0)).toBe(
      false,
    )
  })

  it('keeps bulk unmark durable when atomic compaction hits quota', () => {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(['a', 'b', 'c', 'keep']))
    const tab = renderHook(() => useSeenSet())
    const originalSetItem = Storage.prototype.setItem
    let batchWrites = 0
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith(SEEN_BATCH_PREFIX) && ++batchWrites === 2) {
        throw new DOMException('quota', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    })

    act(() => tab.result.current.unmarkSeen(['a', 'b', 'c']))
    expect(tab.result.current.isSeen('a')).toBe(false)
    expect(
      Array.from({ length: window.localStorage.length }, (_, index) =>
        window.localStorage.key(index),
      ).some((key) => key?.startsWith(SEEN_BATCH_PREFIX)),
    ).toBe(true)

    tab.unmount()
    vi.restoreAllMocks()
    const restarted = renderHook(() => useSeenSet())
    expect(restarted.result.current.isSeen('a')).toBe(false)
    expect(restarted.result.current.isSeen('b')).toBe(false)
    expect(restarted.result.current.isSeen('c')).toBe(false)
    expect(restarted.result.current.isSeen('keep')).toBe(true)
  })

  it('keeps physical operation storage bounded across repeated marks', () => {
    const tab = renderHook(() => useSeenSet())
    const originalSetItem = Storage.prototype.setItem
    const originalRemoveItem = Storage.prototype.removeItem
    const trackedAuthorityKeys = new Set(authorityKeys())
    let quotaFailures = 0
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      const isAuthorityRecord =
        key.startsWith(SEEN_OPERATION_PREFIX) || key.startsWith(SEEN_BATCH_PREFIX)
      const isNewAuthorityRecord = isAuthorityRecord && !trackedAuthorityKeys.has(key)
      if (isNewAuthorityRecord && trackedAuthorityKeys.size >= 501) {
        quotaFailures += 1
        throw new DOMException('near quota', 'QuotaExceededError')
      }
      const result = originalSetItem.call(this, key, value)
      if (isAuthorityRecord) trackedAuthorityKeys.add(key)
      return result
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
      const result = originalRemoveItem.call(this, key)
      trackedAuthorityKeys.delete(key)
      return result
    })

    for (let index = 0; index < 650; index += 1) {
      act(() => tab.result.current.markSeen(`mark-${index}`))
      expect(trackedAuthorityKeys.size).toBeLessThanOrEqual(500)
    }

    expect(storedSeen()).toHaveLength(500)
    expect(tab.result.current.isSeen('mark-0')).toBe(false)
    expect(tab.result.current.isSeen('mark-649')).toBe(true)
    act(() =>
      tab.result.current.unmarkSeen(
        Array.from({ length: 700 }, (_, index) => `tombstone-${index}`),
      ),
    )
    expect(trackedAuthorityKeys.size).toBeLessThanOrEqual(501)
    expect(trackedAuthorityKeys).toEqual(new Set(authorityKeys()))
    expect(physicalOperationCount()).toBeLessThanOrEqual(1_000)
    expect(quotaFailures).toBe(0)
  }, 30_000)

  it('coalesces an operation-event burst into one storage scan', () => {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(['stable']))
    renderHook(() => useSeenSet())
    vi.useFakeTimers()
    const keySpy = vi.spyOn(Storage.prototype, 'key')

    act(() => {
      for (let index = 0; index < 25; index += 1) {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key:
              index % 2 === 0
                ? `${SEEN_OPERATION_PREFIX}burst-${index}`
                : `${SEEN_BATCH_PREFIX}burst-${index}`,
            storageArea: window.localStorage,
          }),
        )
      }
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SEEN_STORAGE_KEY,
          newValue: window.localStorage.getItem(SEEN_STORAGE_KEY),
          storageArea: window.localStorage,
        }),
      )
    })
    expect(keySpy).not.toHaveBeenCalled()

    act(() => vi.runOnlyPendingTimers())
    // One coalesced refresh performs at most the authority/prune verification
    // scans, not one scan per event.
    expect(keySpy.mock.calls.length).toBeLessThanOrEqual(3 * (window.localStorage.length + 1))
  })

  it('ignores malformed operation records and inaccessible storageArea', async () => {
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(['stable']))
    const tab = renderHook(() => useSeenSet())

    const malformedKey = `${SEEN_OPERATION_PREFIX}malformed`
    window.localStorage.setItem(malformedKey, 'not-json')
    dispatchOperationStorage(malformedKey)
    await flushStorageEvents()
    expect(tab.result.current.isSeen('stable')).toBe(true)

    const event = new Event('storage') as StorageEvent
    Object.defineProperties(event, {
      key: { value: malformedKey },
      storageArea: {
        get() {
          throw new Error('storage disabled')
        },
      },
    })
    expect(() => window.dispatchEvent(event)).not.toThrow()
    expect(tab.result.current.isSeen('stable')).toBe(true)
  })

  it('quarantines malformed-only authority without cross-tab rewrite loops', async () => {
    const tabA = renderHook(() => useSeenSet())
    const tabB = renderHook(() => useSeenSet())
    const malformedKey = `${SEEN_BATCH_PREFIX}malformed-only`
    window.localStorage.setItem(malformedKey, '{"version":2,"type":"batch"}')

    dispatchOperationStorage(malformedKey)
    await flushStorageEvents()

    expect(window.localStorage.getItem(malformedKey)).toBeNull()
    expect(authorityKeys()).toHaveLength(0)
    expect(tabA.result.current.isSeen('anything')).toBe(false)
    expect(tabB.result.current.isSeen('anything')).toBe(false)

    dispatchOperationStorage(malformedKey)
    await flushStorageEvents()
    expect(authorityKeys()).toHaveLength(0)
  })
})
