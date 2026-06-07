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
import { runInTransaction } from '@/lib/db'
import { metrics } from '@/lib/sentry'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'

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
export const POST = withAuth(async (_req, userId) => {
  try {
    // Delete all user data atomically. If any delete fails, all are rolled back.
    // Uses synchronous .run() inside transaction (required by better-sqlite3).
    runInTransaction(() => {
      db.delete(collectionTweets).where(eq(collectionTweets.userId, userId)).run()
      db.delete(collections).where(eq(collections.userId, userId)).run()
      db.delete(readStatus).where(eq(readStatus.userId, userId)).run()
      db.delete(bookmarkMedia).where(eq(bookmarkMedia.userId, userId)).run()
      db.delete(bookmarkTags).where(eq(bookmarkTags.userId, userId)).run()
      db.delete(bookmarkLinks).where(eq(bookmarkLinks.userId, userId)).run()
      db.delete(bookmarks).where(eq(bookmarks.userId, userId)).run()
      db.delete(syncLogs).where(eq(syncLogs.userId, userId)).run()
      db.delete(syncState).where(eq(syncState.userId, userId)).run()
      db.delete(userPreferences).where(eq(userPreferences.userId, userId)).run()
    })

    metrics.dataCleared()

    return NextResponse.json({
      success: true,
      message: 'All data cleared successfully. Your Twitter connection is preserved.',
    })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/account/clear',
      userId,
      message: 'Failed to clear data',
    })
  }
})
