import type Database from 'better-sqlite3'

const INTERVAL_MS = 6 * 60 * 60_000
const due = new WeakMap<Database.Database, number>()

/** Long-lived connections need fresh statistics after imports. Defer the
 * bounded SQLite 3.46+ optimisation until after this request's DB work and
 * skip a busy writer rather than waiting out the normal request timeout. */
export function scheduleStatistics(sqlite: Database.Database, now = Date.now()): void {
  const next = due.get(sqlite)
  if (next === undefined) {
    due.set(sqlite, now + INTERVAL_MS)
    return
  }
  if (now < next) return
  due.set(sqlite, now + INTERVAL_MS)
  const task = setImmediate(() => {
    if (!sqlite.open) return
    let previous: number | undefined
    try {
      previous = sqlite.pragma('busy_timeout', { simple: true }) as number
      sqlite.pragma('busy_timeout=50')
      sqlite.pragma('optimize')
    } catch {
      // Optional maintenance must never fail a request or defeat a live writer.
    } finally {
      try {
        if (previous !== undefined && sqlite.open) sqlite.pragma(`busy_timeout=${previous}`)
      } catch {
        // Closing a connection must not turn optional upkeep into a crash.
      }
    }
  })
  task.unref()
}
