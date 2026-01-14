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
    // Delete in order to respect foreign key constraints
    // (though SQLite cascades should handle most of this)

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
