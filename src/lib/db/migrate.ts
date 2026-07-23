/**
 * Database migration script
 *
 * Applies Drizzle-generated SQL migrations from ./drizzle folder
 * without requiring drizzle-orm at runtime (for standalone Next.js builds)
 */
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DATABASE_PATH || './data/adhdone.db'
const MIGRATIONS_PATH = process.env.MIGRATIONS_PATH || './drizzle'

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

console.log(`[migrate] Running migrations on ${DB_PATH}...`)

// Create SQLite connection
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Create migrations tracking table (same as Drizzle uses)
db.exec(`
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY,
    hash TEXT NOT NULL,
    created_at INTEGER
  );
`)

// Read and apply migrations from drizzle folder
const journalPath = path.join(MIGRATIONS_PATH, 'meta', '_journal.json')
if (fs.existsSync(journalPath)) {
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'))

  // Get already applied migrations
  const applied = new Set(
    (db.prepare('SELECT hash FROM __drizzle_migrations').all() as { hash: string }[]).map(
      (row) => row.hash,
    ),
  )

  // Apply new migrations
  for (const entry of journal.entries) {
    if (!applied.has(entry.tag)) {
      const sqlPath = path.join(MIGRATIONS_PATH, `${entry.tag}.sql`)
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf-8')

        // Split by Drizzle's statement breakpoint marker and execute each
        const statements = sql
          .split('--> statement-breakpoint')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)

        try {
          for (const statement of statements) {
            db.exec(statement)
          }
        } catch (error) {
          console.log(`[migrate] FAILED migration: ${entry.tag}`, error)
          db.close()
          process.exit(1)
        }

        // Record migration as applied
        db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
          entry.tag,
          Date.now(),
        )

        console.log(`[migrate] Applied: ${entry.tag}`)
      }
    }
  }
}

console.log('[migrate] SQL migrations complete')

// bookmarks_fts (FTS5) + its ai/ad/au triggers used to mirror every bookmark
// write into a full-text index, but nothing ever queries it — feed/search
// uses a plain LIKE (see src/app/api/feed/route.ts) — so it was pure write
// amplification (3 extra index writes per insert/update/delete). Drop it
// idempotently. If full-text search is needed later, re-add FTS5 with a
// backfill from the existing `bookmarks` table rather than reviving this.
db.exec(`
  DROP TRIGGER IF EXISTS bookmarks_ai;
  DROP TRIGGER IF EXISTS bookmarks_ad;
  DROP TRIGGER IF EXISTS bookmarks_au;
  DROP TABLE IF EXISTS bookmarks_fts;
`)

console.log('[migrate] Dropped unused bookmarks_fts table and sync triggers')

// Create indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_author ON bookmarks(author);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_processed_at ON bookmarks(processed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_created_at ON bookmarks(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_source ON bookmarks(source);

  CREATE INDEX IF NOT EXISTS idx_links_bookmark ON bookmark_links(bookmark_id);
  CREATE INDEX IF NOT EXISTS idx_links_domain ON bookmark_links(domain);

  CREATE INDEX IF NOT EXISTS idx_tags_tag ON bookmark_tags(tag);
  CREATE INDEX IF NOT EXISTS idx_media_bookmark ON bookmark_media(bookmark_id);
  CREATE INDEX IF NOT EXISTS idx_media_status ON bookmark_media(download_status);

  CREATE INDEX IF NOT EXISTS idx_read_status_read_at ON read_status(read_at DESC);
  CREATE INDEX IF NOT EXISTS idx_collection_tweets_bookmark ON collection_tweets(bookmark_id);

  CREATE INDEX IF NOT EXISTS idx_sync_logs_user_id ON sync_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_sync_state_user_id ON sync_state(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
`)

console.log('[migrate] Indexes created')

// activity.author_avatar_url — added after the table's initial schema so the
// pulse/Discover can show the post author's avatar on tweet-style cards.
// SQLite's ALTER TABLE ADD COLUMN has no IF NOT EXISTS, so guard re-runs.
try {
  db.exec('ALTER TABLE activity ADD COLUMN author_avatar_url text')
  console.log('[migrate] Added activity.author_avatar_url')
} catch {
  // Column already exists — nothing to do.
}

// activity.content_type — server-resolved post type so preview-only items (no
// saved bookmark) render the right card (e.g. an article shows its cover +
// headline, not a bare "Saved post"). Guarded for re-runs (no IF NOT EXISTS).
try {
  db.exec('ALTER TABLE activity ADD COLUMN content_type text')
  console.log('[migrate] Added activity.content_type')
} catch {
  // Column already exists — nothing to do.
}

// Tiny settle-guard table for the one-time backfills below. Both backfills
// scan/rewrite a full table (bookmarks / bookmark_media) with no usable index
// for their WHERE clause (a leading-wildcard NOT LIKE, and platform+type
// equality with no covering index), so re-running the scan on every boot is
// unbounded cost that only ever grows with the table. Once a backfill finds
// nothing left to fix, it's marked settled here and skipped on future boots
// (a single primary-key lookup) instead of re-scanning the whole table.
db.exec(`
  CREATE TABLE IF NOT EXISTS migration_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`)
function isSettled(key: string): boolean {
  const row = db.prepare('SELECT value FROM migration_state WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value === '1'
}
function markSettled(key: string): void {
  db.prepare(
    `INSERT INTO migration_state (key, value, updated_at) VALUES (?, '1', ?)
     ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = excluded.updated_at`,
  ).run(key, new Date().toISOString())
}

// Normalize non-ISO created_at dates (Twitter format like "Wed Jan 28 02:28:44 +0000 2026")
// to ISO 8601 format for correct string-based sorting
try {
  if (isSettled('bookmarks_created_at_normalized')) {
    console.log('[migrate] created_at already normalized, skipping scan')
  } else {
    const nonIsoRows = db
      .prepare(
        `SELECT rowid, created_at FROM bookmarks WHERE created_at IS NOT NULL AND created_at NOT LIKE '____-%'`,
      )
      .all() as { rowid: number; created_at: string }[]

    if (nonIsoRows.length > 0) {
      const update = db.prepare('UPDATE bookmarks SET created_at = ? WHERE rowid = ?')
      const normalize = db.transaction(() => {
        for (const row of nonIsoRows) {
          const parsed = new Date(row.created_at)
          if (!isNaN(parsed.getTime())) {
            update.run(parsed.toISOString(), row.rowid)
          }
        }
      })
      normalize()
      console.log(`[migrate] Normalized ${nonIsoRows.length} non-ISO created_at dates`)
    }
    markSettled('bookmarks_created_at_normalized')
  }
} catch (error) {
  console.log('[migrate] Warning: failed to normalize created_at dates', error)
}
// Instagram video restored (vxinstagram mirror, see src/lib/media/mirrors.ts).
// While IG was degraded, saved Reels were stored as poster-only `photo` media
// rows. Flip them back to `video` so they play again. IG saves are reel-centric
// (the add path routes everything through addInstagramReel), so this is safe;
// a rare photo post that gets flipped just falls back to its poster on a play
// error. Idempotent (no-op once flipped) and guarded.
try {
  if (isSettled('instagram_media_photo_to_video')) {
    console.log('[migrate] Instagram media backfill already settled, skipping scan')
  } else {
    const res = db
      .prepare(
        `UPDATE bookmark_media SET media_type = 'video'
         WHERE platform = 'instagram' AND media_type = 'photo'`,
      )
      .run()
    if (res.changes > 0) {
      console.log(`[migrate] Instagram media photo→video: ${res.changes} rows`)
    }
    markSettled('instagram_media_photo_to_video')
  }
} catch (error) {
  console.log('[migrate] Warning: Instagram media backfill failed', error)
}

// activity is an append-only public event log (see CLAUDE.md — not
// user-owned content, exempt from the composite-key convention) with no
// pruning, so it grows unbounded on the 1GB volume. The trending/pulse reads
// only ever look back 24h (recentActivity) or the last ~80 rows (FETCH in
// src/lib/trending/query.ts), so a 30-day retention window is far more than
// enough. Cheap (indexed on created_at via activity_created_at_idx), safe,
// and idempotent — re-running just deletes nothing once caught up.
try {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const res = db.prepare('DELETE FROM activity WHERE created_at < ?').run(cutoff)
  if (res.changes > 0) {
    console.log(`[migrate] Pruned ${res.changes} activity rows older than 30 days`)
  }
} catch (error) {
  console.log('[migrate] Warning: activity pruning failed', error)
}

console.log(`[migrate] Database ready at: ${path.resolve(DB_PATH)}`)

db.close()
