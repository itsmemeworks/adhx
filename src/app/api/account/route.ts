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
  oauthTokens,
} from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'

/**
 * DELETE /api/account
 *
 * Completely deletes the user's account and all associated data.
 * This includes OAuth tokens, so the user will be logged out.
 *
 * This is a destructive, irreversible operation.
 */
export const DELETE = withAuth(async (_req, userId) => {
  try {
    // Delete everything in order to respect foreign key constraints
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

    // 11. Delete OAuth tokens (this logs the user out)
    await db.delete(oauthTokens).where(eq(oauthTokens.userId, userId))

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully.',
    })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/account',
      userId,
      message: 'Failed to delete account',
    })
  }
})
