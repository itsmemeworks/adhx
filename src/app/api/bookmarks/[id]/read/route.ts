import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, archivedPosts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { metrics } from '@/lib/sentry'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'

function getPlatform(request: NextRequest): string {
  return request.nextUrl.searchParams.get('platform') || 'twitter'
}

// POST /api/bookmarks/[id]/read?platform=... - Mark bookmark as read
export const POST = withAuth(
  async (request: NextRequest, userId, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params
      const platform = getPlatform(request)

      const [bookmark] = await db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(eq(bookmarks.userId, userId), eq(bookmarks.platform, platform), eq(bookmarks.id, id)),
        )
        .limit(1)

      if (!bookmark) {
        return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
      }

      const [existing] = await db
        .select()
        .from(archivedPosts)
        .where(
          and(
            eq(archivedPosts.userId, userId),
            eq(archivedPosts.platform, platform),
            eq(archivedPosts.bookmarkId, id),
          ),
        )
        .limit(1)

      if (existing) {
        return NextResponse.json({
          success: true,
          isArchived: true,
          archivedAt: existing.archivedAt,
        })
      }

      const archivedAt = new Date().toISOString()
      await db.insert(archivedPosts).values({
        userId,
        platform,
        bookmarkId: id,
        archivedAt,
      })

      metrics.bookmarkReadToggled(true)

      // Archive is private — do not write a public `read` pulse. Preview /
      // save / share still feed the community feed; marking something done
      // in My Collection does not.

      return NextResponse.json({ success: true, isArchived: true, archivedAt })
    } catch (error) {
      return handleRouteError(error, {
        endpoint: '/api/bookmarks/[id]/read',
        userId,
        message: 'Failed to mark as read',
      })
    }
  },
)

// DELETE /api/bookmarks/[id]/read?platform=... - Mark bookmark as unread
export const DELETE = withAuth(
  async (request: NextRequest, userId, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params
      const platform = getPlatform(request)

      const [bookmark] = await db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(eq(bookmarks.userId, userId), eq(bookmarks.platform, platform), eq(bookmarks.id, id)),
        )
        .limit(1)

      if (!bookmark) {
        return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
      }

      await db
        .delete(archivedPosts)
        .where(
          and(
            eq(archivedPosts.userId, userId),
            eq(archivedPosts.platform, platform),
            eq(archivedPosts.bookmarkId, id),
          ),
        )

      metrics.bookmarkReadToggled(false)

      return NextResponse.json({ success: true, isArchived: false, archivedAt: null })
    } catch (error) {
      return handleRouteError(error, {
        endpoint: '/api/bookmarks/[id]/read',
        userId,
        message: 'Failed to mark as unread',
      })
    }
  },
)
