/**
 * Database migration script
 *
 * Applies Drizzle-generated SQL migrations from ./drizzle folder
 * without requiring drizzle-orm at runtime (for standalone Next.js builds)
 */
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { renameReadStatusToArchivedPosts } from './rename-read-status'
import { applyAdminRoleBootstrap, installAccountWriteGuards } from './account-invariants'

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

// read_status → archived_posts (see rename-read-status.ts for the why and the
// idempotency guard). MUST run BEFORE the index block below, which references
// the new names: on a fresh database the Drizzle SQL still creates
// `read_status`, so this converts it in the same boot.
try {
  if (renameReadStatusToArchivedPosts(db)) {
    console.log('[migrate] Renamed read_status → archived_posts (read_at → archived_at)')
  }
} catch (error) {
  console.log('[migrate] FAILED renaming read_status → archived_posts', error)
  db.close()
  process.exit(1)
}

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

  CREATE INDEX IF NOT EXISTS idx_archived_posts_archived_at ON archived_posts(archived_at DESC);
  CREATE INDEX IF NOT EXISTS archived_posts_user_id_idx ON archived_posts(user_id);

  CREATE INDEX IF NOT EXISTS idx_sync_logs_user_id ON sync_logs(user_id);
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

// activity.text_links / activity.quote_json — server-resolved short-link
// expansions and quoted-post reference, recorded at preview time so a
// preview-only pulse item never shows a raw t.co or drops its quote card
// (previously only saved posts had these, derived from bookmark_links /
// bookmarks.quoteContext). Guarded for re-runs (no IF NOT EXISTS).
try {
  db.exec('ALTER TABLE activity ADD COLUMN text_links text')
  console.log('[migrate] Added activity.text_links')
} catch {
  // Column already exists — nothing to do.
}
// bookmark_tags.created_at — when a post was added to a TAG, which is what a
// playlist displays and orders by. Distinct from bookmarks.processed_at (when
// the curator first saved the post, possibly long before curating it), so it
// needed its own column. Guarded for re-runs (no IF NOT EXISTS), then existing
// rows are backfilled from the bookmark's own save time — the closest thing
// history has — so old playlists don't all read "just now".
try {
  db.exec('ALTER TABLE bookmark_tags ADD COLUMN created_at text')
  console.log('[migrate] Added bookmark_tags.created_at')
  const backfilled = db
    .prepare(
      `UPDATE bookmark_tags SET created_at = (
       SELECT b.processed_at FROM bookmarks b
        WHERE b.user_id = bookmark_tags.user_id
          AND b.platform = bookmark_tags.platform
          AND b.id = bookmark_tags.bookmark_id
     ) WHERE created_at IS NULL`,
    )
    .run()
  console.log(`[migrate] Backfilled ${backfilled.changes} bookmark_tags.created_at`)
} catch {
  // Column already exists — nothing to do.
}

try {
  db.exec('ALTER TABLE activity ADD COLUMN quote_json text')
  console.log('[migrate] Added activity.quote_json')
} catch {
  // Column already exists — nothing to do.
}

// activity.hidden — content-level moderation lever for the public
// trending/pulse feed. Defaults to 0 (visible) so existing rows are
// unaffected; set to 1 via the admin-only POST /api/admin/activity/hide
// route to remove a spammy/offensive post from every public read path
// without deleting the append-only event log row. Guarded for re-runs (no
// IF NOT EXISTS). SQLite's ALTER TABLE ADD COLUMN with a literal DEFAULT
// backfills existing rows to 0, matching the column's NOT NULL default.
try {
  db.exec('ALTER TABLE activity ADD COLUMN hidden integer NOT NULL DEFAULT 0')
  console.log('[migrate] Added activity.hidden')
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
    { value: string } | undefined
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

// Accounts foundation: users + user_identities + login_tokens (magic link).
// Guarded CREATE TABLE IF NOT EXISTS — safe on every boot, no Drizzle
// migration file needed for a table-recreate.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'user',
      display_name TEXT,
      avatar_url TEXT,
      email TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_identities (
      provider TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (provider, provider_id)
    );
    CREATE INDEX IF NOT EXISTS user_identities_user_id_idx ON user_identities(user_id);
    CREATE TABLE IF NOT EXISTS login_tokens (
      token_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      intent TEXT NOT NULL,
      user_id TEXT,
      return_to TEXT,
      expires_at INTEGER NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `)
  console.log('[migrate] Ensured users/user_identities/login_tokens tables')
} catch (error) {
  console.log('[migrate] Warning: failed to create account tables', error)
}

// users.role — authorization belongs to the immutable account id. Existing
// installs get a safe non-admin default; configured legacy admin usernames
// are promoted once, below, after the account backfill has run.
try {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
  console.log('[migrate] Added users.role')
} catch {
  // Column already exists — nothing to do.
}

// Backfill `users` + `user_identities` ('x' provider) from existing
// oauth_tokens rows, plus a fallback for users whose tokens were later
// deleted (bookmarks.user_id with no matching users row) so every existing
// account gets a first-class row without forcing re-auth. INSERT OR IGNORE
// makes this idempotent — safe to re-run every boot. Both source columns
// (oauth_tokens.user_id, bookmarks.user_id) are indexed, so this reads via
// index rather than a full table scan.
try {
  db.exec(`
    INSERT OR IGNORE INTO users (id, username, avatar_url)
    SELECT user_id, COALESCE(username, user_id), profile_image_url
    FROM oauth_tokens;

    INSERT OR IGNORE INTO users (id, username)
    SELECT DISTINCT b.user_id, b.user_id
    FROM bookmarks b
    LEFT JOIN users u ON u.id = b.user_id
    WHERE u.id IS NULL;

    INSERT OR IGNORE INTO user_identities (provider, provider_id, user_id)
    SELECT 'x', user_id, user_id
    FROM oauth_tokens;
  `)
  console.log('[migrate] Backfilled users/user_identities from oauth_tokens + bookmarks')
} catch (error) {
  console.log('[migrate] Warning: users/user_identities backfill failed', error)
}

// Convert the legacy mutable-username allowlist only when every configured
// account resolves. Zero/partial matches abort startup without promoting
// anyone, and the rejected configuration is fingerprinted so a later claimant
// can never become eligible on a future boot. ADMIN_USER_IDS is the retry-safe
// recovery/future-grant path.
try {
  const { legacyPromoted, idPromoted } = applyAdminRoleBootstrap(db, {
    adminUsernames: process.env.ADMIN_USERNAMES,
    adminUserIds: process.env.ADMIN_USER_IDS,
  })
  if (legacyPromoted > 0) {
    console.log(
      `[migrate] Bootstrapped ${legacyPromoted} immutable admin role(s) from ADMIN_USERNAMES`,
    )
  }
  if (idPromoted > 0) {
    console.log(`[migrate] Applied ${idPromoted} immutable admin role grant(s)`)
  }
} catch (error) {
  console.log('[migrate] FAILED admin role bootstrap', error)
  db.close()
  process.exit(1)
}

// users.username_chosen — gates the one-time `/welcome` username-choice
// prompt for new email signups (their auto-derived username is the email
// local-part, which otherwise leaks into public /t/{username}/ URLs).
// SQLite has no ADD COLUMN IF NOT EXISTS, so guard re-runs.
try {
  db.exec('ALTER TABLE users ADD COLUMN username_chosen INTEGER NOT NULL DEFAULT 0')
  console.log('[migrate] Added users.username_chosen')
} catch {
  // Column already exists — nothing to do.
}

// Backfill: X users picked their handle on X, so they never need the
// prompt. Idempotent (UPDATE is a no-op once already 1) — safe every boot.
try {
  const res = db
    .prepare(
      `UPDATE users SET username_chosen = 1
       WHERE username_chosen = 0
       AND id IN (SELECT user_id FROM user_identities WHERE provider = 'x')`,
    )
    .run()
  if (res.changes > 0) {
    console.log(`[migrate] Marked username_chosen for ${res.changes} X-linked users`)
  }
} catch (error) {
  console.log('[migrate] Warning: username_chosen backfill failed', error)
}

// users.username_change_count — counts username changes AFTER the first
// free claim (see users.username_chosen above). Same guarded-ALTER pattern.
try {
  db.exec('ALTER TABLE users ADD COLUMN username_change_count INTEGER NOT NULL DEFAULT 0')
  console.log('[migrate] Added users.username_change_count')
} catch {
  // Column already exists — nothing to do.
}

// username_aliases — records every username a user has changed AWAY from
// (after their first claim) so old /t/{username}/... links keep resolving
// via a permanent redirect instead of 404ing. Guarded CREATE TABLE IF NOT
// EXISTS, same pattern as the accounts tables above.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS username_aliases (
      username TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
  console.log('[migrate] Ensured username_aliases table')
} catch (error) {
  console.log('[migrate] Warning: failed to create username_aliases table', error)
}

// collection_events — append-only event log behind Discovery leaderboards
// (docs/specs/discovery-leaderboards.md §3). Guarded CREATE TABLE IF NOT
// EXISTS, same pattern as the accounts tables above.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS collection_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      viewer_id TEXT,
      created_at TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS collection_events_collection_idx ON collection_events(owner_user_id, tag, created_at);
    CREATE INDEX IF NOT EXISTS collection_events_created_at_idx ON collection_events(created_at);
  `)
  console.log('[migrate] Ensured collection_events table')
} catch (error) {
  console.log('[migrate] Warning: failed to create collection_events table', error)
}

// analytics_events — private growth log (see src/lib/analytics/record.ts).
// Guarded CREATE TABLE IF NOT EXISTS, same pattern as collection_events.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      platform TEXT,
      content_type TEXT,
      surface TEXT,
      source TEXT,
      bookmark_id TEXT,
      tag TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS analytics_events_name_created_at_idx ON analytics_events(name, created_at);
    CREATE INDEX IF NOT EXISTS analytics_events_platform_created_at_idx ON analytics_events(platform, created_at);
  `)
  console.log('[migrate] Ensured analytics_events table')
} catch (error) {
  console.log('[migrate] Warning: failed to create analytics_events table', error)
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS moderated_posts (
      platform TEXT NOT NULL,
      bookmark_id TEXT NOT NULL,
      hidden INTEGER NOT NULL DEFAULT 1,
      reason TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      PRIMARY KEY (platform, bookmark_id)
    );
    CREATE TABLE IF NOT EXISTS user_bans (
      user_id TEXT PRIMARY KEY,
      reason TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_audit_created_at_idx ON admin_audit(created_at);
  `)
  console.log('[migrate] Ensured moderated_posts / user_bans / admin_audit tables')
} catch (error) {
  console.log('[migrate] Warning: failed to create admin moderation tables', error)
}

// Durable account-deletion boundary. These triggers are installed only after
// every guarded table and the users table exist. SQLite serializes competing
// writers: a write committed before account deletion is swept by that same
// deletion transaction; a write that proceeds afterward sees no users row and
// aborts here. Existing historical rows are not scanned or rewritten.
try {
  installAccountWriteGuards(db)
  console.log('[migrate] Ensured account-reference write guards')
} catch (error) {
  console.log('[migrate] FAILED installing account-reference write guards', error)
  db.close()
  process.exit(1)
}

try {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const res = db.prepare('DELETE FROM analytics_events WHERE created_at < ?').run(cutoff)
  if (res.changes > 0) {
    console.log(`[migrate] Pruned ${res.changes} analytics_events rows older than 90 days`)
  }
} catch (error) {
  console.log('[migrate] Warning: analytics_events pruning failed', error)
}

// Dead custom-collections product + unused archiver columns. Tables and
// columns stay in historical drizzle SQL so already-applied journals are
// untouched; this drops them on every boot (IF EXISTS / try-catch).
db.exec(`
  DROP TABLE IF EXISTS collection_tweets;
  DROP TABLE IF EXISTS collections;
  DROP TABLE IF EXISTS sync_state;
`)
console.log('[migrate] Dropped unused collections / collection_tweets / sync_state')

for (const column of ['extracted_content', 'filed_path', 'needs_transcript'] as const) {
  try {
    db.exec(`ALTER TABLE bookmarks DROP COLUMN ${column}`)
    console.log(`[migrate] Dropped bookmarks.${column}`)
  } catch {
    // Column already gone (fresh DB after this drop, or a re-run).
  }
}

console.log(`[migrate] Database ready at: ${path.resolve(DB_PATH)}`)

db.close()
