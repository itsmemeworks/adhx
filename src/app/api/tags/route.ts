import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarkTags, bookmarks } from '@/lib/db/schema'
import { eq, sql, or, isNull, and } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'

// GET /api/tags - List all unique tags with bookmark counts
export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get all tags with counts for user's bookmarks
  const tags = await db
    .select({
      tag: bookmarkTags.tag,
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(bookmarkTags)
    .innerJoin(bookmarks, eq(bookmarkTags.bookmarkId, bookmarks.id))
    .where(or(eq(bookmarks.userId, userId), isNull(bookmarks.userId)))
    .groupBy(bookmarkTags.tag)
    .orderBy(sql`COUNT(*) DESC`)

  return NextResponse.json({ tags })
}

// DELETE /api/tags - Delete a tag from all bookmarks
export async function DELETE(request: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tag } = await request.json()
  if (!tag) {
    return NextResponse.json({ error: 'Tag is required' }, { status: 400 })
  }

  // Delete the tag from all user's bookmarks
  // First get all user's bookmark IDs
  const userBookmarks = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(or(eq(bookmarks.userId, userId), isNull(bookmarks.userId)))

  const bookmarkIds = userBookmarks.map((b) => b.id)

  if (bookmarkIds.length > 0) {
    // Delete the tag from those bookmarks
    await db.delete(bookmarkTags).where(
      and(
        eq(bookmarkTags.tag, tag),
        sql`${bookmarkTags.bookmarkId} IN (${sql.join(
          bookmarkIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
    )
  }

  return NextResponse.json({ success: true })
}
