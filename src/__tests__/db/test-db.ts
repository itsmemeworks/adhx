import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '@/lib/db/schema'

/**
 * Creates an in-memory SQLite database for testing.
 * Each test gets a fresh database instance.
 */
export function createTestDb(): BetterSQLite3Database<typeof schema> & { close: () => void } {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')

  // Create all tables manually (in-memory DB starts empty)
  sqlite.exec(`
    -- Bookmarks table with composite PK
    CREATE TABLE bookmarks (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      author TEXT NOT NULL,
      author_name TEXT,
      author_profile_image_url TEXT,
      text TEXT NOT NULL,
      tweet_url TEXT NOT NULL,
      created_at TEXT,
      processed_at TEXT NOT NULL,
      category TEXT DEFAULT 'tweet',
      is_reply INTEGER DEFAULT 0,
      reply_context TEXT,
      is_quote INTEGER DEFAULT 0,
      quote_context TEXT,
      quoted_tweet_id TEXT,
      is_retweet INTEGER DEFAULT 0,
      retweet_context TEXT,
      extracted_content TEXT,
      filed_path TEXT,
      needs_transcript INTEGER DEFAULT 0,
      summary TEXT,
      raw_json TEXT,
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX bookmarks_user_id_idx ON bookmarks(user_id);
    CREATE INDEX bookmarks_processed_at_idx ON bookmarks(processed_at);

    -- Bookmark links
    CREATE TABLE bookmark_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      bookmark_id TEXT NOT NULL,
      original_url TEXT,
      expanded_url TEXT NOT NULL,
      link_type TEXT,
      domain TEXT,
      content_json TEXT,
      preview_title TEXT,
      preview_description TEXT,
      preview_image_url TEXT
    );
    CREATE INDEX bookmark_links_user_bookmark_idx ON bookmark_links(user_id, bookmark_id);

    -- Bookmark tags with composite PK
    CREATE TABLE bookmark_tags (
      user_id TEXT NOT NULL,
      bookmark_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (user_id, bookmark_id, tag)
    );
    CREATE INDEX bookmark_tags_user_id_idx ON bookmark_tags(user_id);

    -- Bookmark media with composite PK
    CREATE TABLE bookmark_media (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      bookmark_id TEXT NOT NULL,
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
      alt_text TEXT,
      PRIMARY KEY (user_id, id)
    );
    CREATE INDEX bookmark_media_user_bookmark_idx ON bookmark_media(user_id, bookmark_id);

    -- Read status with composite PK
    CREATE TABLE read_status (
      user_id TEXT NOT NULL,
      bookmark_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (user_id, bookmark_id)
    );

    -- User preferences with composite PK
    CREATE TABLE user_preferences (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      updated_at TEXT,
      PRIMARY KEY (user_id, key)
    );

    -- Sync state with composite PK
    CREATE TABLE sync_state (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      updated_at TEXT,
      PRIMARY KEY (user_id, key)
    );

    -- OAuth tokens
    CREATE TABLE oauth_tokens (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      profile_image_url TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      scopes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    -- Collections
    CREATE TABLE collections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      icon TEXT,
      share_code TEXT UNIQUE,
      is_public INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT
    );
    CREATE INDEX collections_user_id_idx ON collections(user_id);

    -- Collection tweets with composite PK
    CREATE TABLE collection_tweets (
      user_id TEXT NOT NULL,
      collection_id TEXT NOT NULL,
      bookmark_id TEXT NOT NULL,
      added_at TEXT DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      PRIMARY KEY (user_id, collection_id, bookmark_id)
    );

    -- Sync logs
    CREATE TABLE sync_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      total_fetched INTEGER DEFAULT 0,
      new_bookmarks INTEGER DEFAULT 0,
      duplicates_skipped INTEGER DEFAULT 0,
      categorized INTEGER DEFAULT 0,
      error_message TEXT,
      trigger_type TEXT
    );
    CREATE INDEX sync_logs_user_id_idx ON sync_logs(user_id);
  `)

  const db = drizzle(sqlite, { schema })

  // Add close method for cleanup
  return Object.assign(db, {
    close: () => sqlite.close(),
  })
}

/**
 * Creates a test bookmark with default values.
 * Override any field by passing partial data.
 */
export function createTestBookmark(
  userId: string,
  id: string,
  overrides: Partial<schema.NewBookmark> = {}
): schema.NewBookmark {
  return {
    id,
    userId,
    author: overrides.author ?? 'testauthor',
    authorName: overrides.authorName ?? 'Test Author',
    text: overrides.text ?? `Test tweet content for ${id}`,
    tweetUrl: overrides.tweetUrl ?? `https://twitter.com/testauthor/status/${id}`,
    processedAt: overrides.processedAt ?? new Date().toISOString(),
    category: overrides.category ?? 'tweet',
    ...overrides,
  }
}
