/**
 * "Added to ADHX" stamps for a batch import, in the order the source listed it.
 *
 * The Collection's default sort is `added` (newest first) — the date the post
 * entered ADHX, not the network's post time. A manual save gets that for free
 * (`processedAt = now`), but a sync imports hundreds of rows in one pass and
 * X's bookmarks API returns them **newest-bookmarked first**. Stamping each
 * row with `Date.now()` as the loop advances therefore hands the LAST-saved
 * row (the oldest bookmark) the newest stamp, and the Collection opens on the
 * stuff you bookmarked longest ago — the bug this fixes.
 *
 * So the batch counts *backwards* from the moment the sync started: index 0
 * (most recently bookmarked) keeps the sync's own timestamp and each later
 * index lands 1ms earlier, preserving the source order under `added desc`.
 * Milliseconds are the finest granularity an ISO string carries, and 1ms per
 * row keeps even a 10k-bookmark backfill inside a 10-second window, so it
 * can't reach back past a previous sync's rows.
 *
 * Pure and index-based (not "one tick per save") so duplicates that get
 * skipped mid-loop don't shift the rows that follow them.
 */
export function addedAtForIndex(batchStartedAtMs: number, index: number): string {
  return new Date(batchStartedAtMs - index).toISOString()
}

/** One already-stored row, in INSERT order (SQLite rowid ascending). */
export interface AddedOrderRow {
  rowid: number
  processedAt: string
}

/** Default batch boundary: syncs save ~150ms apart, so any gap this big is a different import. */
export const REPAIR_BATCH_GAP_MS = 5 * 60 * 1000

/**
 * Repair plan for rows written BEFORE `addedAtForIndex` existed — the
 * backwards-ordered collections already in the database.
 *
 * Rows arrive in insert order (= the order X listed them, newest bookmarked
 * first). Consecutive rows less than `batchGapMs` apart are treated as one
 * import batch; within a batch the stamps that batch already owns are
 * reassigned in reverse, so the first-inserted row takes the newest stamp.
 * Nothing else moves: no timestamp is invented, and each batch keeps exactly
 * the set of stamps it had, so the repair can't push rows past a neighbouring
 * import. Single-row batches are returned unchanged (and filtered out by the
 * caller as no-ops).
 *
 * The result is a canonical arrangement (insert order ↔ descending stamps), not
 * a swap, so the repair is IDEMPOTENT — a second pass returns an empty plan
 * rather than flipping the rows back. It is therefore safe to re-run and
 * cannot be used as an undo: snapshot the database before applying it.
 */
export function planAddedOrderRepair(
  rows: AddedOrderRow[],
  batchGapMs: number = REPAIR_BATCH_GAP_MS,
): AddedOrderRow[] {
  const batches: AddedOrderRow[][] = []
  for (const row of rows) {
    const current = batches[batches.length - 1]
    const previous = current?.[current.length - 1]
    const gap = previous
      ? Math.abs(Date.parse(row.processedAt) - Date.parse(previous.processedAt))
      : 0
    if (!current || gap > batchGapMs) {
      batches.push([row])
    } else {
      current.push(row)
    }
  }

  const plan: AddedOrderRow[] = []
  for (const batch of batches) {
    const stamps = batch.map((r) => r.processedAt).sort()
    batch.forEach((row, i) => {
      const processedAt = stamps[stamps.length - 1 - i]
      if (processedAt !== row.processedAt) plan.push({ rowid: row.rowid, processedAt })
    })
  }
  return plan
}
