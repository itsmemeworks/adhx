import { vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from '@/lib/db/schema'

/**
 * API Test Utilities
 *
 * Provides helpers for testing Next.js API routes with:
 * - In-memory SQLite database
 * - Mocked session/auth
 * - NextRequest/NextResponse helpers
 */

// Store the test database instance for module mocking
let testDbInstance: BetterSQLite3Database<typeof schema> | null = null

/**
 * Creates an in-memory SQLite database for API testing.
 */
export function createTestDatabase(): BetterSQLite3Database<typeof schema> & { close: () => void } {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')

  // Create all tables
  sqlite.exec(`
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
  `)

  const db = drizzle(sqlite, { schema })
  testDbInstance = db

  return Object.assign(db, {
    close: () => {
      sqlite.close()
      testDbInstance = null
    },
  })
}

/**
 * Get the current test database instance (for module mocking)
 */
export function getTestDb() {
  return testDbInstance
}

/**
 * Set up mocks for API route testing.
 * Call this in beforeEach().
 */
export function setupApiMocks(options: { userId?: string | null } = {}) {
  const userId = options.userId ?? 'test-user-123'

  // Mock the session module
  vi.doMock('@/lib/auth/session', () => ({
    getCurrentUserId: vi.fn().mockResolvedValue(userId),
    getSession: vi.fn().mockResolvedValue(
      userId ? { userId, username: 'testuser' } : null
    ),
    requireAuth: vi.fn().mockImplementation(async () => {
      if (!userId) throw new Error('Unauthorized')
      return userId
    }),
  }))

  // Mock the sentry metrics (no-op)
  vi.doMock('@/lib/sentry', () => ({
    metrics: {
      bookmarkReadToggled: vi.fn(),
      bookmarkTagged: vi.fn(),
      bookmarkSynced: vi.fn(),
      syncCompleted: vi.fn(),
    },
  }))
}

/**
 * Creates a NextRequest object for testing.
 */
export function createRequest(
  method: string,
  url: string,
  options: {
    body?: object
    headers?: Record<string, string>
  } = {}
): NextRequest {
  const { body, headers = {} } = options
  const shouldIncludeBody = body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: shouldIncludeBody ? JSON.stringify(body) : undefined,
  })
}

/**
 * Parse JSON response from NextResponse
 */
export async function parseResponse<T = unknown>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

/**
 * Test bookmark factory
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

/**
 * Seed test data into the database
 */
export async function seedTestData(
  db: BetterSQLite3Database<typeof schema>,
  userId: string,
  count: number = 3
) {
  const bookmarkData = Array.from({ length: count }, (_, i) =>
    createTestBookmark(userId, `tweet-${i + 1}`, {
      text: `Test tweet number ${i + 1}`,
      category: i % 2 === 0 ? 'tweet' : 'github',
    })
  )

  await db.insert(schema.bookmarks).values(bookmarkData)
  return bookmarkData
}
