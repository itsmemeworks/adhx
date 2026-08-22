/**
 * One-off repair for collections imported before the sync stamped its
 * "added to ADHX" times in bookmark order.
 *
 * X's bookmarks API returns newest-bookmarked first, and the old sync stamped
 * `processed_at = Date.now()` as it walked that list — so the LAST row saved
 * (the oldest bookmark) ended up with the newest "added" time and the
 * Collection's default `added desc` sort opened on the oldest bookmarks. New
 * imports are fixed at the source (`addedAtForIndex`); this script fixes rows
 * already in the database by reversing each import batch's own stamps
 * (`planAddedOrderRepair` — no timestamp is invented, and a batch keeps
 * exactly the stamps it had).
 *
 * Usage (dry run first — it prints what would change and touches nothing):
 *
 *   DATABASE_PATH=./data/adhdone.db pnpm tsx scripts/repair-added-order.ts
 *   DATABASE_PATH=./data/adhdone.db pnpm tsx scripts/repair-added-order.ts --apply
 *
 * Runs once per user: each repaired user gets a `user_preferences` marker
 * (`added_order_repaired_v1`) and is skipped afterwards; `--force` ignores the
 * marker. The repair is idempotent (it re-stamps into a canonical order rather
 * than swapping), so re-running is harmless — but it is NOT an undo. Snapshot
 * the database first: `sqlite3 <db> ".backup <db>.bak"`.
 */
import Database from 'better-sqlite3'
import { planAddedOrderRepair, type AddedOrderRow } from '../src/lib/sync/added-at'

const MARKER_KEY = 'added_order_repaired_v1'
const DB_PATH = process.env.DATABASE_PATH || './data/adhdone.db'
const apply = process.argv.includes('--apply')
const force = process.argv.includes('--force')

const sqlite = new Database(DB_PATH)
sqlite.pragma('busy_timeout = 10000')

const users = sqlite
  .prepare(
    `SELECT user_id AS userId, COUNT(*) AS total
       FROM bookmarks
      WHERE source = 'sync'
      GROUP BY user_id
      ORDER BY total DESC`,
  )
  .all() as { userId: string; total: number }[]

const readMarker = sqlite.prepare(
  `SELECT value FROM user_preferences WHERE user_id = ? AND key = ?`,
)
const readRows = sqlite.prepare(
  `SELECT rowid AS rowid, processed_at AS processedAt
     FROM bookmarks
    WHERE user_id = ? AND source = 'sync'
    ORDER BY rowid ASC`,
)
const writeRow = sqlite.prepare(`UPDATE bookmarks SET processed_at = ? WHERE rowid = ?`)
const writeMarker = sqlite.prepare(
  `INSERT INTO user_preferences (user_id, key, value, updated_at)
        VALUES (?, ?, ?, ?)
   ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
)

console.log(`${apply ? 'REPAIRING' : 'DRY RUN'} — ${DB_PATH}`)
console.log(`${users.length} user(s) with synced bookmarks\n`)

let repairedUsers = 0
let repairedRows = 0

for (const user of users) {
  if (!force && readMarker.get(user.userId, MARKER_KEY)) {
    console.log(`- ${user.userId}: already repaired, skipping (--force to re-check)`)
    continue
  }

  const rows = readRows.all(user.userId) as AddedOrderRow[]
  const plan = planAddedOrderRepair(rows)
  if (plan.length === 0) {
    console.log(`- ${user.userId}: ${rows.length} synced row(s), nothing to reorder`)
    continue
  }

  console.log(`- ${user.userId}: ${plan.length}/${rows.length} synced row(s) get a new added time`)
  if (!apply) continue

  const runAll = sqlite.transaction(() => {
    for (const row of plan) writeRow.run(row.processedAt, row.rowid)
    writeMarker.run(user.userId, MARKER_KEY, new Date().toISOString(), new Date().toISOString())
  })
  runAll()
  repairedUsers++
  repairedRows += plan.length
}

console.log(
  apply
    ? `\nDone — ${repairedRows} row(s) across ${repairedUsers} user(s) reordered.`
    : `\nDry run only. Re-run with --apply to write these changes.`,
)
sqlite.close()
