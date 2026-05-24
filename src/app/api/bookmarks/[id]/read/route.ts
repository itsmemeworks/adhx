import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, readStatus } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'
import { metrics } from '@/lib/sentry'

function getPlatform(request: NextRequest): string {
  return request.nextUrl.searchParams.get('platform') || 'twitter'
}

// POST /api/bookmarks/[id]/read?platform=... - Mark bookmark as read
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const platform = getPlatform(request)

    const [bookmark] = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.platform, platform), eq(bookmarks.id, id)))
      .limit(1)

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    const [existing] = await db
      .select()
      .from(readStatus)
      .where(and(eq(readStatus.userId, userId), eq(readStatus.platform, platform), eq(readStatus.bookmarkId, id)))
      .limit(1)

    if (existing) {
      return NextResponse.json({
        success: true,
        isRead: true,
        readAt: existing.readAt,
      })
    }

    const readAt = new Date().toISOString()
    await db.insert(readStatus).values({
      userId,
      platform,
      bookmarkId: id,
      readAt,
    })

    metrics.bookmarkReadToggled(true)

    return NextResponse.json({ success: true, isRead: true, readAt })
  } catch (error) {
    console.error('Error marking bookmark as read:', error)
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 })
  }
}

// DELETE /api/bookmarks/[id]/read?platform=... - Mark bookmark as unread
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const platform = getPlatform(request)

    const [bookmark] = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.platform, platform), eq(bookmarks.id, id)))
      .limit(1)

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    await db.delete(readStatus).where(and(
      eq(readStatus.userId, userId),
      eq(readStatus.platform, platform),
      eq(readStatus.bookmarkId, id),
    ))

    metrics.bookmarkReadToggled(false)

    return NextResponse.json({ success: true, isRead: false, readAt: null })
  } catch (error) {
    console.error('Error marking bookmark as unread:', error)
    return NextResponse.json({ error: 'Failed to mark as unread' }, { status: 500 })
  }
}
