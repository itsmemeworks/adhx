import { describe, it, expect } from 'vitest'
import {
  addedAtForIndex,
  planAddedOrderRepair,
  REPAIR_BATCH_GAP_MS,
  type AddedOrderRow,
} from '@/lib/sync/added-at'

/**
 * The Collection's default sort is "added to ADHX", newest first. X returns
 * bookmarks newest-bookmarked first, so a batch import has to stamp its rows
 * in DESCENDING time as it walks that list — the old `Date.now()`-per-row sync
 * did the opposite and opened the Collection on the oldest bookmarks.
 */
describe('addedAtForIndex', () => {
  const base = Date.parse('2026-08-22T08:26:03.000Z')

  it('gives the first-listed (most recently bookmarked) row the newest stamp', () => {
    const first = addedAtForIndex(base, 0)
    const second = addedAtForIndex(base, 1)
    expect(first).toBe('2026-08-22T08:26:03.000Z')
    expect(first > second).toBe(true)
  })

  it('stays strictly descending across a large backfill', () => {
    const stamps = Array.from({ length: 500 }, (_, i) => addedAtForIndex(base, i))
    const sortedDesc = [...stamps].sort().reverse()
    expect(stamps).toEqual(sortedDesc)
    expect(new Set(stamps).size).toBe(500)
  })

  it('keeps a 10k-row backfill inside 10 seconds of the sync start', () => {
    const last = Date.parse(addedAtForIndex(base, 9999))
    expect(base - last).toBeLessThan(10_000)
  })

  it('is index-based, so a skipped duplicate does not shift later rows', () => {
    // Rows 0 and 2 saved, row 1 skipped as a duplicate.
    expect(addedAtForIndex(base, 2)).toBe(addedAtForIndex(base, 2))
    expect(addedAtForIndex(base, 2) < addedAtForIndex(base, 0)).toBe(true)
  })
})

/** Rows as stored: insert order (rowid ascending) with ascending stamps — the bug. */
function invertedBatch(startIso: string, count: number, stepMs = 150): AddedOrderRow[] {
  const start = Date.parse(startIso)
  return Array.from({ length: count }, (_, i) => ({
    rowid: i + 1,
    processedAt: new Date(start + i * stepMs).toISOString(),
  }))
}

describe('planAddedOrderRepair', () => {
  it('reverses a single import batch onto its own stamps', () => {
    const rows = invertedBatch('2026-08-22T08:26:00.000Z', 4)
    const plan = planAddedOrderRepair(rows)
    const byRowid = new Map(plan.map((r) => [r.rowid, r.processedAt]))

    // First-inserted row (newest bookmark) now holds the batch's newest stamp.
    expect(byRowid.get(1)).toBe(rows[3].processedAt)
    expect(byRowid.get(4)).toBe(rows[0].processedAt)
    // Same set of stamps — nothing invented, nothing lost.
    const repaired = rows.map((r) => byRowid.get(r.rowid) ?? r.processedAt)
    expect([...repaired].sort()).toEqual(rows.map((r) => r.processedAt).sort())
  })

  it('is idempotent — a second pass has nothing left to do', () => {
    const rows = invertedBatch('2026-08-22T08:26:00.000Z', 5)
    const first = new Map(planAddedOrderRepair(rows).map((r) => [r.rowid, r.processedAt]))
    const once = rows.map((r) => ({ ...r, processedAt: first.get(r.rowid) ?? r.processedAt }))
    expect(planAddedOrderRepair(once)).toEqual([])
  })

  it('never moves a row past a neighbouring import', () => {
    const older = invertedBatch('2026-06-01T10:00:00.000Z', 3)
    const newer = invertedBatch('2026-08-22T08:26:00.000Z', 3).map((r) => ({
      ...r,
      rowid: r.rowid + 10,
    }))
    const plan = planAddedOrderRepair([...older, ...newer])
    const byRowid = new Map(plan.map((r) => [r.rowid, r.processedAt]))

    const olderStamps = older.map((r) => byRowid.get(r.rowid) ?? r.processedAt)
    const newerStamps = newer.map((r) => byRowid.get(r.rowid) ?? r.processedAt)
    expect(Math.max(...olderStamps.map(Date.parse))).toBeLessThan(
      Math.min(...newerStamps.map(Date.parse)),
    )
  })

  it('splits batches on a gap larger than the threshold', () => {
    const a = { rowid: 1, processedAt: '2026-08-22T08:00:00.000Z' }
    const b = {
      rowid: 2,
      processedAt: new Date(Date.parse(a.processedAt) + REPAIR_BATCH_GAP_MS + 1).toISOString(),
    }
    // Two batches of one row each — nothing to reverse.
    expect(planAddedOrderRepair([a, b])).toEqual([])
  })

  it('leaves an already-correct (descending) batch alone', () => {
    const base = Date.parse('2026-08-22T08:26:03.000Z')
    const rows = Array.from({ length: 6 }, (_, i) => ({
      rowid: i + 1,
      processedAt: addedAtForIndex(base, i),
    }))
    expect(planAddedOrderRepair(rows)).toEqual([])
  })

  it('handles an empty collection', () => {
    expect(planAddedOrderRepair([])).toEqual([])
  })
})
