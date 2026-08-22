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
 * Path resolution:
 * - `process.env.ADHX_DATABASE_PATH` (dot access) is inlined by Next `env`
 *   for the Playwright server (`.next-e2e`). Bracket access is NOT replaced
 *   and was falling through to a relative empty file in CI workers.
 * - `process.env['DATABASE_PATH']` stays bracketed so production Next cannot
 *   compile it to `undefined`; Fly/local/tsx set it at runtime.
 */
const globalForDb = globalThis as unknown as {
  __adhxSqlite?: Database.Database
  __adhxSqlitePath?: string
  __adhxDrizzle?: DrizzleDb
}

function nonEmpty(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function resolveDbPath(): string {
  // Dot access so Next `env` inlining applies. Bracket form is not replaced.
  const inlined = nonEmpty(process.env.ADHX_DATABASE_PATH)
  if (inlined) return path.resolve(inlined)

  // Bracket so production Next cannot compile this to `undefined`.
  const fromEnv = nonEmpty(process.env['DATABASE_PATH'])
  if (fromEnv) return path.resolve(fromEnv)

  // Only the Playwright Next (distDir `.next-e2e`) reads the sidecar — never
  // the owner's `pnpm dev` on `.next`.
  if (process.env['NEXT_DIST_DIR'] === '.next-e2e') {
    try {
      const sidecar = path.join(process.cwd(), '.next-e2e', 'database-path')
      if (fs.existsSync(sidecar)) {
        const written = fs.readFileSync(sidecar, 'utf8').trim()
        if (written) return path.resolve(written)
      }
    } catch {
      // no e2e sidecar
    }
  }
  return path.resolve('./data/adhdone.db')
}

function hasExplicitDbPath(): boolean {
  return Boolean(nonEmpty(process.env.ADHX_DATABASE_PATH) || nonEmpty(process.env['DATABASE_PATH']))
}

function schemaReady(sqlite: Database.Database): boolean {
  const row = sqlite
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
    .get() as { ok?: number } | undefined
  return row?.ok === 1
}

function openSqlite(dbPath: string, fileMustExist: boolean): Database.Database {
  const sqlite = new Database(dbPath, { timeout: 10000, fileMustExist })
  sqlite.pragma('busy_timeout = 10000')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return sqlite
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
  const explicit = hasExplicitDbPath()
  let sqlite = openSqlite(dbPath, explicit)
  if (!schemaReady(sqlite) && explicit) {
    try {
      sqlite.close()
    } catch {
      // reopen after a deleted-and-recreated inode
    }
    sqlite = openSqlite(dbPath, true)
    if (!schemaReady(sqlite)) {
      throw new Error(
        `[db] ${dbPath} (cwd=${process.cwd()}) has no users table — migrate before starting Next`,
      )
    }
  }

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
