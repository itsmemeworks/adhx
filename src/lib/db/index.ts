import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>

/**
 * One better-sqlite3 handle per process. Next can evaluate this module twice
 * (RSC graph vs route graph); two connections to the same WAL file is why
 * `/t/{user}/{tag}` could still render "Private playlist" after PATCH made
 * the tag public — the page's connection missed the route's write.
 *
 * Path is read lazily (bracket access so Turbopack cannot inline `undefined`
 * at compile time). Playwright e2e migrates `data/e2e.db` then sets
 * DATABASE_PATH; a compile-time open would stick to empty `adhdone.db` and
 * `/api/health` would still pass (`SELECT 1` needs no tables).
 */
const globalForDb = globalThis as unknown as {
  __adhxSqlite?: Database.Database
  __adhxSqlitePath?: string
  __adhxDrizzle?: DrizzleDb
}

function resolveDbPath(): string {
  const fromEnv = process.env['DATABASE_PATH'] || process.env['ADHX_DATABASE_PATH']
  if (fromEnv) return fromEnv
  // Only the Playwright Next (distDir `.next-e2e`) reads the sidecar — never
  // the owner's `pnpm dev` on `.next`.
  if (process.env['NEXT_DIST_DIR'] === '.next-e2e') {
    try {
      const sidecar = path.join(process.cwd(), '.next-e2e', 'database-path')
      if (fs.existsSync(sidecar)) {
        const written = fs.readFileSync(sidecar, 'utf8').trim()
        if (written) return written
      }
    } catch {
      // no e2e sidecar
    }
  }
  return './data/adhdone.db'
}

function getSqlite(): Database.Database {
  const dbPath = resolveDbPath()
  if (globalForDb.__adhxSqlite && globalForDb.__adhxSqlitePath === dbPath) {
    return globalForDb.__adhxSqlite
  }
  if (globalForDb.__adhxSqlite) {
    try {
      globalForDb.__adhxSqlite.close()
    } catch {
      // stale compile-time handle
    }
    globalForDb.__adhxSqlite = undefined
    globalForDb.__adhxDrizzle = undefined
  }

  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  // The constructor `timeout` installs the busy handler BEFORE any pragma runs:
  // `journal_mode = WAL` takes an exclusive lock, and `next build`'s parallel
  // page-data workers each import this module against a fresh db file — without
  // a pre-armed busy handler one worker throws "database is locked" and the
  // whole build dies (flaked twice in CI before this fix).
  const sqlite = new Database(dbPath, { timeout: 10000 })
  sqlite.pragma('busy_timeout = 10000')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  globalForDb.__adhxSqlite = sqlite
  globalForDb.__adhxSqlitePath = dbPath
  console.info(`[db] opened ${dbPath}`)
  return sqlite
}

function getDrizzle(): DrizzleDb {
  const sqlite = getSqlite()
  if (!globalForDb.__adhxDrizzle) {
    globalForDb.__adhxDrizzle = drizzle(sqlite, { schema })
  }
  return globalForDb.__adhxDrizzle
}

function bindProxy<T extends object>(load: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop, _receiver) {
      const instance = load()
      const value = Reflect.get(instance, prop, instance)
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(instance)
        : value
    },
  })
}

export const db = bindProxy<DrizzleDb>(getDrizzle)
export const rawDb = bindProxy<Database.Database>(getSqlite)

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
  return getSqlite().transaction(fn)
}

/**
 * Run a function within a transaction (alternative API for async-like usage).
 * Note: The function itself must be synchronous due to SQLite's nature.
 */
export function runInTransaction<R>(fn: () => R): R {
  return getSqlite().transaction(fn)()
}

if (!(globalThis as unknown as { __adhxSqliteExitHook?: boolean }).__adhxSqliteExitHook) {
  ;(globalThis as unknown as { __adhxSqliteExitHook?: boolean }).__adhxSqliteExitHook = true
  process.on('exit', () => {
    globalForDb.__adhxSqlite?.close()
  })
}
