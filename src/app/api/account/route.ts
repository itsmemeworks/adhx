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
import { runInTransaction } from '@/lib/db'
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
    // Delete everything atomically, in order to respect foreign key constraints.
    // If any delete fails, all are rolled back (avoids a half-deleted account).
    // Uses synchronous .run() inside transaction (required by better-sqlite3).
    runInTransaction(() => {
      // 1. Delete collection tweets (junction table)
      db.delete(collectionTweets).where(eq(collectionTweets.userId, userId)).run()

      // 2. Delete collections
      db.delete(collections).where(eq(collections.userId, userId)).run()

      // 3. Delete read status
      db.delete(readStatus).where(eq(readStatus.userId, userId)).run()

      // 4. Delete bookmark media
      db.delete(bookmarkMedia).where(eq(bookmarkMedia.userId, userId)).run()

      // 5. Delete bookmark tags
      db.delete(bookmarkTags).where(eq(bookmarkTags.userId, userId)).run()

      // 6. Delete bookmark links
      db.delete(bookmarkLinks).where(eq(bookmarkLinks.userId, userId)).run()

      // 7. Delete bookmarks (main table)
      db.delete(bookmarks).where(eq(bookmarks.userId, userId)).run()

      // 8. Delete sync logs
      db.delete(syncLogs).where(eq(syncLogs.userId, userId)).run()

      // 9. Delete sync state
      db.delete(syncState).where(eq(syncState.userId, userId)).run()

      // 10. Delete user preferences
      db.delete(userPreferences).where(eq(userPreferences.userId, userId)).run()

      // 11. Delete OAuth tokens (this logs the user out)
      db.delete(oauthTokens).where(eq(oauthTokens.userId, userId)).run()
    })

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
