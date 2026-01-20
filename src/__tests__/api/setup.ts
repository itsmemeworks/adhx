import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '@/lib/db/schema'

/**
 * Shared test database setup for API tests.
 *
 * Creates an in-memory SQLite database with the complete schema.
 * All API tests should use this to ensure consistent table structure.
 */

export const FULL_SCHEMA_SQL = `
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
    source TEXT DEFAULT 'sync',
    raw_json TEXT,
    PRIMARY KEY (user_id, id)
  );
  CREATE INDEX bookmarks_user_id_idx ON bookmarks(user_id);
  CREATE INDEX bookmarks_processed_at_idx ON bookmarks(processed_at);
  CREATE INDEX bookmarks_user_processed_at_idx ON bookmarks(user_id, processed_at);
  CREATE INDEX bookmarks_user_category_idx ON bookmarks(user_id, category);
  CREATE INDEX bookmarks_user_quoted_tweet_idx ON bookmarks(user_id, quoted_tweet_id);

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

  CREATE TABLE bookmark_tags (
    user_id TEXT NOT NULL,
    bookmark_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (user_id, bookmark_id, tag)
  );
  CREATE INDEX bookmark_tags_user_id_idx ON bookmark_tags(user_id);

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

  CREATE TABLE read_status (
    user_id TEXT NOT NULL,
    bookmark_id TEXT NOT NULL,
    read_at TEXT NOT NULL,
    PRIMARY KEY (user_id, bookmark_id)
  );
  CREATE INDEX read_status_user_id_idx ON read_status(user_id);

  CREATE TABLE user_preferences (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    updated_at TEXT,
    PRIMARY KEY (user_id, key)
  );

  CREATE TABLE sync_state (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    updated_at TEXT,
    PRIMARY KEY (user_id, key)
  );

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

  CREATE TABLE oauth_state (
    state TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    created_at TEXT
  );

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

  CREATE TABLE collection_tweets (
    user_id TEXT NOT NULL,
    collection_id TEXT NOT NULL,
    bookmark_id TEXT NOT NULL,
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    PRIMARY KEY (user_id, collection_id, bookmark_id)
  );

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

  CREATE TABLE user_gamification (
    user_id TEXT PRIMARY KEY,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_active_date TEXT,
    total_xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    lifetime_read INTEGER DEFAULT 0,
    lifetime_bookmarked INTEGER DEFAULT 0,
    lifetime_tagged INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
  );

  CREATE TABLE user_achievements (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    unlocked_at TEXT DEFAULT CURRENT_TIMESTAMP,
    progress INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, achievement_id)
  );
  CREATE INDEX user_achievements_user_id_idx ON user_achievements(user_id);

  CREATE TABLE user_profiles (
    user_id TEXT PRIMARY KEY,
    display_name TEXT,
    bio TEXT,
    is_public INTEGER DEFAULT 0,
    show_stats INTEGER DEFAULT 1,
    show_achievements INTEGER DEFAULT 1,
    featured_collection_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
  );

  CREATE TABLE user_follows (
    follower_id TEXT NOT NULL,
    following_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id)
  );
  CREATE INDEX user_follows_follower_idx ON user_follows(follower_id);
  CREATE INDEX user_follows_following_idx ON user_follows(following_id);
`

export interface TestDbInstance {
  db: ReturnType<typeof drizzle<typeof schema>>
  sqlite: Database.Database
  close: () => void
}

/**
 * Creates a test database with the full schema.
 */
export function createTestDb(): TestDbInstance {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(FULL_SCHEMA_SQL)

  const db = drizzle(sqlite, { schema })

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  }
}

/**
 * Test user IDs
 */
export const USER_A = 'user-a-123'
export const USER_B = 'user-b-456'

/**
 * Create a test bookmark with required fields
 */
export function createTestBookmark(
  userId: string,
  id: string,
  overrides: Partial<schema.NewBookmark> = {}
): schema.NewBookmark {
  return {
    id,
    userId,
    author: 'testauthor',
    authorName: 'Test Author',
    text: `Test content for ${id}`,
    tweetUrl: `https://twitter.com/testauthor/status/${id}`,
    processedAt: new Date().toISOString(),
    category: 'tweet',
    ...overrides,
  }
}
