import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, readStatus } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'
import { metrics } from '@/lib/sentry'

// POST /api/bookmarks/[id]/read - Mark bookmark as read
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Verify bookmark exists and belongs to this user
    const [bookmark] = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
      .limit(1)

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    // Check if already read
    const [existing] = await db
      .select()
      .from(readStatus)
      .where(eq(readStatus.bookmarkId, id))
      .limit(1)

    if (existing) {
      // Already marked as read
      return NextResponse.json({
        success: true,
        isRead: true,
        readAt: existing.readAt,
      })
    }

    // Mark as read
    const readAt = new Date().toISOString()
    await db.insert(readStatus).values({
      bookmarkId: id,
      readAt,
    })

    // Track read toggle
    metrics.bookmarkReadToggled(true)

    return NextResponse.json({
      success: true,
      isRead: true,
      readAt,
    })
  } catch (error) {
    console.error('Error marking bookmark as read:', error)
    return NextResponse.json(
      { error: 'Failed to mark as read' },
      { status: 500 }
    )
  }
}

// DELETE /api/bookmarks/[id]/read - Mark bookmark as unread
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Verify bookmark belongs to this user before modifying
    const [bookmark] = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
      .limit(1)

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    // Delete read status
    await db.delete(readStatus).where(eq(readStatus.bookmarkId, id))

    // Track unread toggle
    metrics.bookmarkReadToggled(false)

    return NextResponse.json({
      success: true,
      isRead: false,
      readAt: null,
    })
  } catch (error) {
    console.error('Error marking bookmark as unread:', error)
    return NextResponse.json(
      { error: 'Failed to mark as unread' },
      { status: 500 }
    )
  }
}
