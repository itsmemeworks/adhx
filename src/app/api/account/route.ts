import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  autoChannels,
  bookmarks,
  bookmarkLinks,
  bookmarkTags,
  bookmarkMedia,
  archivedPosts,
  syncLogs,
  userPreferences,
  postViews,
  postWatchCounts,
  postSends,
  momentAlertSubs,
  momentAlerts,
  reactionCounts,
  postReactions,
  accessKeys,
  appPairCodes,
  invites,
  phoneSaveQueue,
  adminSignInLinks,
  oauthTokens,
  tagShares,
  users,
  userIdentities,
  usernameAliases,
  loginTokens,
  activity,
  analyticsEvents,
  collectionAggregates,
  collectionEvents,
  userBans,
} from '@/lib/db/schema'
import { and, eq, or, sql } from 'drizzle-orm'
import { runInTransaction } from '@/lib/db'
import { removeAvatarFiles } from '@/lib/avatar/store'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { clearSessionCookie } from '@/lib/auth/session'

/**
 * DELETE /api/account
 *
 * Deletes the user's account and associated private/product data: bookmarks,
 * tags, preferences, the feed's seen list, OAuth tokens, the `users` row,
 * every linked sign-in identity (X, email, invite), outstanding magic-link
 * tokens, and invites it made or joined with. Historical moderation/audit records remain intact, but cannot be
 * used as a live account or auth identity.
 *
 * Historical activity/analytics rows survive, but their nullable private
 * user/viewer IDs are anonymized. Playlist events and durable aggregates owned
 * by this account, plus a ban targeting it, are removed because those records
 * cannot outlive the account they describe.
 *
 * This is a destructive, irreversible operation.
 */
export const DELETE = withAuth(async (_req, userId) => {
  try {
    // Read the account's email up front (outside the transaction — plain
    // selects on the better-sqlite3 driver are fine here) so we can also
    // sweep any magic-link tokens issued to that address, not just ones
    // carrying this userId (a 'signin' token only stores the email).
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    const email = user?.email ?? null

    // Delete everything atomically, in order to respect foreign key constraints.
    // If any delete fails, all are rolled back (avoids a half-deleted account).
    // Uses synchronous .run() inside transaction (required by better-sqlite3).
    runInTransaction(() => {
      // 1. Delete archive rows
      db.delete(archivedPosts).where(eq(archivedPosts.userId, userId)).run()

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

      // 9. Delete user preferences
      db.delete(userPreferences).where(eq(userPreferences.userId, userId)).run()

      // 10. Delete the feed's seen list
      db.delete(postViews).where(eq(postViews.userId, userId)).run()
      // 10a. How many times it watched each post
      db.delete(postWatchCounts).where(eq(postWatchCounts.userId, userId)).run()
      db.run(sql`DELETE FROM watch_batch_receipts WHERE user_id=${userId}`)

      // 10b. Posts sent to or by this account, and its live bells and alerts.
      db.delete(postSends)
        .where(or(eq(postSends.fromUserId, userId), eq(postSends.toUserId, userId)))
        .run()
      db.delete(momentAlertSubs).where(eq(momentAlertSubs.userId, userId)).run()
      db.delete(momentAlerts).where(eq(momentAlerts.userId, userId)).run()
      db.delete(reactionCounts).where(eq(reactionCounts.userId, userId)).run()
      db.delete(postReactions).where(eq(postReactions.userId, userId)).run()

      // 11. Delete public tag-share settings
      db.delete(tagShares).where(eq(tagShares.userId, userId)).run()

      // 12. Delete outstanding magic-link tokens — by userId (email-change
      // confirmations carry it) and by email (signin tokens only carry the
      // address, not a userId).
      if (email) {
        db.delete(loginTokens)
          .where(or(eq(loginTokens.userId, userId), eq(loginTokens.email, email)))
          .run()
        db.delete(adminSignInLinks).where(eq(adminSignInLinks.email, email)).run()
      } else {
        db.delete(loginTokens).where(eq(loginTokens.userId, userId)).run()
      }

      // 13. Delete linked sign-in identities (X + email)
      db.delete(userIdentities).where(eq(userIdentities.userId, userId)).run()

      // 14. Delete redirects for every username this account previously used.
      db.delete(usernameAliases).where(eq(usernameAliases.userId, userId)).run()

      // 15. Delete OAuth tokens
      db.delete(oauthTokens).where(eq(oauthTokens.userId, userId)).run()
      db.delete(accessKeys).where(eq(accessKeys.userId, userId)).run()
      db.delete(appPairCodes).where(eq(appPairCodes.userId, userId)).run()
      db.delete(phoneSaveQueue).where(eq(phoneSaveQueue.userId, userId)).run()
      // Invites this account made (pending ones die with it) or joined with.
      db.delete(invites)
        .where(or(eq(invites.createdBy, userId), eq(invites.usedBy, userId)))
        .run()

      // 15b. Made for you channels, built from this account's saves.
      db.delete(autoChannels).where(eq(autoChannels.userId, userId)).run()

      // 16. Preserve aggregate history without retaining this account's
      // private actor/viewer ID. Its public "saved" pulses go with its saves.
      db.delete(activity)
        .where(and(eq(activity.userId, userId), eq(activity.action, 'save')))
        .run()
      db.update(activity).set({ userId: null }).where(eq(activity.userId, userId)).run()
      db.update(analyticsEvents)
        .set({ userId: null })
        .where(eq(analyticsEvents.userId, userId))
        .run()
      db.update(collectionEvents)
        .set({ viewerId: null })
        .where(eq(collectionEvents.viewerId, userId))
        .run()

      // 17. Owner-keyed playlist events and a ban targeting this account have
      // no valid meaning once the account itself is gone.
      db.delete(collectionEvents).where(eq(collectionEvents.ownerUserId, userId)).run()
      db.delete(collectionAggregates).where(eq(collectionAggregates.ownerUserId, userId)).run()
      db.delete(userBans).where(eq(userBans.userId, userId)).run()

      // 18. Delete the account itself. Database triggers installed by
      // migrate.ts reject any later write carrying this now-dead account ID.
      db.delete(users).where(eq(users.id, userId)).run()
    })

    // The picture files go too (MEDIA_DIR/avatars/<id>-*.jpg).
    await removeAvatarFiles(userId)

    const response = NextResponse.json({
      success: true,
      message: 'Account deleted successfully.',
    })
    clearSessionCookie(response)
    return response
  } catch (error) {
    return handleRouteError(error, {
      endpoint: '/api/account',
      userId,
      message: 'Failed to delete account',
    })
  }
})
