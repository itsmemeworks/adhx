import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkMedia, readStatus } from '@/lib/db/schema'
import { count, sql, or, eq, isNull, and, inArray } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'

// GET /api/stats - Get dashboard stats
export async function GET() {
  try {
    // Get current user ID for multi-user data isolation
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // User filter (supports migration period where userId may be null)
    const userFilter = or(eq(bookmarks.userId, userId), isNull(bookmarks.userId))

    // Total bookmarks for this user
    const [totalResult] = await db
      .select({ count: count() })
      .from(bookmarks)
      .where(userFilter)
    const total = totalResult?.count || 0

    // Get user's bookmark IDs for filtering read status
    const userBookmarks = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(userFilter)
    const userBookmarkIds = userBookmarks.map((b) => b.id)

    // Read count for user's bookmarks
    const [readResult] = userBookmarkIds.length > 0
      ? await db
          .select({ count: count() })
          .from(readStatus)
          .where(inArray(readStatus.bookmarkId, userBookmarkIds))
      : [{ count: 0 }]
    const readCount = readResult?.count || 0

    // Calculate unread
    const unread = Math.max(0, total - readCount)

    // By category for this user
    const categoryCounts = await db
      .select({
        category: bookmarks.category,
        count: count(),
      })
      .from(bookmarks)
      .where(userFilter)
      .groupBy(bookmarks.category)

    const categories: Record<string, number> = {}
    for (const row of categoryCounts) {
      categories[row.category || 'tweet'] = row.count
    }

    // With media for this user's bookmarks
    const [withMediaResult] = userBookmarkIds.length > 0
      ? await db
          .select({ count: sql<number>`count(distinct ${bookmarkMedia.bookmarkId})` })
          .from(bookmarkMedia)
          .where(inArray(bookmarkMedia.bookmarkId, userBookmarkIds))
      : [{ count: 0 }]

    // Needs transcript for this user
    const [needsTranscriptResult] = await db
      .select({ count: count() })
      .from(bookmarks)
      .where(and(userFilter, sql`${bookmarks.needsTranscript} = 1`))

    return NextResponse.json({
      total,
      unread,
      read: readCount,
      categories,
      withMedia: withMediaResult?.count || 0,
      needsTranscript: needsTranscriptResult?.count || 0,
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    )
  }
}
