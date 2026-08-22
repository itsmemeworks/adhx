import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkMedia, archivedPosts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { metrics } from '@/lib/sentry'
import { recordActivity, previewPath } from '@/lib/activity/record'
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
        .select({
          id: bookmarks.id,
          author: bookmarks.author,
          authorName: bookmarks.authorName,
          text: bookmarks.text,
          authorProfileImageUrl: bookmarks.authorProfileImageUrl,
        })
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

      // Push to the public activity pulse (anonymous, server-resolved content).
      const [media] = await db
        .select({ previewUrl: bookmarkMedia.previewUrl, originalUrl: bookmarkMedia.originalUrl })
        .from(bookmarkMedia)
        .where(
          and(
            eq(bookmarkMedia.userId, userId),
            eq(bookmarkMedia.platform, platform),
            eq(bookmarkMedia.bookmarkId, id),
          ),
        )
        .limit(1)
      recordActivity({
        action: 'read',
        platform,
        bookmarkId: id,
        author: bookmark.author,
        authorName: bookmark.authorName,
        text: bookmark.text,
        // Real media only — no avatar fallback, so text posts stay "text".
        thumbnailUrl: media?.previewUrl || media?.originalUrl || null,
        url: previewPath(platform, bookmark.author, id),
        userId,
      })

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
