import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarkTags } from '@/lib/db/schema'
import { eq, sql, and } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'

// GET /api/tags - List all unique tags with bookmark counts
export async function GET() {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get all tags with counts for user's bookmarks (use userId from bookmarkTags directly)
  const tags = await db
    .select({
      tag: bookmarkTags.tag,
      count: sql<number>`COUNT(*)`.as('count'),
    })
    .from(bookmarkTags)
    .where(eq(bookmarkTags.userId, userId))
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

  // Delete the tag from all user's bookmarks (use userId from bookmarkTags directly)
  await db.delete(bookmarkTags).where(
    and(
      eq(bookmarkTags.userId, userId),
      eq(bookmarkTags.tag, tag)
    )
  )

  return NextResponse.json({ success: true })
}
