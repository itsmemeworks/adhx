'use client'

/**
 * Cross-tab localStorage seen model (spec §5). V2 stores immutable, uniquely
 * keyed per-item operations and resolves them as deterministic LWW registers.
 * `adhx-seen-v1` remains a JSON-array projection for backward compatibility;
 * operation records are authoritative. The array is imported exactly once;
 * tabs still running pre-V2 code must reload before later changes propagate.
 * Visible marks are most-recent-last and capped at 500. `adhx-last-visit`
 * remains a ms-epoch timestamp written only on `pagehide`/tab-hide and read
 * once on mount.
 *
 * Resolution/compaction is exported as pure logic for adversarial interleaving
 * tests. Every `window`/`localStorage` touch is guarded (SSR-safe,
 * private-mode-safe); corrupt or inaccessible storage never throws.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export const SEEN_STORAGE_KEY = 'adhx-seen-v1'
export const LAST_VISIT_STORAGE_KEY = 'adhx-last-visit'
export const SEEN_OPERATION_PREFIX = 'adhx-seen-op-v2:'
export const SEEN_BATCH_PREFIX = 'adhx-seen-batch-v2:'
const SEEN_V2_MARKER_KEY = 'adhx-seen-v2-ready'
const SEEN_CAP = 500
const TOMBSTONE_CAP = 500

export interface SeenSet {
  /** False until the localStorage state has been read (post-hydration). */
  ready: boolean
  isSeen(key: string): boolean
  /** Idempotent; persists to localStorage. */
  markSeen(key: string): void
  /** Re-watch all: drop these keys so the playlist plays as unseen again. */
  unmarkSeen(keys: readonly string[]): void
  /** Previous visit timestamp (ms epoch), null on first ever visit. */
  lastVisitAt: number | null
  /**
   * The seen list as it was the moment this session read storage — what the
   * viewer had ALREADY watched when they arrived. Unlike `isSeen`, it does not
   * grow as they watch. Queue ORDERING uses this plus live `isSeen`: the
   * playing row stays in New / Up next so dwell does not yank it, then it
   * slides into Watched once it is no longer current. Use `isSeen` for "is
   * it seen NOW" (the ✓ and that slide), this for "was it already seen when
   * the session started".
   */
  seenOnEntry: readonly string[]
}

/** Parse the persisted seen-list. Missing/corrupt/wrong-shaped storage → `[]`, never throws. */
export function parseSeenList(raw: string | null | undefined): string[] {
  return tryParseSeenList(raw) ?? []
}

function tryParseSeenList(raw: string | null | undefined): string[] | null {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((k): k is string => typeof k === 'string')
  } catch {
    return null
  }
}

/** Membership check. Pure. */
export function isSeenKey(list: readonly string[], key: string): boolean {
  return list.includes(key)
}

/**
 * Append `key` to the list (moving it to the most-recent-last position if it
 * was already present), capped at `cap` by dropping the oldest entries. Pure —
 * calling it repeatedly with the same key converges to the same final state,
 * which is what makes `markSeen` idempotent.
 */
/** Drop `keys` from the seen list. Pure. */
export function removeSeenKeys(list: readonly string[], keys: readonly string[]): string[] {
  if (keys.length === 0) return list as string[]
  const drop = new Set(keys)
  const next = list.filter((k) => !drop.has(k))
  return next.length === list.length ? (list as string[]) : next
}

export function appendSeenKey(list: readonly string[], key: string, cap = SEEN_CAP): string[] {
  const withoutKey = list.filter((k) => k !== key)
  const next = [...withoutKey, key]
  return next.length > cap ? next.slice(next.length - cap) : next
}

export interface SeenOperation {
  version: 2
  id: string
  key: string
  seen: boolean
  clock: number
  writer: string
  sequence: number
}

interface SeenOperationBatch {
  version: 2
  type: 'batch'
  id: string
  operations: SeenOperation[]
}

export interface CompactedSeenOperations {
  /** One latest operation per retained key, bounded by seen + tombstone caps. */
  operations: SeenOperation[]
  /** Visible seen keys, oldest operation first. */
  seen: string[]
}

/**
 * Resolve an unordered operation set as per-key last-writer-wins registers.
 *
 * Revisions are totally ordered by `(clock, writer, sequence, id)`. The writer
 * tie-break makes genuinely concurrent operations deterministic. Resolution
 * returns only the newest 500 winning marks; physical pruning removes older
 * winners in place. The newest 500 winning tombstones form a bounded safety
 * horizon against arbitrarily delayed older writes; no wall-clock assumptions
 * or stale full-set retries are involved.
 */
export function compactSeenOperations(
  operations: readonly SeenOperation[],
  seenCap = SEEN_CAP,
  tombstoneCap = TOMBSTONE_CAP,
): CompactedSeenOperations {
  const latestByKey = new Map<string, SeenOperation>()

  for (const operation of operations) {
    const previous = latestByKey.get(operation.key)
    if (!previous || compareSeenOperations(previous, operation) < 0) {
      latestByKey.set(operation.key, operation)
    }
  }

  const seenOperations = [...latestByKey.values()]
    .filter((operation) => operation.seen)
    .sort(compareSeenOperations)
  const keepSeenFrom = Math.max(0, seenOperations.length - Math.max(0, seenCap))
  const keptSeen = seenOperations.slice(keepSeenFrom)
  const tombstones = [...latestByKey.values()]
    .filter((operation) => !operation.seen)
    .sort((left, right) => compareSeenOperations(right, left))
    .slice(0, Math.max(0, tombstoneCap))
    .sort(compareSeenOperations)

  return {
    operations: [...keptSeen, ...tombstones].sort(compareSeenOperations),
    seen: keptSeen.map((operation) => operation.key),
  }
}

export function compareSeenOperations(left: SeenOperation, right: SeenOperation): number {
  if (left.clock !== right.clock) return left.clock - right.clock
  if (left.writer !== right.writer) return left.writer < right.writer ? -1 : 1
  if (left.sequence !== right.sequence) return left.sequence - right.sequence
  if (left.id === right.id) return 0
  return left.id < right.id ? -1 : 1
}

/** Parse a stored `adhx-last-visit` value. Corrupt/missing → null. */
function parseLastVisit(raw: string | null | undefined): number | null {
  if (!raw) return null
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function useSeenSet(): SeenSet {
  const [ready, setReady] = useState(false)
  const [seen, setSeen] = useState<string[]>([])
  const [lastVisitAt, setLastVisitAt] = useState<number | null>(null)
  const writerRef = useRef<string | null>(null)
  const lastClockRef = useRef(0)
  const sequenceRef = useRef(0)
  const authorityRef = useRef<SeenOperation[]>([])
  const localOnlyRef = useRef<SeenOperation[]>([])
  const migrationDurableRef = useRef(false)
  const legacyFallbackRef = useRef<string[]>([])
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  if (writerRef.current === null) writerRef.current = createWriterId()

  // Guards against writing adhx-last-visit more than once per hide/unload.
  const visitRecordedRef = useRef(false)
  // Frozen copy of what storage held on arrival — see `seenOnEntry`.
  const [seenOnEntry, setSeenOnEntry] = useState<readonly string[]>([])

  const publish = useCallback((resolved: CompactedSeenOperations, persist = true) => {
    if (persist) persistProjection(resolved.seen)
    setSeen((previous) => (listsEqual(previous, resolved.seen) ? previous : resolved.seen))
  }, [])

  const refreshFromStorage = useCallback(() => {
    if (!migrationDurableRef.current) {
      const migration = ensureMigrated(
        writerRef.current ?? createWriterId(),
        lastClockRef,
        sequenceRef,
      )
      migrationDurableRef.current = migration.durable
      if (!migration.durable) {
        legacyFallbackRef.current = migration.legacy.slice(-SEEN_CAP)
        const fallback = { operations: [], seen: legacyFallbackRef.current }
        setSeen((previous) => (listsEqual(previous, fallback.seen) ? previous : fallback.seen))
        return fallback
      }
    }

    const scan = readStoredOperations()
    if (!scan.available) {
      return compactSeenOperations([...authorityRef.current, ...localOnlyRef.current])
    }

    // A recovered tab always accepts durable authority before doing anything
    // else. Failed current-tab-only writes are never retried.
    localOnlyRef.current = []
    const resolved = compactSeenOperations(pruneStoredOperations(scan).operations)
    authorityRef.current = resolved.operations
    publish(resolved)
    return resolved
  }, [publish])

  const applyOperations = useCallback(
    (keys: readonly string[], nextSeen: boolean) => {
      if (keys.length === 0) return

      if (!migrationDurableRef.current) {
        const migration = ensureMigrated(
          writerRef.current ?? createWriterId(),
          lastClockRef,
          sequenceRef,
        )
        migrationDurableRef.current = migration.durable
        if (!migration.durable) {
          let fallback = legacyFallbackRef.current
          if (nextSeen) {
            for (const key of keys) {
              if (!fallback.includes(key)) fallback = appendSeenKey(fallback, key)
            }
          } else {
            fallback = removeSeenKeys(fallback, keys)
          }
          legacyFallbackRef.current = fallback
          setSeen(fallback)
          return
        }
      }

      const scan = readStoredOperations()
      if (scan.available) {
        localOnlyRef.current = []
        authorityRef.current = compactSeenOperations(
          pruneStoredOperations(scan).operations,
        ).operations
      }
      const current = compactSeenOperations([...authorityRef.current, ...localOnlyRef.current])
      const latestByKey = new Map(current.operations.map((operation) => [operation.key, operation]))
      const targets = nextSeen
        ? keys.filter((key) => !latestByKey.get(key)?.seen)
        : [...new Set(keys)]

      if (targets.length === 0) {
        publish(current)
        return
      }

      const maxStoredClock = current.operations.reduce(
        (maximum, operation) => Math.max(maximum, operation.clock),
        0,
      )
      const clock = Math.max(Date.now(), maxStoredClock + 1, lastClockRef.current + 1)
      lastClockRef.current = clock
      const writer = writerRef.current ?? createWriterId()
      writerRef.current = writer
      const created = targets.map((key) => {
        const sequence = ++sequenceRef.current
        return createSeenOperation(key, nextSeen, clock, writer, sequence)
      })
      const resolved = compactSeenOperations([...current.operations, ...created])

      if (!scan.available || !persistUserOperations(created, !nextSeen)) {
        // Preserve the immediate synchronous API in this tab only. A future
        // successful scan discards these operations instead of retrying them.
        localOnlyRef.current = compactSeenOperations([
          ...localOnlyRef.current,
          ...created,
        ]).operations
        publish(resolved, false)
        return
      }

      const durableScan = readStoredOperations()
      if (!durableScan.available) {
        localOnlyRef.current = created
        publish(resolved, false)
        return
      }
      const durable = compactSeenOperations(pruneStoredOperations(durableScan).operations)
      authorityRef.current = durable.operations
      localOnlyRef.current = []
      publish(durable)
    },
    [publish],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const initial = refreshFromStorage()

    try {
      setLastVisitAt(parseLastVisit(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY)))
      setSeenOnEntry(initial.seen)
    } catch {
      // localStorage inaccessible (private mode, disabled storage, etc.) —
      // degrade to "nothing seen yet" rather than crash.
    }
    setReady(true)

    const recordVisit = () => {
      if (visitRecordedRef.current) return
      visitRecordedRef.current = true
      try {
        window.localStorage.setItem(LAST_VISIT_STORAGE_KEY, String(Date.now()))
      } catch {
        // ignore — a failed write just means next visit's divider is off
      }
    }
    const onVisibilityChange = () => {
      if (document.hidden) recordVisit()
    }
    const flushStorageEvents = () => {
      refreshTimerRef.current = null
      // Post-migration arrays are projections only. Tabs running pre-V2 code
      // must reload before later seen-state changes can propagate.
      refreshFromStorage()
    }
    const onStorage = (event: StorageEvent) => {
      try {
        if (event.storageArea && event.storageArea !== window.localStorage) return
        if (
          event.key !== null &&
          event.key !== SEEN_STORAGE_KEY &&
          event.key !== SEEN_V2_MARKER_KEY &&
          !event.key.startsWith(SEEN_OPERATION_PREFIX) &&
          !event.key.startsWith(SEEN_BATCH_PREFIX)
        ) {
          return
        }
        if (refreshTimerRef.current === null) {
          refreshTimerRef.current = setTimeout(flushStorageEvents, 0)
        }
      } catch {
        // Ignore inaccessible or malformed cross-document storage updates.
      }
    }

    window.addEventListener('pagehide', recordVisit)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', recordVisit)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current)
    }
  }, [refreshFromStorage])

  const isSeen = useCallback((key: string) => isSeenKey(seen, key), [seen])

  const markSeen = useCallback(
    (key: string) => {
      applyOperations([key], true)
    },
    [applyOperations],
  )

  const unmarkSeen = useCallback(
    (keys: readonly string[]) => {
      applyOperations(keys, false)
    },
    [applyOperations],
  )

  return { ready, isSeen, markSeen, unmarkSeen, lastVisitAt, seenOnEntry }
}

interface StoredRecord {
  storageKey: string
  kind: 'operation' | 'batch'
  operations: SeenOperation[]
  batch?: SeenOperationBatch
}

interface StoredOperationScan {
  available: boolean
  records: StoredRecord[]
  operations: SeenOperation[]
  scannedKeys: string[]
}

function readStoredOperations(): StoredOperationScan {
  if (typeof window === 'undefined') {
    return { available: false, records: [], operations: [], scannedKeys: [] }
  }
  try {
    const records: StoredRecord[] = []
    const operations: SeenOperation[] = []
    const scannedKeys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index)
      if (
        !storageKey?.startsWith(SEEN_OPERATION_PREFIX) &&
        !storageKey?.startsWith(SEEN_BATCH_PREFIX)
      ) {
        continue
      }
      scannedKeys.push(storageKey)
      const raw = window.localStorage.getItem(storageKey)
      if (storageKey.startsWith(SEEN_BATCH_PREFIX)) {
        const batch = parseSeenBatch(raw)
        if (batch) {
          records.push({ storageKey, kind: 'batch', operations: batch.operations, batch })
          operations.push(...batch.operations)
        }
      } else {
        const operation = parseSeenOperation(raw)
        if (operation) {
          records.push({ storageKey, kind: 'operation', operations: [operation] })
          operations.push(operation)
        }
      }
    }
    return { available: true, records, operations, scannedKeys }
  } catch {
    return { available: false, records: [], operations: [], scannedKeys: [] }
  }
}

function pruneStoredOperations(scan: StoredOperationScan): StoredOperationScan {
  if (typeof window === 'undefined' || !scan.available) return scan

  const retained = compactSeenOperations(scan.operations)
  rewriteRecords(scan, new Set(retained.operations.map((operation) => operation.id)))
  return readStoredOperations()
}

function rewriteRecords(scan: StoredOperationScan, keepIds: ReadonlySet<string>): boolean {
  if (typeof window === 'undefined') return false
  try {
    const validKeys = new Set(scan.records.map((record) => record.storageKey))
    for (const storageKey of scan.scannedKeys) {
      if (!validKeys.has(storageKey)) window.localStorage.removeItem(storageKey)
    }
    for (const record of scan.records) {
      const kept = record.operations.filter((operation) => keepIds.has(operation.id))
      if (kept.length === record.operations.length) continue
      if (kept.length === 0) {
        window.localStorage.removeItem(record.storageKey)
      } else if (record.kind === 'batch' && record.batch) {
        window.localStorage.setItem(
          record.storageKey,
          JSON.stringify({ ...record.batch, operations: kept }),
        )
      }
    }
    return true
  } catch {
    return false
  }
}

function persistUserOperations(operations: readonly SeenOperation[], forceBatch: boolean): boolean {
  if (typeof window === 'undefined' || operations.length === 0) return false
  try {
    if (forceBatch || operations.length > 1) {
      const batch = createSeenBatch(operations)
      window.localStorage.setItem(batchStorageKey(batch), JSON.stringify(batch))
    } else {
      const operation = operations[0]
      window.localStorage.setItem(operationStorageKey(operation), JSON.stringify(operation))
    }
    return true
  } catch {
    return false
  }
}

function persistProjection(seenKeys: readonly string[]) {
  if (typeof window === 'undefined') return
  try {
    // Compatibility/readability cache only. V2 operation records are the
    // authority, so concurrent full-array writes cannot lose an operation.
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seenKeys))
  } catch {
    // Ignore inaccessible storage.
  }
}

function ensureMigrated(
  writer: string,
  lastClockRef: { current: number },
  sequenceRef: { current: number },
): { durable: boolean; legacy: string[] } {
  if (typeof window === 'undefined') return { durable: false, legacy: [] }
  try {
    if (window.localStorage.getItem(SEEN_V2_MARKER_KEY)) {
      return { durable: true, legacy: [] }
    }

    const legacy = [...new Set(parseSeenList(window.localStorage.getItem(SEEN_STORAGE_KEY)))]
    const clock = Math.max(Date.now(), lastClockRef.current + 1)
    lastClockRef.current = clock
    const operations: SeenOperation[] = []
    for (const key of legacy) {
      const sequence = ++sequenceRef.current
      operations.push(createSeenOperation(key, true, clock, writer, sequence))
    }
    if (operations.length > 0 && !persistUserOperations(operations, true)) {
      return { durable: false, legacy }
    }
    window.localStorage.setItem(SEEN_V2_MARKER_KEY, '1')
    if (window.localStorage.getItem(SEEN_V2_MARKER_KEY) !== '1') {
      return { durable: false, legacy }
    }
    return { durable: true, legacy }
  } catch {
    // Legacy storage remains readable on the next mount if migration fails.
    let legacy: string[] = []
    try {
      legacy = parseSeenList(window.localStorage.getItem(SEEN_STORAGE_KEY))
    } catch {
      // Storage is fully unavailable.
    }
    return { durable: false, legacy }
  }
}

function createSeenOperation(
  key: string,
  seen: boolean,
  clock: number,
  writer: string,
  sequence: number,
): SeenOperation {
  return {
    version: 2,
    id: `${clock.toString(36)}.${writer}.${sequence.toString(36)}`,
    key,
    seen,
    clock,
    writer,
    sequence,
  }
}

function createSeenBatch(operations: readonly SeenOperation[]): SeenOperationBatch {
  const first = operations[0]
  const last = operations[operations.length - 1]
  return {
    version: 2,
    type: 'batch',
    id: `${first.clock.toString(36)}.${first.writer}.batch.${first.sequence.toString(
      36,
    )}-${last.sequence.toString(36)}`,
    operations: [...operations],
  }
}

function parseSeenOperation(raw: string | null): SeenOperation | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as Partial<SeenOperation>
    if (
      candidate.version !== 2 ||
      typeof candidate.id !== 'string' ||
      typeof candidate.key !== 'string' ||
      typeof candidate.seen !== 'boolean' ||
      typeof candidate.clock !== 'number' ||
      !Number.isFinite(candidate.clock) ||
      typeof candidate.writer !== 'string' ||
      typeof candidate.sequence !== 'number' ||
      !Number.isFinite(candidate.sequence)
    ) {
      return null
    }
    return candidate as SeenOperation
  } catch {
    return null
  }
}

function parseSeenBatch(raw: string | null): SeenOperationBatch | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as Partial<SeenOperationBatch>
    if (
      candidate.version !== 2 ||
      candidate.type !== 'batch' ||
      typeof candidate.id !== 'string' ||
      !Array.isArray(candidate.operations)
    ) {
      return null
    }
    const operations = candidate.operations
      .map((operation) => parseSeenOperation(JSON.stringify(operation)))
      .filter((operation): operation is SeenOperation => operation !== null)
    if (operations.length !== candidate.operations.length || operations.length === 0) return null
    return { version: 2, type: 'batch', id: candidate.id, operations }
  } catch {
    return null
  }
}

function operationStorageKey(operation: SeenOperation): string {
  return `${SEEN_OPERATION_PREFIX}${operation.id}`
}

function batchStorageKey(batch: SeenOperationBatch): string {
  return `${SEEN_BATCH_PREFIX}${batch.id}`
}

let writerCounter = 0
function createWriterId(): string {
  writerCounter += 1
  try {
    return `${crypto.randomUUID()}.${writerCounter.toString(36)}`
  } catch {
    return `${Date.now().toString(36)}.${writerCounter.toString(36)}.${Math.random()
      .toString(36)
      .slice(2)}`
  }
}

function listsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index])
}
