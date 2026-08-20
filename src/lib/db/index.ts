import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

// Database path from env or default
const DB_PATH = process.env.DATABASE_PATH || './data/adhdone.db'

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

// Create SQLite connection with WAL mode for better performance.
// The constructor `timeout` installs the busy handler BEFORE any pragma runs:
// `journal_mode = WAL` takes an exclusive lock, and `next build`'s parallel
// page-data workers each import this module against a fresh db file — without
// a pre-armed busy handler one worker throws "database is locked" and the
// whole build dies (flaked twice in CI before this fix).
const sqlite = new Database(DB_PATH, { timeout: 10000 })
sqlite.pragma('busy_timeout = 10000')
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// Create Drizzle instance
export const db = drizzle(sqlite, { schema })

// Export raw sqlite for FTS5 operations (Drizzle doesn't support virtual tables natively)
export const rawDb = sqlite

/**
 * Create a transaction wrapper for atomic multi-table operations.
 * Uses better-sqlite3's synchronous transaction API for guaranteed atomicity.
 *
 * @example
 * const deleteBookmark = createTransaction((userId: string, bookmarkId: string) => {
 *   db.delete(bookmarkTags).where(...).run()
 *   db.delete(bookmarks).where(...).run()
 * })
 * deleteBookmark(userId, bookmarkId)
 */
export function createTransaction<T extends unknown[], R>(
  fn: (...args: T) => R,
): (...args: T) => R {
  return sqlite.transaction(fn)
}

/**
 * Run a function within a transaction (alternative API for async-like usage).
 * Note: The function itself must be synchronous due to SQLite's nature.
 */
export function runInTransaction<R>(fn: () => R): R {
  return sqlite.transaction(fn)()
}

// Close database on process exit
process.on('exit', () => {
  sqlite.close()
})
