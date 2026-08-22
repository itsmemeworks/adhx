/**
 * `read_status` → `archived_posts` (and `read_at` → `archived_at`).
 *
 * The table recorded "this post is read", which the product now calls
 * archiving — the row means "taken out of the active collection". Renaming it
 * keeps the schema honest with the UI.
 *
 * Extracted from migrate.ts so it can be tested against a database that
 * actually holds the OLD shape. The migration script creates every table
 * fresh in tests, so nothing there would ever exercise this path — and a data
 * migration that only runs in production is one nobody has run.
 */

/** The slice of better-sqlite3 this needs — keeps the module free of the driver. */
export interface MigrationDb {
  prepare(sql: string): { get(...params: unknown[]): unknown }
  exec(sql: string): unknown
}

/**
 * Idempotent. Returns true when it renamed something, false when there was
 * nothing to do (already renamed, or a fresh database that never had the old
 * table).
 *
 * Guarded by reading `sqlite_master` rather than by catching errors, so a
 * second run is a genuine no-op instead of a swallowed exception that could
 * hide a real failure. `ALTER TABLE ... RENAME` is catalogue-only in SQLite —
 * no row rewrite — so this is safe on a large table.
 */
export function renameReadStatusToArchivedPosts(db: MigrationDb): boolean {
  const tableExists = (name: string): boolean =>
    !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name)

  if (!tableExists('read_status') || tableExists('archived_posts')) return false

  db.exec('ALTER TABLE read_status RENAME TO archived_posts')
  db.exec('ALTER TABLE archived_posts RENAME COLUMN read_at TO archived_at')
  // The old indexes followed the table through the rename but kept their old
  // names; drop them so the migration's index block owns the current ones.
  db.exec('DROP INDEX IF EXISTS idx_read_status_read_at')
  db.exec('DROP INDEX IF EXISTS read_status_user_id_idx')
  return true
}
