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
import { runSqlMigrations, SqlMigrationError, type SqlMigration } from './sql-migrations'

const DB_PATH = process.env.DATABASE_PATH || './data/adhdone.db'
const MIGRATIONS_PATH = process.env.MIGRATIONS_PATH || './drizzle'
// Keep explicit for this standalone startup script; matches sync/claim.ts.
const STALE_RUNNING_SYNC_MS = 30 * 60 * 1000
const LINK_METADATA_COLUMNS = [
  'original_url',
  'link_type',
  'domain',
  'content_json',
  'preview_title',
  'preview_description',
  'preview_image_url',
] as const

function richestBookmarkLinkAssignments(): string {
  return LINK_METADATA_COLUMNS.map(
    (column) => `${column} = (
      SELECT candidate.${column}
      FROM bookmark_links AS candidate
      WHERE candidate.user_id = survivor.user_id
        AND candidate.platform = survivor.platform
        AND candidate.bookmark_id = survivor.bookmark_id
        AND candidate.expanded_url = survivor.expanded_url
        AND candidate.${column} IS NOT NULL
      ORDER BY
        length(candidate.${column}) DESC,
        candidate.${column} COLLATE BINARY ASC,
        candidate.id ASC
      LIMIT 1
    )`,
  ).join(',\n')
}

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

// Read and apply migrations from drizzle folder
const journalPath = path.join(MIGRATIONS_PATH, 'meta', '_journal.json')
if (fs.existsSync(journalPath)) {
  try {
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8')) as {
      entries: Array<{ tag: string }>
    }
    const migrations: SqlMigration[] = journal.entries.map((entry) => {
      const sqlPath = path.join(MIGRATIONS_PATH, `${entry.tag}.sql`)
      if (!fs.existsSync(sqlPath)) {
        throw new SqlMigrationError(entry.tag, `Missing SQL file for migration ${entry.tag}`)
      }

      return {
        tag: entry.tag,
        sql: fs.readFileSync(sqlPath, 'utf-8'),
      }
    })

    for (const result of runSqlMigrations(db, migrations)) {
      if (result.status === 'applied') {
        console.log(`[migrate] Applied: ${result.tag}`)
      } else if (result.status === 'adopted') {
        console.log(`[migrate] Adopted completed legacy migration: ${result.tag}`)
      }
    }
  } catch (error) {
    const tag = error instanceof SqlMigrationError ? `: ${error.tag}` : ''
    console.log(`[migrate] FAILED migration${tag}`, error)
    db.close()
    process.exit(1)
  }
}

console.log('[migrate] SQL migrations complete')

// Accounts foundation must exist before oauth_state can install its owner FK
// and X-link generation snapshot. Drizzle's historical SQL creates OAuth
// tables but not these first-class account tables.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'user',
      display_name TEXT,
      avatar_url TEXT,
      email TEXT,
      x_link_version INTEGER NOT NULL DEFAULT 0,
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
  console.log('[migrate] FAILED creating account tables', error)
  db.close()
  process.exit(1)
}

// OAuth PKCE state is bound to both the initiating account and its monotonic
// X-link generation. Disconnect increments users.x_link_version; callbacks
// that already consumed an older state can then be rejected before identity
// or token persistence. Install the account column and rebuild oauth_state in
// one transaction so startup never exposes a partially upgraded boundary.
try {
  const userColumns = db.prepare('PRAGMA table_info(users)').all() as Array<{
    name: string
    notnull: number
  }>
  if (userColumns.length === 0) {
    throw new Error('users table is required before OAuth generation migration')
  }

  const stateColumns = db.prepare('PRAGMA table_info(oauth_state)').all() as Array<{
    name: string
    notnull: number
  }>
  const userIdColumn = stateColumns.find((column) => column.name === 'user_id')
  const stateVersionColumn = stateColumns.find((column) => column.name === 'x_link_version')
  const foreignKeys = db.prepare('PRAGMA foreign_key_list(oauth_state)').all() as Array<{
    table: string
    from: string
    to: string
    on_delete: string
  }>
  const hasOwnerForeignKey = foreignKeys.some(
    (foreignKey) =>
      foreignKey.table === 'users' &&
      foreignKey.from === 'user_id' &&
      foreignKey.to === 'id' &&
      foreignKey.on_delete.toUpperCase() === 'CASCADE',
  )
  const needsUserVersion = !userColumns.some(
    (column) => column.name === 'x_link_version' && column.notnull === 1,
  )
  const needsStateRebuild =
    !userIdColumn ||
    userIdColumn.notnull !== 1 ||
    !stateVersionColumn ||
    stateVersionColumn.notnull !== 1 ||
    !hasOwnerForeignKey

  if (needsUserVersion || needsStateRebuild) {
    db.transaction(() => {
      if (needsUserVersion) {
        db.exec('ALTER TABLE users ADD COLUMN x_link_version INTEGER NOT NULL DEFAULT 0')
      }

      if (!needsStateRebuild) return

      db.exec(`
        DROP TABLE IF EXISTS oauth_state_bound;
        CREATE TABLE oauth_state_bound (
          state TEXT PRIMARY KEY NOT NULL,
          code_verifier TEXT NOT NULL,
          user_id TEXT NOT NULL,
          x_link_version INTEGER NOT NULL DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `)

      if (userIdColumn) {
        if (stateVersionColumn) {
          db.exec(`
            INSERT INTO oauth_state_bound
              (state, code_verifier, user_id, x_link_version, created_at)
            SELECT s.state, s.code_verifier, s.user_id,
                   COALESCE(s.x_link_version, u.x_link_version, 0), s.created_at
            FROM oauth_state s
            INNER JOIN users u ON u.id = s.user_id
            WHERE s.user_id IS NOT NULL;
          `)
        } else {
          db.exec(`
            INSERT INTO oauth_state_bound
              (state, code_verifier, user_id, x_link_version, created_at)
            SELECT s.state, s.code_verifier, s.user_id,
                   u.x_link_version, s.created_at
            FROM oauth_state s
            INNER JOIN users u ON u.id = s.user_id
            WHERE s.user_id IS NOT NULL;
          `)
        }
      }

      db.exec(`
        DROP TABLE IF EXISTS oauth_state;
        ALTER TABLE oauth_state_bound RENAME TO oauth_state;
      `)
    })()
    console.log('[migrate] Installed OAuth X-link generation boundary')
  }
} catch (error) {
  console.log('[migrate] FAILED installing OAuth X-link generation boundary', error)
  db.close()
  process.exit(1)
}

// A token refresh lease is the cross-process counterpart to the in-memory
// coalescing map. It must be claimed before spending X's single-use rotating
// refresh token, and every completion path is conditional on lease ownership.
try {
  const tokenColumns = db.prepare('PRAGMA table_info(oauth_tokens)').all() as Array<{
    name: string
  }>
  const hasLeaseId = tokenColumns.some((column) => column.name === 'refresh_lease_id')
  const hasLeaseStartedAt = tokenColumns.some(
    (column) => column.name === 'refresh_lease_started_at',
  )
  if (!hasLeaseId || !hasLeaseStartedAt) {
    db.transaction(() => {
      if (!hasLeaseId) {
        db.exec('ALTER TABLE oauth_tokens ADD COLUMN refresh_lease_id TEXT')
      }
      if (!hasLeaseStartedAt) {
        db.exec('ALTER TABLE oauth_tokens ADD COLUMN refresh_lease_started_at TEXT')
      }
    })()
    console.log('[migrate] Added durable OAuth refresh lease columns')
  }
} catch (error) {
  console.log('[migrate] FAILED installing durable OAuth refresh lease', error)
  db.close()
  process.exit(1)
}

// Long-running syncs renew this durable lease every 10 seconds. Add it
// idempotently for legacy databases, then seed old rows from started_at so the
// stale reaper can use one COALESCE expression across old and new data.
try {
  const syncLogColumns = db.prepare('PRAGMA table_info(sync_logs)').all() as Array<{
    name: string
  }>
  if (!syncLogColumns.some((column) => column.name === 'heartbeat_at')) {
    db.exec('ALTER TABLE sync_logs ADD COLUMN heartbeat_at text')
    console.log('[migrate] Added sync_logs.heartbeat_at')
  }
  const backfilledHeartbeats = db
    .prepare('UPDATE sync_logs SET heartbeat_at = started_at WHERE heartbeat_at IS NULL')
    .run()
  if (backfilledHeartbeats.changes > 0) {
    console.log(`[migrate] Backfilled ${backfilledHeartbeats.changes} sync heartbeats`)
  }
} catch (error) {
  console.log('[migrate] FAILED installing sync heartbeat lease', error)
  db.close()
  process.exit(1)
}

// A sync claim is the durable `running` log row. Clear rows left behind by a
// terminated process, collapse historical duplicate link enrichment, then
// install the uniqueness boundaries that make both writes race-safe.
try {
  const staleRunningSyncCutoff = new Date(Date.now() - STALE_RUNNING_SYNC_MS).toISOString()
  db.transaction(() => {
    db.prepare(
      `UPDATE sync_logs
       SET status = 'failed',
           completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           error_message = COALESCE(error_message, 'Sync interrupted before completion')
       WHERE status = 'running'
         AND COALESCE(heartbeat_at, started_at) < ?`,
    ).run(staleRunningSyncCutoff)

    db.exec(`
      WITH ranked_running AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY
              COALESCE(heartbeat_at, started_at) DESC,
              started_at DESC,
              id ASC
          ) AS lease_rank
        FROM sync_logs
        WHERE status = 'running'
      )
      UPDATE sync_logs
      SET status = 'failed',
          completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          error_message = 'Legacy duplicate running sync superseded during startup'
      WHERE id IN (
        SELECT id
        FROM ranked_running
        WHERE lease_rank > 1
      );

      UPDATE bookmark_links AS survivor
      SET ${richestBookmarkLinkAssignments()}
      WHERE survivor.id IN (
        SELECT MIN(id)
        FROM bookmark_links
        GROUP BY user_id, platform, bookmark_id, expanded_url
        HAVING COUNT(*) > 1
      );

      DELETE FROM bookmark_links
      WHERE id IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY user_id, platform, bookmark_id, expanded_url
              ORDER BY
                (content_json IS NOT NULL) DESC,
                (preview_title IS NOT NULL) DESC,
                (preview_image_url IS NOT NULL) DESC,
                id ASC
            ) AS duplicate_rank
          FROM bookmark_links
        )
        WHERE duplicate_rank > 1
      );

      CREATE UNIQUE INDEX IF NOT EXISTS sync_logs_one_running_per_user_idx
      ON sync_logs(user_id)
      WHERE status = 'running';

      CREATE UNIQUE INDEX IF NOT EXISTS bookmark_links_identity_idx
      ON bookmark_links(user_id, platform, bookmark_id, expanded_url);
    `)
  })()
  console.log('[migrate] Ensured sync claim and bookmark link uniqueness')
} catch (error) {
  console.log('[migrate] FAILED installing sync/link uniqueness boundaries', error)
  db.close()
  process.exit(1)
}

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

// Public analytics validates post existence across all bookmark owners and
// against visible activity. The bookmarks PK begins with user_id and the
// activity dedupe index begins with action, so neither can serve these exact
// predicates. Install after the guarded activity.hidden migration so legacy
// databases have every indexed column before index creation.
db.exec(`
  CREATE INDEX IF NOT EXISTS bookmarks_platform_id_idx
    ON bookmarks(platform, id);
  CREATE INDEX IF NOT EXISTS activity_platform_bookmark_hidden_idx
    ON activity(platform, bookmark_id, hidden);
`)

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
    SELECT 'x', ot.user_id, ot.user_id
    FROM oauth_tokens ot
    WHERE NOT EXISTS (
      SELECT 1
      FROM user_identities ui
      WHERE ui.provider = 'x' AND ui.user_id = ot.user_id
    );
  `)
  console.log('[migrate] Backfilled users/user_identities from oauth_tokens + bookmarks')
} catch (error) {
  console.log('[migrate] Warning: users/user_identities backfill failed', error)
}

// oauth_tokens is one row per ADHX user, so user_identities must also allow
// exactly one provider='x' row per user. Legacy races may have left multiple
// X identities on an account. Keep the most recently linked row by created_at,
// with rowid as a deterministic tie-breaker. oauth_tokens does not store the X
// provider id, so callback completion order cannot be proven after the fact;
// clear tokens only for deduplicated users rather than risk retaining another
// X account's credentials. They reconnect once. Dedupe + token cleanup + index
// DDL are one transaction; startup fails if durable enforcement cannot install.
try {
  let removedDuplicates = 0
  let clearedTokens = 0
  db.transaction(() => {
    db.exec(`
      DROP TABLE IF EXISTS temp_duplicate_x_identity_users;
      CREATE TEMP TABLE temp_duplicate_x_identity_users (
        user_id TEXT PRIMARY KEY
      );
      INSERT INTO temp_duplicate_x_identity_users (user_id)
      SELECT user_id
      FROM user_identities
      WHERE provider = 'x'
      GROUP BY user_id
      HAVING COUNT(*) > 1;
    `)
    removedDuplicates = db
      .prepare(
        `DELETE FROM user_identities
         WHERE rowid IN (
           SELECT rowid
           FROM (
             SELECT
               rowid,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id
                 ORDER BY COALESCE(created_at, '') DESC, rowid DESC
               ) AS link_rank
             FROM user_identities
             WHERE provider = 'x'
           )
           WHERE link_rank > 1
         )`,
      )
      .run().changes
    clearedTokens = db
      .prepare(
        `DELETE FROM oauth_tokens
         WHERE user_id IN (SELECT user_id FROM temp_duplicate_x_identity_users)`,
      )
      .run().changes
    db.exec(`
      DROP INDEX IF EXISTS user_identities_one_x_per_user_idx;
      CREATE UNIQUE INDEX user_identities_one_x_per_user_idx
        ON user_identities(user_id)
        WHERE provider = 'x';
      DROP TABLE temp_duplicate_x_identity_users;
    `)
  })()
  if (removedDuplicates > 0) {
    console.log(
      `[migrate] Removed ${removedDuplicates} duplicate X identity row(s), keeping newest link`,
    )
  }
  if (clearedTokens > 0) {
    console.log(`[migrate] Cleared ${clearedTokens} ambiguous X token row(s); reconnect required`)
  }
  console.log('[migrate] Enforced one X identity per user')
} catch (error) {
  console.log('[migrate] FAILED enforcing one X identity per user', error)
  db.close()
  process.exit(1)
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

// collection_events — retained raw detail behind Discovery leaderboards
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

// collection_aggregates is the durable all-time rollup for playlist events.
// The first migration transaction recomputes it from the complete legacy log,
// marks the backfill settled, and only then prunes raw detail. A crash rolls
// back all three operations, so restart can safely recompute without double
// counting or losing history. Later boots retain 90 days of raw detail for
// finite windows/dedupe while all-time reads use this table.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS collection_aggregates (
      owner_user_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      view_count INTEGER NOT NULL DEFAULT 0,
      clone_count INTEGER NOT NULL DEFAULT 0,
      last_event_at TEXT,
      hidden INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (owner_user_id, tag)
    );
    CREATE INDEX IF NOT EXISTS collection_aggregates_visibility_recency_idx
      ON collection_aggregates(hidden, last_event_at);
  `)

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const backfillKey = 'collection_aggregates_backfilled_v1'
  let pruned = 0

  if (!isSettled(backfillKey)) {
    db.transaction(() => {
      db.exec('DELETE FROM collection_aggregates')
      db.exec(`
        INSERT INTO collection_aggregates (
          owner_user_id,
          tag,
          view_count,
          clone_count,
          last_event_at,
          hidden
        )
        SELECT
          owner_user_id,
          tag,
          SUM(CASE WHEN action = 'view' THEN 1 ELSE 0 END),
          SUM(CASE WHEN action = 'clone' THEN 1 ELSE 0 END),
          MAX(created_at),
          MAX(hidden)
        FROM collection_events
        WHERE action IN ('view', 'clone')
        GROUP BY owner_user_id, tag
      `)
      markSettled(backfillKey)
      pruned = db.prepare('DELETE FROM collection_events WHERE created_at < ?').run(cutoff).changes
    })()
    console.log('[migrate] Backfilled collection_aggregates from collection_events')
  } else {
    pruned = db.prepare('DELETE FROM collection_events WHERE created_at < ?').run(cutoff).changes
  }

  if (pruned > 0) {
    console.log(`[migrate] Pruned ${pruned} collection_events rows older than 90 days`)
  }
  console.log('[migrate] Ensured collection_aggregates table')
} catch (error) {
  console.log('[migrate] FAILED collection aggregate backfill/pruning', error)
  db.close()
  process.exit(1)
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
      content_type TEXT,
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
  try {
    db.exec('ALTER TABLE moderated_posts ADD COLUMN content_type TEXT')
    console.log('[migrate] Added moderated_posts.content_type')
  } catch {
    // Column already exists — the verification query below still fails closed
    // if ALTER failed for any other reason and the column remains unavailable.
  }
  db.prepare(
    'SELECT platform, bookmark_id, hidden, content_type FROM moderated_posts LIMIT 0',
  ).all()
  db.prepare('SELECT user_id FROM user_bans LIMIT 0').all()
  console.log('[migrate] Ensured moderated_posts / user_bans / admin_audit tables')
} catch (error) {
  console.error('[migrate] FAILED ensuring admin moderation tables', error)
  db.close()
  process.exit(1)
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
