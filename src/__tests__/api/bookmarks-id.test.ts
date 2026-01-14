import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, and } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'

/**
 * API Route Tests: /api/bookmarks/[id]
 *
 * Tests GET, PATCH, DELETE operations on individual bookmarks.
 * Verifies multi-user isolation and proper auth checks.
 */

// Test user IDs
const USER_A = 'user-a-123'
const USER_B = 'user-b-456'

// Mock variables that can be changed per test
let mockUserId: string | null = USER_A
let testDb: ReturnType<typeof drizzle<typeof schema>>
let sqlite: Database.Database

// Mock the db module
vi.mock('@/lib/db', () => ({
  get db() {
    return testDb
  },
}))

// Mock auth session
vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
  getSession: vi.fn(() =>
    Promise.resolve(mockUserId ? { userId: mockUserId, username: 'testuser' } : null)
  ),
}))

// Mock sentry metrics
vi.mock('@/lib/sentry', () => ({
  metrics: {
    bookmarkReadToggled: vi.fn(),
    bookmarkTagged: vi.fn(),
  },
}))

// Helper to create the test database
function createTestDatabase() {
  sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')

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
      source TEXT DEFAULT 'sync',
      raw_json TEXT,
      PRIMARY KEY (user_id, id)
    );

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

    CREATE TABLE bookmark_tags (
      user_id TEXT NOT NULL,
      bookmark_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (user_id, bookmark_id, tag)
    );

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

    CREATE TABLE read_status (
      user_id TEXT NOT NULL,
      bookmark_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (user_id, bookmark_id)
    );
  `)

  testDb = drizzle(sqlite, { schema })
}

// Helper to create test bookmark
function createTestBookmark(userId: string, id: string, overrides: Partial<schema.NewBookmark> = {}) {
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

// Helper to create NextRequest
function createRequest(method: string, url: string, body?: object): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('API: /api/bookmarks/[id]', () => {
  beforeEach(() => {
    createTestDatabase()
    mockUserId = USER_A
    vi.clearAllMocks()
  })

  afterEach(() => {
    sqlite.close()
  })

  // =========================================
  // GET /api/bookmarks/[id]
  // =========================================
  describe('GET /api/bookmarks/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { GET } = await import('@/app/api/bookmarks/[id]/route')
      const request = createRequest('GET', '/api/bookmarks/tweet-1')
      const response = await GET(request, { params: Promise.resolve({ id: 'tweet-1' }) })

      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 for non-existent bookmark', async () => {
      const { GET } = await import('@/app/api/bookmarks/[id]/route')
      const request = createRequest('GET', '/api/bookmarks/nonexistent')
      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Bookmark not found')
    })

    it('returns bookmark with all related data', async () => {
      // Seed bookmark with related data
      await testDb.insert(schema.bookmarks).values(createTestBookmark(USER_A, 'tweet-1'))
      await testDb.insert(schema.bookmarkTags).values([
        { userId: USER_A, bookmarkId: 'tweet-1', tag: 'important' },
        { userId: USER_A, bookmarkId: 'tweet-1', tag: 'work' },
      ])
      await testDb.insert(schema.bookmarkMedia).values({
        id: 'tweet-1_media1',
        userId: USER_A,
        bookmarkId: 'tweet-1',
        mediaType: 'photo',
        originalUrl: 'https://pbs.twimg.com/media/test.jpg',
      })
      await testDb.insert(schema.readStatus).values({
        userId: USER_A,
        bookmarkId: 'tweet-1',
        readAt: '2024-01-15T10:00:00Z',
      })

      const { GET } = await import('@/app/api/bookmarks/[id]/route')
      const request = createRequest('GET', '/api/bookmarks/tweet-1')
      const response = await GET(request, { params: Promise.resolve({ id: 'tweet-1' }) })

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.id).toBe('tweet-1')
      expect(data.tags).toEqual(['important', 'work'])
      expect(data.media).toHaveLength(1)
      expect(data.isRead).toBe(true)
      expect(data.readAt).toBe('2024-01-15T10:00:00Z')
    })

    it('does not return another user\'s bookmark', async () => {
      // Seed bookmark for User B
      await testDb.insert(schema.bookmarks).values(createTestBookmark(USER_B, 'tweet-1'))

      // User A tries to access it
      mockUserId = USER_A

      const { GET } = await import('@/app/api/bookmarks/[id]/route')
      const request = createRequest('GET', '/api/bookmarks/tweet-1')
      const response = await GET(request, { params: Promise.resolve({ id: 'tweet-1' }) })

      expect(response.status).toBe(404)
    })
  })

  // =========================================
  // PATCH /api/bookmarks/[id]
  // =========================================
  describe('PATCH /api/bookmarks/[id]', () => {
    beforeEach(async () => {
      await testDb.insert(schema.bookmarks).values(createTestBookmark(USER_A, 'tweet-1'))
    })

    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { PATCH } = await import('@/app/api/bookmarks/[id]/route')
      const request = createRequest('PATCH', '/api/bookmarks/tweet-1', { category: 'github' })
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tweet-1' }) })

      expect(response.status).toBe(401)
    })

    it('updates bookmark category', async () => {
      const { PATCH } = await import('@/app/api/bookmarks/[id]/route')
      const request = createRequest('PATCH', '/api/bookmarks/tweet-1', { category: 'github' })
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tweet-1' }) })

      expect(response.status).toBe(200)

      // Verify in database
      const [updated] = await testDb
        .select()
        .from(schema.bookmarks)
        .where(and(eq(schema.bookmarks.userId, USER_A), eq(schema.bookmarks.id, 'tweet-1')))

      expect(updated.category).toBe('github')
    })

    it('updates bookmark summary', async () => {
      const { PATCH } = await import('@/app/api/bookmarks/[id]/route')
      const request = createRequest('PATCH', '/api/bookmarks/tweet-1', {
        summary: 'This is a test summary',
      })
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tweet-1' }) })

      expect(response.status).toBe(200)

      const [updated] = await testDb
        .select()
        .from(schema.bookmarks)
        .where(and(eq(schema.bookmarks.userId, USER_A), eq(schema.bookmarks.id, 'tweet-1')))

      expect(updated.summary).toBe('This is a test summary')
    })

    it('replaces tags completely', async () => {
      // Add initial tags
      await testDb.insert(schema.bookmarkTags).values([
        { userId: USER_A, bookmarkId: 'tweet-1', tag: 'old1' },
        { userId: USER_A, bookmarkId: 'tweet-1', tag: 'old2' },
      ])

      const { PATCH } = await import('@/app/api/bookmarks/[id]/route')
      const request = createRequest('PATCH', '/api/bookmarks/tweet-1', {
        tags: ['new1', 'new2', 'new3'],
      })
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tweet-1' }) })

      expect(response.status).toBe(200)

      // Verify tags were replaced
      const tags = await testDb
        .select()
        .from(schema.bookmarkTags)
        .where(and(eq(schema.bookmarkTags.userId, USER_A), eq(schema.bookmarkTags.bookmarkId, 'tweet-1')))

      expect(tags).toHaveLength(3)
      expect(tags.map((t) => t.tag).sort()).toEqual(['new1', 'new2', 'new3'])
    })

    it('clears tags when empty array provided', async () => {
      await testDb.insert(schema.bookmarkTags).values([
        { userId: USER_A, bookmarkId: 'tweet-1', tag: 'tag1' },
      ])

      const { PATCH } = await import('@/app/api/bookmarks/[id]/route')
      const request = createRequest('PATCH', '/api/bookmarks/tweet-1', { tags: [] })
      const response = await PATCH(request, { params: Promise.resolve({ id: 'tweet-1' }) })

      expect(response.status).toBe(200)

      const tags = await testDb
        .select()
        .from(schema.bookmarkTags)
        .where(and(eq(schema.bookmarkTags.userId, USER_A), eq(schema.bookmarkTags.bookmarkId, 'tweet-1')))

      expect(tags).toHaveLength(0)
    })

    it('does not update another user\'s bookmark tags', async () => {
      // User B's bookmark
      await testDb.insert(schema.bookmarks).values(createTestBookmark(USER_B, 'tweet-b'))
      await testDb.insert(schema.bookmarkTags).values({
        userId: USER_B,
        bookmarkId: 'tweet-b',
        tag: 'original',
      })

      // User A tries to update it (should only affect User A's non-existent bookmark)
      mockUserId = USER_A
      const { PATCH } = await import('@/app/api/bookmarks/[id]/route')
      const request = createRequest('PATCH', '/api/bookmarks/tweet-b', { tags: ['hacked'] })
      await PATCH(request, { params: Promise.resolve({ id: 'tweet-b' }) })

      // User B's tags should be unchanged
      const userBTags = await testDb
        .select()
        .from(schema.bookmarkTags)
        .where(eq(schema.bookmarkTags.userId, USER_B))

      expect(userBTags).toHaveLength(1)
      expect(userBTags[0].tag).toBe('original')
    })
  })

  // =========================================
  // DELETE /api/bookmarks/[id]
  // =========================================
  describe('DELETE /api/bookmarks/[id]', () => {
    beforeEach(async () => {
      // Create bookmark with all related data
      await testDb.insert(schema.bookmarks).values(createTestBookmark(USER_A, 'tweet-1'))
      await testDb.insert(schema.bookmarkTags).values({
        userId: USER_A,
        bookmarkId: 'tweet-1',
        tag: 'test',
      })
      await testDb.insert(schema.bookmarkMedia).values({
        id: 'tweet-1_media',
        userId: USER_A,
        bookmarkId: 'tweet-1',
        mediaType: 'photo',
        originalUrl: 'https://example.com/photo.jpg',
      })
      await testDb.insert(schema.bookmarkLinks).values({
        userId: USER_A,
        bookmarkId: 'tweet-1',
        expandedUrl: 'https://example.com',
      })
      await testDb.insert(schema.readStatus).values({
        userId: USER_A,
        bookmarkId: 'tweet-1',
        readAt: new Date().toISOString(),
      })
    })

    it('returns 401 when not authenticated', async () => {
      mockUserId = null

      const { DELETE } = await import('@/app/api/bookmarks/[id]/route')
      const request = createRequest('DELETE', '/api/bookmarks/tweet-1')
      const response = await DELETE(request, { params: Promise.resolve({ id: 'tweet-1' }) })

      expect(response.status).toBe(401)
    })

    it('deletes bookmark and all related data', async () => {
      const { DELETE } = await import('@/app/api/bookmarks/[id]/route')
      const request = createRequest('DELETE', '/api/bookmarks/tweet-1')
      const response = await DELETE(request, { params: Promise.resolve({ id: 'tweet-1' }) })

      expect(response.status).toBe(200)

      // Verify all data is deleted
      const bookmarkResult = await testDb
        .select()
        .from(schema.bookmarks)
        .where(and(eq(schema.bookmarks.userId, USER_A), eq(schema.bookmarks.id, 'tweet-1')))
      const tagsResult = await testDb
        .select()
        .from(schema.bookmarkTags)
        .where(and(eq(schema.bookmarkTags.userId, USER_A), eq(schema.bookmarkTags.bookmarkId, 'tweet-1')))
      const mediaResult = await testDb
        .select()
        .from(schema.bookmarkMedia)
        .where(and(eq(schema.bookmarkMedia.userId, USER_A), eq(schema.bookmarkMedia.bookmarkId, 'tweet-1')))
      const linksResult = await testDb
        .select()
        .from(schema.bookmarkLinks)
        .where(and(eq(schema.bookmarkLinks.userId, USER_A), eq(schema.bookmarkLinks.bookmarkId, 'tweet-1')))
      const readResult = await testDb
        .select()
        .from(schema.readStatus)
        .where(and(eq(schema.readStatus.userId, USER_A), eq(schema.readStatus.bookmarkId, 'tweet-1')))

      expect(bookmarkResult).toHaveLength(0)
      expect(tagsResult).toHaveLength(0)
      expect(mediaResult).toHaveLength(0)
      expect(linksResult).toHaveLength(0)
      expect(readResult).toHaveLength(0)
    })

    it('does not delete another user\'s bookmark', async () => {
      // Create User B's bookmark
      await testDb.insert(schema.bookmarks).values(createTestBookmark(USER_B, 'tweet-b'))

      // User A tries to delete it
      mockUserId = USER_A
      const { DELETE } = await import('@/app/api/bookmarks/[id]/route')
      const request = createRequest('DELETE', '/api/bookmarks/tweet-b')
      await DELETE(request, { params: Promise.resolve({ id: 'tweet-b' }) })

      // User B's bookmark should still exist
      const userBBookmarks = await testDb
        .select()
        .from(schema.bookmarks)
        .where(eq(schema.bookmarks.userId, USER_B))

      expect(userBBookmarks).toHaveLength(1)
    })
  })
})
