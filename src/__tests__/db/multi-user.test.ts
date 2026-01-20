import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq, and } from 'drizzle-orm'
import { createTestDb, createTestBookmark } from './test-db'
import {
  bookmarks,
  bookmarkTags,
  bookmarkMedia,
  bookmarkLinks,
  readStatus,
  userPreferences,
} from '@/lib/db/schema'

/**
 * Multi-User Database Integration Tests
 *
 * These tests verify that the composite primary key schema correctly
 * isolates data between users. Each user should only see their own:
 * - Bookmarks
 * - Read status
 * - Tags
 * - Media
 * - Links
 * - Preferences
 */

describe('Multi-User Database Isolation', () => {
  let db: ReturnType<typeof createTestDb>

  // Test users
  const USER_A = 'user-a-123'
  const USER_B = 'user-b-456'

  // Shared tweet ID (both users bookmark the same tweet)
  const SHARED_TWEET_ID = 'tweet-shared-789'

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  // =========================================
  // Bookmark Isolation Tests
  // =========================================
  describe('Bookmark Isolation', () => {
    it('allows User A and User B to both bookmark the same tweet', async () => {
      // User A bookmarks tweet X
      await db.insert(bookmarks).values(
        createTestBookmark(USER_A, SHARED_TWEET_ID, { text: 'User A sees this' })
      )

      // User B bookmarks the same tweet X
      await db.insert(bookmarks).values(
        createTestBookmark(USER_B, SHARED_TWEET_ID, { text: 'User B sees this' })
      )

      // Each user should have exactly 1 bookmark
      const userABookmarks = await db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.userId, USER_A))

      const userBBookmarks = await db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.userId, USER_B))

      expect(userABookmarks).toHaveLength(1)
      expect(userBBookmarks).toHaveLength(1)

      // Each user sees their own version
      expect(userABookmarks[0].text).toBe('User A sees this')
      expect(userBBookmarks[0].text).toBe('User B sees this')
    })

    it('prevents duplicate bookmarks for the same user', async () => {
      await db.insert(bookmarks).values(createTestBookmark(USER_A, 'tweet-1'))

      // Attempting to insert the same bookmark again should fail
      await expect(
        db.insert(bookmarks).values(createTestBookmark(USER_A, 'tweet-1'))
      ).rejects.toThrow()
    })

    it('isolates bookmark queries by user', async () => {
      // Insert bookmarks for both users
      await db.insert(bookmarks).values([
        createTestBookmark(USER_A, 'tweet-1'),
        createTestBookmark(USER_A, 'tweet-2'),
        createTestBookmark(USER_B, 'tweet-3'),
        createTestBookmark(USER_B, 'tweet-4'),
        createTestBookmark(USER_B, 'tweet-5'),
      ])

      const userABookmarks = await db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.userId, USER_A))

      const userBBookmarks = await db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.userId, USER_B))

      expect(userABookmarks).toHaveLength(2)
      expect(userBBookmarks).toHaveLength(3)
    })

    it('requires composite key for bookmark lookup', async () => {
      await db.insert(bookmarks).values([
        createTestBookmark(USER_A, SHARED_TWEET_ID, { text: 'A version' }),
        createTestBookmark(USER_B, SHARED_TWEET_ID, { text: 'B version' }),
      ])

      // Query with both userId AND id
      const [userABookmark] = await db
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, USER_A), eq(bookmarks.id, SHARED_TWEET_ID)))

      const [userBBookmark] = await db
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, USER_B), eq(bookmarks.id, SHARED_TWEET_ID)))

      expect(userABookmark.text).toBe('A version')
      expect(userBBookmark.text).toBe('B version')
    })
  })

  // =========================================
  // Read Status Isolation Tests
  // =========================================
  describe('Read Status Isolation', () => {
    beforeEach(async () => {
      // Set up bookmarks for both users
      await db.insert(bookmarks).values([
        createTestBookmark(USER_A, SHARED_TWEET_ID),
        createTestBookmark(USER_B, SHARED_TWEET_ID),
      ])
    })

    it('isolates read status between users', async () => {
      const now = new Date().toISOString()

      // User A marks tweet as read
      await db.insert(readStatus).values({
        userId: USER_A,
        bookmarkId: SHARED_TWEET_ID,
        readAt: now,
      })

      // User A's read status exists
      const userAStatus = await db
        .select()
        .from(readStatus)
        .where(and(eq(readStatus.userId, USER_A), eq(readStatus.bookmarkId, SHARED_TWEET_ID)))

      // User B has no read status
      const userBStatus = await db
        .select()
        .from(readStatus)
        .where(and(eq(readStatus.userId, USER_B), eq(readStatus.bookmarkId, SHARED_TWEET_ID)))

      expect(userAStatus).toHaveLength(1)
      expect(userBStatus).toHaveLength(0)
    })

    it('allows both users to have independent read status', async () => {
      const nowA = '2024-01-15T10:00:00Z'
      const nowB = '2024-01-15T12:00:00Z'

      await db.insert(readStatus).values([
        { userId: USER_A, bookmarkId: SHARED_TWEET_ID, readAt: nowA },
        { userId: USER_B, bookmarkId: SHARED_TWEET_ID, readAt: nowB },
      ])

      const [userAStatus] = await db
        .select()
        .from(readStatus)
        .where(and(eq(readStatus.userId, USER_A), eq(readStatus.bookmarkId, SHARED_TWEET_ID)))

      const [userBStatus] = await db
        .select()
        .from(readStatus)
        .where(and(eq(readStatus.userId, USER_B), eq(readStatus.bookmarkId, SHARED_TWEET_ID)))

      expect(userAStatus.readAt).toBe(nowA)
      expect(userBStatus.readAt).toBe(nowB)
    })

    it('correctly counts unread bookmarks per user', async () => {
      // Add more bookmarks
      await db.insert(bookmarks).values([
        createTestBookmark(USER_A, 'tweet-a-1'),
        createTestBookmark(USER_A, 'tweet-a-2'),
        createTestBookmark(USER_B, 'tweet-b-1'),
      ])

      // User A reads 2 tweets (shared + a-1)
      await db.insert(readStatus).values([
        { userId: USER_A, bookmarkId: SHARED_TWEET_ID, readAt: new Date().toISOString() },
        { userId: USER_A, bookmarkId: 'tweet-a-1', readAt: new Date().toISOString() },
      ])

      // Count read for User A (should be 2)
      const userAReadCount = await db.select().from(readStatus).where(eq(readStatus.userId, USER_A))

      // Count read for User B (should be 0)
      const userBReadCount = await db.select().from(readStatus).where(eq(readStatus.userId, USER_B))

      expect(userAReadCount).toHaveLength(2)
      expect(userBReadCount).toHaveLength(0)
    })
  })

  // =========================================
  // Tag Isolation Tests
  // =========================================
  describe('Tag Isolation', () => {
    beforeEach(async () => {
      await db.insert(bookmarks).values([
        createTestBookmark(USER_A, SHARED_TWEET_ID),
        createTestBookmark(USER_B, SHARED_TWEET_ID),
      ])
    })

    it('isolates tags between users', async () => {
      // User A adds tag 'important'
      await db.insert(bookmarkTags).values({
        userId: USER_A,
        bookmarkId: SHARED_TWEET_ID,
        tag: 'important',
      })

      // User B adds tag 'later'
      await db.insert(bookmarkTags).values({
        userId: USER_B,
        bookmarkId: SHARED_TWEET_ID,
        tag: 'later',
      })

      const userATags = await db.select().from(bookmarkTags).where(eq(bookmarkTags.userId, USER_A))

      const userBTags = await db.select().from(bookmarkTags).where(eq(bookmarkTags.userId, USER_B))

      expect(userATags).toHaveLength(1)
      expect(userATags[0].tag).toBe('important')

      expect(userBTags).toHaveLength(1)
      expect(userBTags[0].tag).toBe('later')
    })

    it('allows same tag on same tweet for different users', async () => {
      // Both users tag the same tweet with 'work'
      await db.insert(bookmarkTags).values([
        { userId: USER_A, bookmarkId: SHARED_TWEET_ID, tag: 'work' },
        { userId: USER_B, bookmarkId: SHARED_TWEET_ID, tag: 'work' },
      ])

      const allWorkTags = await db
        .select()
        .from(bookmarkTags)
        .where(eq(bookmarkTags.tag, 'work'))

      expect(allWorkTags).toHaveLength(2)
    })

    it('prevents duplicate tags for same user on same bookmark', async () => {
      await db.insert(bookmarkTags).values({
        userId: USER_A,
        bookmarkId: SHARED_TWEET_ID,
        tag: 'duplicate',
      })

      // Should fail due to composite PK constraint
      await expect(
        db.insert(bookmarkTags).values({
          userId: USER_A,
          bookmarkId: SHARED_TWEET_ID,
          tag: 'duplicate',
        })
      ).rejects.toThrow()
    })

    it('supports multiple tags per bookmark per user', async () => {
      await db.insert(bookmarkTags).values([
        { userId: USER_A, bookmarkId: SHARED_TWEET_ID, tag: 'tag1' },
        { userId: USER_A, bookmarkId: SHARED_TWEET_ID, tag: 'tag2' },
        { userId: USER_A, bookmarkId: SHARED_TWEET_ID, tag: 'tag3' },
      ])

      const tags = await db
        .select()
        .from(bookmarkTags)
        .where(and(eq(bookmarkTags.userId, USER_A), eq(bookmarkTags.bookmarkId, SHARED_TWEET_ID)))

      expect(tags).toHaveLength(3)
    })
  })

  // =========================================
  // Media Isolation Tests
  // =========================================
  describe('Media Isolation', () => {
    beforeEach(async () => {
      await db.insert(bookmarks).values([
        createTestBookmark(USER_A, SHARED_TWEET_ID),
        createTestBookmark(USER_B, SHARED_TWEET_ID),
      ])
    })

    it('isolates media records between users', async () => {
      const mediaId = `${SHARED_TWEET_ID}_media1`

      // Both users have the same media for the same tweet
      await db.insert(bookmarkMedia).values([
        {
          id: mediaId,
          userId: USER_A,
          bookmarkId: SHARED_TWEET_ID,
          mediaType: 'photo',
          originalUrl: 'https://pbs.twimg.com/media/a.jpg',
        },
        {
          id: mediaId,
          userId: USER_B,
          bookmarkId: SHARED_TWEET_ID,
          mediaType: 'photo',
          originalUrl: 'https://pbs.twimg.com/media/a.jpg',
        },
      ])

      const userAMedia = await db
        .select()
        .from(bookmarkMedia)
        .where(eq(bookmarkMedia.userId, USER_A))

      const userBMedia = await db
        .select()
        .from(bookmarkMedia)
        .where(eq(bookmarkMedia.userId, USER_B))

      expect(userAMedia).toHaveLength(1)
      expect(userBMedia).toHaveLength(1)
    })

    it('counts media only for specific user', async () => {
      // User A has 3 media items
      await db.insert(bookmarkMedia).values([
        {
          id: 'media-a-1',
          userId: USER_A,
          bookmarkId: SHARED_TWEET_ID,
          mediaType: 'photo',
          originalUrl: 'https://example.com/1.jpg',
        },
        {
          id: 'media-a-2',
          userId: USER_A,
          bookmarkId: SHARED_TWEET_ID,
          mediaType: 'photo',
          originalUrl: 'https://example.com/2.jpg',
        },
        {
          id: 'media-a-3',
          userId: USER_A,
          bookmarkId: SHARED_TWEET_ID,
          mediaType: 'video',
          originalUrl: 'https://example.com/3.mp4',
        },
      ])

      // User B has 1 media item
      await db.insert(bookmarkMedia).values({
        id: 'media-b-1',
        userId: USER_B,
        bookmarkId: SHARED_TWEET_ID,
        mediaType: 'photo',
        originalUrl: 'https://example.com/b1.jpg',
      })

      const userAMediaCount = await db
        .select()
        .from(bookmarkMedia)
        .where(eq(bookmarkMedia.userId, USER_A))

      const userBMediaCount = await db
        .select()
        .from(bookmarkMedia)
        .where(eq(bookmarkMedia.userId, USER_B))

      expect(userAMediaCount).toHaveLength(3)
      expect(userBMediaCount).toHaveLength(1)
    })

    it('prevents duplicate media for the same user (without onConflictDoNothing)', async () => {
      const mediaId = `${SHARED_TWEET_ID}_photo_0`

      // First insert succeeds
      await db.insert(bookmarkMedia).values({
        id: mediaId,
        userId: USER_A,
        bookmarkId: SHARED_TWEET_ID,
        mediaType: 'photo',
        originalUrl: 'https://example.com/photo.jpg',
      })

      // Second insert with same (userId, id) should fail
      await expect(
        db.insert(bookmarkMedia).values({
          id: mediaId,
          userId: USER_A,
          bookmarkId: SHARED_TWEET_ID,
          mediaType: 'photo',
          originalUrl: 'https://example.com/photo.jpg',
        })
      ).rejects.toThrow(/UNIQUE constraint failed/)
    })

    it('handles duplicate media gracefully with onConflictDoNothing', async () => {
      const mediaId = `${SHARED_TWEET_ID}_photo_0`

      // First insert
      await db.insert(bookmarkMedia).values({
        id: mediaId,
        userId: USER_A,
        bookmarkId: SHARED_TWEET_ID,
        mediaType: 'photo',
        originalUrl: 'https://example.com/photo.jpg',
      })

      // Second insert with onConflictDoNothing should NOT throw
      await db.insert(bookmarkMedia).values({
        id: mediaId,
        userId: USER_A,
        bookmarkId: SHARED_TWEET_ID,
        mediaType: 'photo',
        originalUrl: 'https://example.com/photo.jpg',
      }).onConflictDoNothing()

      // Should still have only 1 media record
      const media = await db
        .select()
        .from(bookmarkMedia)
        .where(and(eq(bookmarkMedia.userId, USER_A), eq(bookmarkMedia.id, mediaId)))

      expect(media).toHaveLength(1)
    })

    it('allows same media ID for different users with onConflictDoNothing', async () => {
      const mediaId = `${SHARED_TWEET_ID}_photo_0`

      // User A inserts media
      await db.insert(bookmarkMedia).values({
        id: mediaId,
        userId: USER_A,
        bookmarkId: SHARED_TWEET_ID,
        mediaType: 'photo',
        originalUrl: 'https://example.com/photo.jpg',
      }).onConflictDoNothing()

      // User B inserts same media ID (different composite key)
      await db.insert(bookmarkMedia).values({
        id: mediaId,
        userId: USER_B,
        bookmarkId: SHARED_TWEET_ID,
        mediaType: 'photo',
        originalUrl: 'https://example.com/photo.jpg',
      }).onConflictDoNothing()

      // User A inserts again (should no-op)
      await db.insert(bookmarkMedia).values({
        id: mediaId,
        userId: USER_A,
        bookmarkId: SHARED_TWEET_ID,
        mediaType: 'photo',
        originalUrl: 'https://example.com/photo.jpg',
      }).onConflictDoNothing()

      // Each user should have exactly 1 media record
      const userAMedia = await db
        .select()
        .from(bookmarkMedia)
        .where(eq(bookmarkMedia.userId, USER_A))

      const userBMedia = await db
        .select()
        .from(bookmarkMedia)
        .where(eq(bookmarkMedia.userId, USER_B))

      expect(userAMedia).toHaveLength(1)
      expect(userBMedia).toHaveLength(1)
    })
  })

  // =========================================
  // Concurrent Sync Simulation Tests
  // =========================================
  describe('Concurrent Sync Handling', () => {
    const QUOTE_TWEET_ID = 'quote-tweet-123'
    const QUOTED_TWEET_ID = 'quoted-tweet-456'

    beforeEach(async () => {
      // Set up a quote tweet scenario
      await db.insert(bookmarks).values([
        createTestBookmark(USER_A, QUOTE_TWEET_ID, {
          isQuote: true,
          quotedTweetId: QUOTED_TWEET_ID,
        }),
      ])
    })

    it('handles concurrent media inserts for quoted tweets safely', async () => {
      // Insert the quoted tweet bookmark
      await db.insert(bookmarks).values(
        createTestBookmark(USER_A, QUOTED_TWEET_ID)
      ).onConflictDoNothing()

      // Simulate two concurrent sync processes trying to insert the same media
      // This is what happens when user double-clicks sync button
      const mediaInserts = [
        db.insert(bookmarkMedia).values({
          id: `${QUOTED_TWEET_ID}_photo_0`,
          userId: USER_A,
          bookmarkId: QUOTED_TWEET_ID,
          mediaType: 'photo',
          originalUrl: 'https://example.com/quoted-photo.jpg',
          width: 800,
          height: 600,
        }).onConflictDoNothing(),
        db.insert(bookmarkMedia).values({
          id: `${QUOTED_TWEET_ID}_photo_0`,
          userId: USER_A,
          bookmarkId: QUOTED_TWEET_ID,
          mediaType: 'photo',
          originalUrl: 'https://example.com/quoted-photo.jpg',
          width: 800,
          height: 600,
        }).onConflictDoNothing(),
      ]

      // Both should complete without error
      await Promise.all(mediaInserts)

      // Only one media record should exist
      const media = await db
        .select()
        .from(bookmarkMedia)
        .where(and(
          eq(bookmarkMedia.userId, USER_A),
          eq(bookmarkMedia.bookmarkId, QUOTED_TWEET_ID)
        ))

      expect(media).toHaveLength(1)
      expect(media[0].id).toBe(`${QUOTED_TWEET_ID}_photo_0`)
    })

    it('handles concurrent video media inserts safely', async () => {
      await db.insert(bookmarks).values(
        createTestBookmark(USER_A, QUOTED_TWEET_ID)
      ).onConflictDoNothing()

      // Simulate concurrent video media inserts
      const videoInserts = [
        db.insert(bookmarkMedia).values({
          id: `${QUOTED_TWEET_ID}_video_0`,
          userId: USER_A,
          bookmarkId: QUOTED_TWEET_ID,
          mediaType: 'video',
          originalUrl: 'https://example.com/video.mp4',
          previewUrl: 'https://example.com/thumb.jpg',
          width: 1920,
          height: 1080,
          durationMs: 30000,
        }).onConflictDoNothing(),
        db.insert(bookmarkMedia).values({
          id: `${QUOTED_TWEET_ID}_video_0`,
          userId: USER_A,
          bookmarkId: QUOTED_TWEET_ID,
          mediaType: 'video',
          originalUrl: 'https://example.com/video.mp4',
          previewUrl: 'https://example.com/thumb.jpg',
          width: 1920,
          height: 1080,
          durationMs: 30000,
        }).onConflictDoNothing(),
      ]

      await Promise.all(videoInserts)

      const media = await db
        .select()
        .from(bookmarkMedia)
        .where(and(
          eq(bookmarkMedia.userId, USER_A),
          eq(bookmarkMedia.bookmarkId, QUOTED_TWEET_ID)
        ))

      expect(media).toHaveLength(1)
      expect(media[0].mediaType).toBe('video')
    })

    it('handles mixed photo and video concurrent inserts', async () => {
      await db.insert(bookmarks).values(
        createTestBookmark(USER_A, QUOTED_TWEET_ID)
      ).onConflictDoNothing()

      // Simulate a tweet with multiple media items being processed concurrently
      const mediaInserts = [
        // First sync process inserts photo
        db.insert(bookmarkMedia).values({
          id: `${QUOTED_TWEET_ID}_photo_0`,
          userId: USER_A,
          bookmarkId: QUOTED_TWEET_ID,
          mediaType: 'photo',
          originalUrl: 'https://example.com/photo1.jpg',
        }).onConflictDoNothing(),
        // Second sync process tries same photo
        db.insert(bookmarkMedia).values({
          id: `${QUOTED_TWEET_ID}_photo_0`,
          userId: USER_A,
          bookmarkId: QUOTED_TWEET_ID,
          mediaType: 'photo',
          originalUrl: 'https://example.com/photo1.jpg',
        }).onConflictDoNothing(),
        // First sync also inserts video
        db.insert(bookmarkMedia).values({
          id: `${QUOTED_TWEET_ID}_video_0`,
          userId: USER_A,
          bookmarkId: QUOTED_TWEET_ID,
          mediaType: 'video',
          originalUrl: 'https://example.com/video.mp4',
        }).onConflictDoNothing(),
        // Second sync tries same video
        db.insert(bookmarkMedia).values({
          id: `${QUOTED_TWEET_ID}_video_0`,
          userId: USER_A,
          bookmarkId: QUOTED_TWEET_ID,
          mediaType: 'video',
          originalUrl: 'https://example.com/video.mp4',
        }).onConflictDoNothing(),
      ]

      await Promise.all(mediaInserts)

      const media = await db
        .select()
        .from(bookmarkMedia)
        .where(and(
          eq(bookmarkMedia.userId, USER_A),
          eq(bookmarkMedia.bookmarkId, QUOTED_TWEET_ID)
        ))

      // Should have exactly 2 media items (1 photo, 1 video)
      expect(media).toHaveLength(2)
      expect(media.map(m => m.mediaType).sort()).toEqual(['photo', 'video'])
    })

    it('isolates concurrent inserts between users', async () => {
      // Both users bookmark a tweet that quotes the same tweet
      await db.insert(bookmarks).values([
        createTestBookmark(USER_A, QUOTED_TWEET_ID),
        createTestBookmark(USER_B, QUOTED_TWEET_ID),
      ]).onConflictDoNothing()

      // Simulate both users syncing at the same time
      const concurrentInserts = [
        // User A's sync
        db.insert(bookmarkMedia).values({
          id: `${QUOTED_TWEET_ID}_photo_0`,
          userId: USER_A,
          bookmarkId: QUOTED_TWEET_ID,
          mediaType: 'photo',
          originalUrl: 'https://example.com/photo.jpg',
        }).onConflictDoNothing(),
        // User B's sync
        db.insert(bookmarkMedia).values({
          id: `${QUOTED_TWEET_ID}_photo_0`,
          userId: USER_B,
          bookmarkId: QUOTED_TWEET_ID,
          mediaType: 'photo',
          originalUrl: 'https://example.com/photo.jpg',
        }).onConflictDoNothing(),
        // User A's sync retry (double-click)
        db.insert(bookmarkMedia).values({
          id: `${QUOTED_TWEET_ID}_photo_0`,
          userId: USER_A,
          bookmarkId: QUOTED_TWEET_ID,
          mediaType: 'photo',
          originalUrl: 'https://example.com/photo.jpg',
        }).onConflictDoNothing(),
        // User B's sync retry
        db.insert(bookmarkMedia).values({
          id: `${QUOTED_TWEET_ID}_photo_0`,
          userId: USER_B,
          bookmarkId: QUOTED_TWEET_ID,
          mediaType: 'photo',
          originalUrl: 'https://example.com/photo.jpg',
        }).onConflictDoNothing(),
      ]

      await Promise.all(concurrentInserts)

      // Each user should have exactly 1 media record
      const userAMedia = await db
        .select()
        .from(bookmarkMedia)
        .where(eq(bookmarkMedia.userId, USER_A))

      const userBMedia = await db
        .select()
        .from(bookmarkMedia)
        .where(eq(bookmarkMedia.userId, USER_B))

      expect(userAMedia).toHaveLength(1)
      expect(userBMedia).toHaveLength(1)
    })
  })

  // =========================================
  // Links Isolation Tests
  // =========================================
  describe('Links Isolation', () => {
    beforeEach(async () => {
      await db.insert(bookmarks).values([
        createTestBookmark(USER_A, SHARED_TWEET_ID),
        createTestBookmark(USER_B, SHARED_TWEET_ID),
      ])
    })

    it('isolates link records between users', async () => {
      await db.insert(bookmarkLinks).values([
        {
          userId: USER_A,
          bookmarkId: SHARED_TWEET_ID,
          expandedUrl: 'https://example.com/article',
          previewTitle: 'A sees this title',
        },
        {
          userId: USER_B,
          bookmarkId: SHARED_TWEET_ID,
          expandedUrl: 'https://example.com/article',
          previewTitle: 'B sees this title',
        },
      ])

      const userALinks = await db
        .select()
        .from(bookmarkLinks)
        .where(eq(bookmarkLinks.userId, USER_A))

      const userBLinks = await db
        .select()
        .from(bookmarkLinks)
        .where(eq(bookmarkLinks.userId, USER_B))

      expect(userALinks).toHaveLength(1)
      expect(userALinks[0].previewTitle).toBe('A sees this title')

      expect(userBLinks).toHaveLength(1)
      expect(userBLinks[0].previewTitle).toBe('B sees this title')
    })
  })

  // =========================================
  // User Preferences Isolation Tests
  // =========================================
  describe('Preferences Isolation', () => {
    it('isolates preferences between users', async () => {
      await db.insert(userPreferences).values([
        { userId: USER_A, key: 'theme', value: 'dark' },
        { userId: USER_B, key: 'theme', value: 'light' },
      ])

      const [userAPref] = await db
        .select()
        .from(userPreferences)
        .where(and(eq(userPreferences.userId, USER_A), eq(userPreferences.key, 'theme')))

      const [userBPref] = await db
        .select()
        .from(userPreferences)
        .where(and(eq(userPreferences.userId, USER_B), eq(userPreferences.key, 'theme')))

      expect(userAPref.value).toBe('dark')
      expect(userBPref.value).toBe('light')
    })

    it('allows same preference key for different users', async () => {
      await db.insert(userPreferences).values([
        { userId: USER_A, key: 'font', value: 'inter' },
        { userId: USER_B, key: 'font', value: 'lexend' },
      ])

      const allFontPrefs = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.key, 'font'))

      expect(allFontPrefs).toHaveLength(2)
    })
  })

  // =========================================
  // Quoted Tweet Deduplication Tests
  // =========================================
  describe('Quoted Tweet Deduplication', () => {
    const QUOTED_TWEET_ID = 'quoted-tweet-Q'

    it('stores quoted tweet once per user when multiple bookmarks reference it', async () => {
      // User A bookmarks tweet A which quotes Q
      await db.insert(bookmarks).values(
        createTestBookmark(USER_A, 'tweet-A', {
          isQuote: true,
          quotedTweetId: QUOTED_TWEET_ID,
        })
      )

      // User A also bookmarks tweet B which quotes the same Q
      await db.insert(bookmarks).values(
        createTestBookmark(USER_A, 'tweet-B', {
          isQuote: true,
          quotedTweetId: QUOTED_TWEET_ID,
        })
      )

      // Store quoted tweet Q for User A (only once)
      await db.insert(bookmarks).values(
        createTestBookmark(USER_A, QUOTED_TWEET_ID, {
          text: 'This is the quoted tweet content',
        })
      )

      // User A should have 3 bookmarks total (A, B, and Q)
      const userABookmarks = await db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.userId, USER_A))

      expect(userABookmarks).toHaveLength(3)

      // Only one copy of Q exists for User A
      const quotedTweets = await db
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, USER_A), eq(bookmarks.id, QUOTED_TWEET_ID)))

      expect(quotedTweets).toHaveLength(1)
    })

    it('allows different users to have their own copy of quoted tweet', async () => {
      // User A and User B both bookmark tweets that quote Q
      await db.insert(bookmarks).values([
        createTestBookmark(USER_A, 'tweet-A', { isQuote: true, quotedTweetId: QUOTED_TWEET_ID }),
        createTestBookmark(USER_B, 'tweet-C', { isQuote: true, quotedTweetId: QUOTED_TWEET_ID }),
      ])

      // Each user stores their own copy of Q
      await db.insert(bookmarks).values([
        createTestBookmark(USER_A, QUOTED_TWEET_ID, { text: 'Quoted Q for User A' }),
        createTestBookmark(USER_B, QUOTED_TWEET_ID, { text: 'Quoted Q for User B' }),
      ])

      // Each user has their own Q
      const [userAQuoted] = await db
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, USER_A), eq(bookmarks.id, QUOTED_TWEET_ID)))

      const [userBQuoted] = await db
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, USER_B), eq(bookmarks.id, QUOTED_TWEET_ID)))

      expect(userAQuoted.text).toBe('Quoted Q for User A')
      expect(userBQuoted.text).toBe('Quoted Q for User B')
    })
  })

  // =========================================
  // Account Clear Isolation Tests
  // =========================================
  describe('Account Clear Isolation', () => {
    beforeEach(async () => {
      // Set up data for both users
      await db.insert(bookmarks).values([
        createTestBookmark(USER_A, 'tweet-a-1'),
        createTestBookmark(USER_A, 'tweet-a-2'),
        createTestBookmark(USER_B, 'tweet-b-1'),
        createTestBookmark(USER_B, 'tweet-b-2'),
        createTestBookmark(USER_B, 'tweet-b-3'),
      ])

      await db.insert(readStatus).values([
        { userId: USER_A, bookmarkId: 'tweet-a-1', readAt: new Date().toISOString() },
        { userId: USER_B, bookmarkId: 'tweet-b-1', readAt: new Date().toISOString() },
      ])

      await db.insert(bookmarkTags).values([
        { userId: USER_A, bookmarkId: 'tweet-a-1', tag: 'a-tag' },
        { userId: USER_B, bookmarkId: 'tweet-b-1', tag: 'b-tag' },
      ])
    })

    it('clearing User A data does not affect User B', async () => {
      // Clear all of User A's data
      await db.delete(bookmarkTags).where(eq(bookmarkTags.userId, USER_A))
      await db.delete(readStatus).where(eq(readStatus.userId, USER_A))
      await db.delete(bookmarks).where(eq(bookmarks.userId, USER_A))

      // User A should have nothing
      const userABookmarks = await db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.userId, USER_A))
      const userAReadStatus = await db
        .select()
        .from(readStatus)
        .where(eq(readStatus.userId, USER_A))
      const userATags = await db
        .select()
        .from(bookmarkTags)
        .where(eq(bookmarkTags.userId, USER_A))

      expect(userABookmarks).toHaveLength(0)
      expect(userAReadStatus).toHaveLength(0)
      expect(userATags).toHaveLength(0)

      // User B should still have all their data
      const userBBookmarks = await db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.userId, USER_B))
      const userBReadStatus = await db
        .select()
        .from(readStatus)
        .where(eq(readStatus.userId, USER_B))
      const userBTags = await db
        .select()
        .from(bookmarkTags)
        .where(eq(bookmarkTags.userId, USER_B))

      expect(userBBookmarks).toHaveLength(3)
      expect(userBReadStatus).toHaveLength(1)
      expect(userBTags).toHaveLength(1)
    })

    it('delete operations require userId filter', async () => {
      // This simulates what would happen if someone forgot the userId filter
      // We delete ALL bookmarks (dangerous!)
      const deleteAll = db.delete(bookmarks)

      // This should delete everything - both users' data
      await deleteAll

      const allBookmarks = await db.select().from(bookmarks)
      expect(allBookmarks).toHaveLength(0)

      // This test documents the dangerous behavior - always use userId filter!
    })
  })

  // =========================================
  // Edge Cases
  // =========================================
  describe('Edge Cases', () => {
    it('handles empty result sets gracefully', async () => {
      const nonExistentUser = await db
        .select()
        .from(bookmarks)
        .where(eq(bookmarks.userId, 'non-existent-user'))

      expect(nonExistentUser).toHaveLength(0)
    })

    it('handles bookmark with all related data', async () => {
      // Create a complete bookmark with media, links, tags, and read status
      await db.insert(bookmarks).values(createTestBookmark(USER_A, 'complete-tweet'))

      await db.insert(bookmarkMedia).values({
        id: 'complete-tweet_media1',
        userId: USER_A,
        bookmarkId: 'complete-tweet',
        mediaType: 'photo',
        originalUrl: 'https://example.com/photo.jpg',
      })

      await db.insert(bookmarkLinks).values({
        userId: USER_A,
        bookmarkId: 'complete-tweet',
        expandedUrl: 'https://example.com/link',
      })

      await db.insert(bookmarkTags).values([
        { userId: USER_A, bookmarkId: 'complete-tweet', tag: 'tag1' },
        { userId: USER_A, bookmarkId: 'complete-tweet', tag: 'tag2' },
      ])

      await db.insert(readStatus).values({
        userId: USER_A,
        bookmarkId: 'complete-tweet',
        readAt: new Date().toISOString(),
      })

      // Verify all data can be queried
      const [bookmark] = await db
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, USER_A), eq(bookmarks.id, 'complete-tweet')))

      const media = await db
        .select()
        .from(bookmarkMedia)
        .where(and(eq(bookmarkMedia.userId, USER_A), eq(bookmarkMedia.bookmarkId, 'complete-tweet')))

      const links = await db
        .select()
        .from(bookmarkLinks)
        .where(and(eq(bookmarkLinks.userId, USER_A), eq(bookmarkLinks.bookmarkId, 'complete-tweet')))

      const tags = await db
        .select()
        .from(bookmarkTags)
        .where(and(eq(bookmarkTags.userId, USER_A), eq(bookmarkTags.bookmarkId, 'complete-tweet')))

      const status = await db
        .select()
        .from(readStatus)
        .where(and(eq(readStatus.userId, USER_A), eq(readStatus.bookmarkId, 'complete-tweet')))

      expect(bookmark).toBeDefined()
      expect(media).toHaveLength(1)
      expect(links).toHaveLength(1)
      expect(tags).toHaveLength(2)
      expect(status).toHaveLength(1)
    })
  })
})
