import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  bookmarks,
  bookmarkLinks,
  bookmarkTags,
  bookmarkMedia,
  archivedPosts,
  collections,
  collectionTweets,
  syncLogs,
  syncState,
  userPreferences,
  oauthTokens,
  tagShares,
  users,
  userIdentities,
  loginTokens,
} from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { runInTransaction } from '@/lib/db'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'
import { clearSessionCookie } from '@/lib/auth/session'

/**
 * DELETE /api/account
 *
 * Completely deletes the user's account and all associated data: bookmarks,
 * collections, tags, preferences, sync state, OAuth tokens, the `users` row,
 * and every linked sign-in identity (X + email) and outstanding magic-link
 * token. Nothing that identifies this account (username, email, X id)
 * survives — this is what makes "Delete account" actually delete the account.
 *
 * The `activity` table is deliberately NOT touched here — it's an anonymous,
 * append-only event log; `userId` there is stored but never exposed and is
 * intentionally retained (see CLAUDE.md).
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
      // 1. Delete collection tweets (junction table)
      db.delete(collectionTweets).where(eq(collectionTweets.userId, userId)).run()

      // 2. Delete collections
      db.delete(collections).where(eq(collections.userId, userId)).run()

      // 3. Delete read status
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

      // 9. Delete sync state
      db.delete(syncState).where(eq(syncState.userId, userId)).run()

      // 10. Delete user preferences
      db.delete(userPreferences).where(eq(userPreferences.userId, userId)).run()

      // 11. Delete public tag-share settings
      db.delete(tagShares).where(eq(tagShares.userId, userId)).run()

      // 12. Delete outstanding magic-link tokens — by userId (email-change
      // confirmations carry it) and by email (signin tokens only carry the
      // address, not a userId).
      if (email) {
        db.delete(loginTokens)
          .where(or(eq(loginTokens.userId, userId), eq(loginTokens.email, email)))
          .run()
      } else {
        db.delete(loginTokens).where(eq(loginTokens.userId, userId)).run()
      }

      // 13. Delete linked sign-in identities (X + email)
      db.delete(userIdentities).where(eq(userIdentities.userId, userId)).run()

      // 14. Delete OAuth tokens
      db.delete(oauthTokens).where(eq(oauthTokens.userId, userId)).run()

      // 15. Delete the account itself
      db.delete(users).where(eq(users.id, userId)).run()
    })

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
