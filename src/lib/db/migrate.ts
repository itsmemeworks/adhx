/**
 * Database migration script using Drizzle Kit
 *
 * This script:
 * 1. Runs Drizzle migrations from ./drizzle folder
 * 2. Sets up FTS5 full-text search (not supported by Drizzle ORM)
 * 3. Creates triggers to keep FTS in sync
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DATABASE_PATH || './data/adhdone.db'

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

console.log(`[migrate] Running migrations on ${DB_PATH}...`)

// Create SQLite connection
const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// Create Drizzle instance
const db = drizzle(sqlite)

// Run Drizzle migrations
// The migrations folder path is relative to the working directory
const migrationsFolder = process.env.MIGRATIONS_PATH || './drizzle'
migrate(db, { migrationsFolder })

console.log('[migrate] Drizzle migrations complete')

// Create FTS5 virtual table (Drizzle doesn't support virtual tables)
sqlite.exec(`
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
sqlite.exec(`
  CREATE TRIGGER IF NOT EXISTS bookmarks_ai AFTER INSERT ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(rowid, id, author, author_name, text, summary)
    VALUES (NEW.rowid, NEW.id, NEW.author, NEW.author_name, NEW.text, NEW.summary);
  END;
`)

sqlite.exec(`
  CREATE TRIGGER IF NOT EXISTS bookmarks_ad AFTER DELETE ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(bookmarks_fts, rowid, id, author, author_name, text, summary)
    VALUES('delete', OLD.rowid, OLD.id, OLD.author, OLD.author_name, OLD.text, OLD.summary);
  END;
`)

sqlite.exec(`
  CREATE TRIGGER IF NOT EXISTS bookmarks_au AFTER UPDATE ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(bookmarks_fts, rowid, id, author, author_name, text, summary)
    VALUES('delete', OLD.rowid, OLD.id, OLD.author, OLD.author_name, OLD.text, OLD.summary);
    INSERT INTO bookmarks_fts(rowid, id, author, author_name, text, summary)
    VALUES (NEW.rowid, NEW.id, NEW.author, NEW.author_name, NEW.text, NEW.summary);
  END;
`)

console.log('[migrate] FTS5 and triggers configured')

// Create indexes (these are kept here for performance, Drizzle schema can define them too)
sqlite.exec(`
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

sqlite.close()
