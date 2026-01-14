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
  oauthState,
} from '@/lib/db/schema'

/**
 * DELETE /api/account
 *
 * Completely deletes the user's account and all associated data.
 * This includes OAuth tokens, so the user will be logged out.
 *
 * This is a destructive, irreversible operation.
 */
export async function DELETE() {
  try {
    // Delete everything in order to respect foreign key constraints

    // 1. Delete collection tweets (junction table)
    await db.delete(collectionTweets)

    // 2. Delete collections
    await db.delete(collections)

    // 3. Delete read status
    await db.delete(readStatus)

    // 4. Delete bookmark media
    await db.delete(bookmarkMedia)

    // 5. Delete bookmark tags
    await db.delete(bookmarkTags)

    // 6. Delete bookmark links
    await db.delete(bookmarkLinks)

    // 7. Delete bookmarks (main table)
    await db.delete(bookmarks)

    // 8. Delete sync logs
    await db.delete(syncLogs)

    // 9. Delete sync state
    await db.delete(syncState)

    // 10. Delete user preferences
    await db.delete(userPreferences)

    // 11. Delete OAuth state (PKCE verifiers)
    await db.delete(oauthState)

    // 12. Delete OAuth tokens (this logs the user out)
    await db.delete(oauthTokens)

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully.',
    })
  } catch (error) {
    console.error('Failed to delete account:', error)
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    )
  }
}
