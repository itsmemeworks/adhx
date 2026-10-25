import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  bookmarks,
  bookmarkLinks,
  bookmarkTags,
  bookmarkMedia,
  archivedPosts,
  syncLogs,
  userPreferences,
  phoneSaveQueue,
  postViews,
  postWatchCounts,
  postSends,
  momentAlertSubs,
  momentAlerts,
  reactionCounts,
  postReactions,
  autoChannels,
  activity,
} from '@/lib/db/schema'
import { and, eq, or, sql } from 'drizzle-orm'
import { runInTransaction } from '@/lib/db'
import { metrics } from '@/lib/sentry'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'

/**
 * POST /api/account/clear
 *
 * Clears all user data (bookmarks, tags, preferences, etc.)
 * but keeps the account, its sign-in and its X connection.
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
      db.delete(archivedPosts).where(eq(archivedPosts.userId, userId)).run()
      db.delete(bookmarkMedia).where(eq(bookmarkMedia.userId, userId)).run()
      db.delete(bookmarkTags).where(eq(bookmarkTags.userId, userId)).run()
      db.delete(bookmarkLinks).where(eq(bookmarkLinks.userId, userId)).run()
      db.delete(bookmarks).where(eq(bookmarks.userId, userId)).run()
      db.delete(syncLogs).where(eq(syncLogs.userId, userId)).run()
      db.delete(userPreferences).where(eq(userPreferences.userId, userId)).run()
      db.delete(phoneSaveQueue).where(eq(phoneSaveQueue.userId, userId)).run()
      // What you've seen in the feed starts over too.
      db.delete(postViews).where(eq(postViews.userId, userId)).run()
      db.delete(postWatchCounts).where(eq(postWatchCounts.userId, userId)).run()
      db.run(sql`DELETE FROM watch_batch_receipts WHERE user_id=${userId}`)
      // Posts sent to or by you, and your live bells and alerts.
      db.delete(postSends)
        .where(or(eq(postSends.fromUserId, userId), eq(postSends.toUserId, userId)))
        .run()
      db.delete(momentAlertSubs).where(eq(momentAlertSubs.userId, userId)).run()
      db.delete(momentAlerts).where(eq(momentAlerts.userId, userId)).run()
      db.delete(reactionCounts).where(eq(reactionCounts.userId, userId)).run()
      db.delete(postReactions).where(eq(postReactions.userId, userId)).run()
      // Made for you is built from the saves that are now gone.
      db.delete(autoChannels).where(eq(autoChannels.userId, userId)).run()
      db.run(sql`DELETE FROM channel_visual_jobs WHERE user_id = ${userId}`)
      // The public "saved" pulses go with the saves; other events keep their
      // anonymous counts without the account.
      db.delete(activity)
        .where(and(eq(activity.userId, userId), eq(activity.action, 'save')))
        .run()
      db.update(activity).set({ userId: null }).where(eq(activity.userId, userId)).run()
    })

    metrics.dataCleared()

    return NextResponse.json({
      success: true,
      message: 'All your data is cleared. Your account and your X connection stay.',
    })
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/account/clear',
      userId,
      message: 'Failed to clear data',
    })
  }
})
