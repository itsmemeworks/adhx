/**
 * Database migration script (CommonJS for Docker compatibility)
 * Runs on container startup to ensure schema exists
 */
const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const DB_PATH = process.env.DATABASE_PATH || '/data/adhx.db'

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

console.log(`[migrate] Running migrations on ${DB_PATH}...`)

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    author TEXT NOT NULL,
    author_name TEXT,
    text TEXT NOT NULL,
    tweet_url TEXT NOT NULL,
    created_at TEXT,
    processed_at TEXT NOT NULL,
    category TEXT DEFAULT 'tweet',
    is_reply INTEGER DEFAULT 0,
    reply_context TEXT,
    is_quote INTEGER DEFAULT 0,
    quote_context TEXT,
    extracted_content TEXT,
    filed_path TEXT,
    needs_transcript INTEGER DEFAULT 0,
    summary TEXT,
    raw_json TEXT
  );

  CREATE TABLE IF NOT EXISTS bookmark_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    original_url TEXT,
    expanded_url TEXT NOT NULL,
    link_type TEXT,
    domain TEXT,
    content_json TEXT
  );

  CREATE TABLE IF NOT EXISTS bookmark_tags (
    bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (bookmark_id, tag)
  );

  CREATE TABLE IF NOT EXISTS bookmark_media (
    id TEXT PRIMARY KEY,
    bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,
    original_url TEXT NOT NULL,
    preview_url TEXT,
    local_path TEXT,
    thumbnail_path TEXT,
    download_status TEXT DEFAULT 'pending',
    downloaded_at TEXT,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    file_size_bytes INTEGER,
    alt_text TEXT
  );

  CREATE TABLE IF NOT EXISTS oauth_tokens (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    scopes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS oauth_state (
    state TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS read_status (
    bookmark_id TEXT PRIMARY KEY REFERENCES bookmarks(id) ON DELETE CASCADE,
    read_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    icon TEXT,
    share_code TEXT UNIQUE,
    is_public INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS collection_tweets (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    PRIMARY KEY (collection_id, bookmark_id)
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
  );
`)

// Create indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(category);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_author ON bookmarks(author);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_processed_at ON bookmarks(processed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_created_at ON bookmarks(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_links_bookmark ON bookmark_links(bookmark_id);
  CREATE INDEX IF NOT EXISTS idx_tags_tag ON bookmark_tags(tag);
  CREATE INDEX IF NOT EXISTS idx_media_bookmark ON bookmark_media(bookmark_id);
  CREATE INDEX IF NOT EXISTS idx_read_status_read_at ON read_status(read_at DESC);
`)

// Create FTS5 virtual table for full-text search
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

// Create FTS triggers
db.exec(`
  CREATE TRIGGER IF NOT EXISTS bookmarks_ai AFTER INSERT ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(rowid, id, author, author_name, text, summary)
    VALUES (NEW.rowid, NEW.id, NEW.author, NEW.author_name, NEW.text, NEW.summary);
  END;

  CREATE TRIGGER IF NOT EXISTS bookmarks_ad AFTER DELETE ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(bookmarks_fts, rowid, id, author, author_name, text, summary)
    VALUES('delete', OLD.rowid, OLD.id, OLD.author, OLD.author_name, OLD.text, OLD.summary);
  END;

  CREATE TRIGGER IF NOT EXISTS bookmarks_au AFTER UPDATE ON bookmarks BEGIN
    INSERT INTO bookmarks_fts(bookmarks_fts, rowid, id, author, author_name, text, summary)
    VALUES('delete', OLD.rowid, OLD.id, OLD.author, OLD.author_name, OLD.text, OLD.summary);
    INSERT INTO bookmarks_fts(rowid, id, author, author_name, text, summary)
    VALUES (NEW.rowid, NEW.id, NEW.author, NEW.author_name, NEW.text, NEW.summary);
  END;
`)

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
console.log(`[migrate] Schema ready: ${tables.length} tables`)

db.close()
