import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkMedia, readStatus } from '@/lib/db/schema'
import { count, sql, eq, and } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'

// GET /api/stats - Get dashboard stats
export async function GET() {
  try {
    // Get current user ID for multi-user data isolation
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Total bookmarks for this user (strict userId check)
    const [totalResult] = await db
      .select({ count: count() })
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId))
    const total = totalResult?.count || 0

    // Read count for user's bookmarks (use userId from readStatus directly)
    const [readResult] = await db
      .select({ count: count() })
      .from(readStatus)
      .where(eq(readStatus.userId, userId))
    const readCount = readResult?.count || 0

    // Calculate unread
    const unread = Math.max(0, total - readCount)

    // By category for this user (strict userId check)
    const categoryCounts = await db
      .select({
        category: bookmarks.category,
        count: count(),
      })
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId))
      .groupBy(bookmarks.category)

    const categories: Record<string, number> = {}
    for (const row of categoryCounts) {
      categories[row.category || 'tweet'] = row.count
    }

    // With media for this user (use userId from bookmarkMedia directly)
    const [withMediaResult] = await db
      .select({ count: sql<number>`count(distinct ${bookmarkMedia.bookmarkId})` })
      .from(bookmarkMedia)
      .where(eq(bookmarkMedia.userId, userId))

    // Needs transcript for this user (strict userId check)
    const [needsTranscriptResult] = await db
      .select({ count: count() })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), sql`${bookmarks.needsTranscript} = 1`))

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
