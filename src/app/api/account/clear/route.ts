import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  bookmarks,
  bookmarkLinks,
  bookmarkTags,
  bookmarkMedia,
  readStatus,
  collections,
  collectionTweets,
  syncLogs,
  syncState,
  userPreferences,
} from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'

/**
 * POST /api/account/clear
 *
 * Clears all user data (bookmarks, tags, collections, etc.)
 * but preserves OAuth tokens so the user stays connected.
 *
 * Useful for:
 * - Starting fresh with a clean slate
 * - Testing the sync flow
 * - Removing test data
 */
export async function POST() {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete in order to respect foreign key constraints
    // Note: SQLite with WAL mode serializes writes. better-sqlite3's synchronous
    // driver doesn't support async transactions, but SQLite's single-writer lock
    // prevents interleaving. All deletes filtered by userId for multi-user isolation.

    // 1. Delete collection tweets (junction table)
    await db.delete(collectionTweets).where(eq(collectionTweets.userId, userId))

    // 2. Delete collections
    await db.delete(collections).where(eq(collections.userId, userId))

    // 3. Delete read status
    await db.delete(readStatus).where(eq(readStatus.userId, userId))

    // 4. Delete bookmark media
    await db.delete(bookmarkMedia).where(eq(bookmarkMedia.userId, userId))

    // 5. Delete bookmark tags
    await db.delete(bookmarkTags).where(eq(bookmarkTags.userId, userId))

    // 6. Delete bookmark links
    await db.delete(bookmarkLinks).where(eq(bookmarkLinks.userId, userId))

    // 7. Delete bookmarks (main table)
    await db.delete(bookmarks).where(eq(bookmarks.userId, userId))

    // 8. Delete sync logs
    await db.delete(syncLogs).where(eq(syncLogs.userId, userId))

    // 9. Delete sync state
    await db.delete(syncState).where(eq(syncState.userId, userId))

    // 10. Delete user preferences
    await db.delete(userPreferences).where(eq(userPreferences.userId, userId))

    return NextResponse.json({
      success: true,
      message: 'All data cleared successfully. Your Twitter connection is preserved.',
    })
  } catch (error) {
    console.error('Failed to clear data:', error)
    return NextResponse.json(
      { error: 'Failed to clear data' },
      { status: 500 }
    )
  }
}
