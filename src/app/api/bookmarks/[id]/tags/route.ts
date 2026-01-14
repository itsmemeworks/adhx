import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarkTags, bookmarks } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'
import { metrics } from '@/lib/sentry'

const MAX_TAG_LENGTH = 10

// GET /api/bookmarks/[id]/tags - Get tags for a bookmark
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Verify bookmark belongs to user (strict userId check)
  const [bookmark] = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .limit(1)

  if (!bookmark) {
    return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
  }

  // Get tags (filter by userId for composite key)
  const tags = await db
    .select({ tag: bookmarkTags.tag })
    .from(bookmarkTags)
    .where(and(eq(bookmarkTags.userId, userId), eq(bookmarkTags.bookmarkId, id)))

  return NextResponse.json({ tags: tags.map((t) => t.tag) })
}

// POST /api/bookmarks/[id]/tags - Add tag to bookmark
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { tag } = await request.json()

  // Validate tag
  if (!tag || typeof tag !== 'string') {
    return NextResponse.json({ error: 'Tag is required' }, { status: 400 })
  }

  const cleanTag = tag.trim().toLowerCase()

  if (cleanTag.length === 0) {
    return NextResponse.json({ error: 'Tag cannot be empty' }, { status: 400 })
  }

  if (cleanTag.length > MAX_TAG_LENGTH) {
    return NextResponse.json(
      { error: `Tag must be ${MAX_TAG_LENGTH} characters or less` },
      { status: 400 }
    )
  }

  // Verify bookmark belongs to user (strict userId check)
  const [bookmark] = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .limit(1)

  if (!bookmark) {
    return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
  }

  // Insert tag with userId (composite key: userId + bookmarkId + tag)
  try {
    await db.insert(bookmarkTags).values({
      userId,
      bookmarkId: id,
      tag: cleanTag,
    })

    // Get updated tag count for this bookmark (filter by userId)
    const allTags = await db
      .select({ tag: bookmarkTags.tag })
      .from(bookmarkTags)
      .where(and(eq(bookmarkTags.userId, userId), eq(bookmarkTags.bookmarkId, id)))

    // Track tag addition
    metrics.bookmarkTagged(allTags.length)
  } catch (error: unknown) {
    // Check if it's a unique constraint error (tag already exists)
    if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return NextResponse.json({ success: true, tag: cleanTag }) // Already exists, return success
    }
    throw error
  }

  return NextResponse.json({ success: true, tag: cleanTag })
}

// DELETE /api/bookmarks/[id]/tags - Remove tag from bookmark
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { tag } = await request.json()

  if (!tag) {
    return NextResponse.json({ error: 'Tag is required' }, { status: 400 })
  }

  // Verify bookmark belongs to user (strict userId check)
  const [bookmark] = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .limit(1)

  if (!bookmark) {
    return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
  }

  // Delete tag (use userId for composite key)
  await db
    .delete(bookmarkTags)
    .where(and(eq(bookmarkTags.userId, userId), eq(bookmarkTags.bookmarkId, id), eq(bookmarkTags.tag, tag)))

  return NextResponse.json({ success: true })
}
