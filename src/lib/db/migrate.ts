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
      (row) => row.hash
    )
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

        for (const statement of statements) {
          db.exec(statement)
        }

        // Record migration as applied
        db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(
          entry.tag,
          Date.now()
        )

        console.log(`[migrate] Applied: ${entry.tag}`)
      }
    }
  }
}

console.log('[migrate] SQL migrations complete')

// Create FTS5 virtual table (Drizzle doesn't support virtual tables)
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
    id UNINDEXED,
    author,
    author_name,
    text,
    summary,
    content='bookmarks',
    content_rowid='rowid',
    tokenize='porter unicode61'
  );
`)

// Create triggers to keep FTS in sync
db.exec(`
  CREATE TRIGGER IF NOT EXISTS bookmarks_ai AFTER INSERT ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(rowid, id, author, author_name, text, summary)
    VALUES (NEW.rowid, NEW.id, NEW.author, NEW.author_name, NEW.text, NEW.summary);
  END;
`)

db.exec(`
  CREATE TRIGGER IF NOT EXISTS bookmarks_ad AFTER DELETE ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(bookmarks_fts, rowid, id, author, author_name, text, summary)
    VALUES('delete', OLD.rowid, OLD.id, OLD.author, OLD.author_name, OLD.text, OLD.summary);
  END;
`)

db.exec(`
  CREATE TRIGGER IF NOT EXISTS bookmarks_au AFTER UPDATE ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(bookmarks_fts, rowid, id, author, author_name, text, summary)
    VALUES('delete', OLD.rowid, OLD.id, OLD.author, OLD.author_name, OLD.text, OLD.summary);
    INSERT INTO bookmarks_fts(rowid, id, author, author_name, text, summary)
    VALUES (NEW.rowid, NEW.id, NEW.author, NEW.author_name, NEW.text, NEW.summary);
  END;
`)

console.log('[migrate] FTS5 and triggers configured')

// Create indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_author ON bookmarks(author);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_processed_at ON bookmarks(processed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_created_at ON bookmarks(created_at DESC);

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
console.log(`[migrate] Database ready at: ${path.resolve(DB_PATH)}`)

db.close()
