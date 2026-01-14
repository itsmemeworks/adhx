import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkLinks, bookmarkTags, bookmarkMedia, readStatus } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { resolveMediaUrl, getShareableUrl, getThumbnailUrl } from '@/lib/media/fxembed'
import { expandUrls } from '@/lib/utils/url-expander'
import { getCurrentUserId } from '@/lib/auth/session'

// GET /api/bookmarks/[id] - Get single bookmark
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const [bookmark] = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, id)))
      .limit(1)

    if (!bookmark) {
      return NextResponse.json({ error: 'Bookmark not found' }, { status: 404 })
    }

    // Get related data (all filtered by userId for multi-user support)
    const [links, tags, media, readStatusRecord] = await Promise.all([
      db.select().from(bookmarkLinks).where(and(eq(bookmarkLinks.userId, userId), eq(bookmarkLinks.bookmarkId, id))),
      db.select().from(bookmarkTags).where(and(eq(bookmarkTags.userId, userId), eq(bookmarkTags.bookmarkId, id))),
      db.select().from(bookmarkMedia).where(and(eq(bookmarkMedia.userId, userId), eq(bookmarkMedia.bookmarkId, id))),
      db.select().from(readStatus).where(and(eq(readStatus.userId, userId), eq(readStatus.bookmarkId, id))).limit(1),
    ])

    // Add FxEmbed URLs to media
    const mediaWithUrls = media.map((m, index) => {
      const mediaType = m.mediaType as 'photo' | 'video' | 'animated_gif'
      const urlOptions = {
        tweetId: bookmark.id,
        author: bookmark.author,
        mediaType,
        mediaIndex: index + 1,
      }
      return {
        id: m.id,
        mediaType: m.mediaType,
        width: m.width,
        height: m.height,
        durationMs: m.durationMs,
        altText: m.altText,
        url: resolveMediaUrl(urlOptions),
        thumbnailUrl: getThumbnailUrl({ ...urlOptions, previewUrl: m.previewUrl || undefined }),
        shareUrl: getShareableUrl(urlOptions),
      }
    })

    // Expand t.co URLs in the text
    const expandedText = expandUrls(bookmark.text, links)

    return NextResponse.json({
      ...bookmark,
      text: expandedText,
      links,
      tags: tags.map((t) => t.tag),
      media: mediaWithUrls,
      isRead: readStatusRecord.length > 0,
      readAt: readStatusRecord[0]?.readAt || null,
    })
  } catch (error) {
    console.error('Error fetching bookmark:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bookmark' },
      { status: 500 }
    )
  }
}

// PATCH /api/bookmarks/[id] - Update bookmark
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { category, summary, tags: newTags } = body

    // Update bookmark (filter by userId for multi-user support)
    const updates: Record<string, string> = {}
    if (category) updates.category = category
    if (summary !== undefined) updates.summary = summary

    if (Object.keys(updates).length > 0) {
      await db.update(bookmarks).set(updates).where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, id)))
    }

    // Update tags if provided
    if (newTags !== undefined) {
      // Delete existing tags (filter by userId)
      await db.delete(bookmarkTags).where(and(eq(bookmarkTags.userId, userId), eq(bookmarkTags.bookmarkId, id)))

      // Insert new tags (include userId)
      if (newTags.length > 0) {
        await db.insert(bookmarkTags).values(
          newTags.map((tag: string) => ({
            userId,
            bookmarkId: id,
            tag,
          }))
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating bookmark:', error)
    return NextResponse.json(
      { error: 'Failed to update bookmark' },
      { status: 500 }
    )
  }
}

// DELETE /api/bookmarks/[id] - Delete bookmark
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
    // Delete bookmark (filter by userId for multi-user support)
    // Note: Related records must also be deleted with userId filter since we use composite keys
    await db.delete(bookmarkTags).where(and(eq(bookmarkTags.userId, userId), eq(bookmarkTags.bookmarkId, id)))
    await db.delete(bookmarkMedia).where(and(eq(bookmarkMedia.userId, userId), eq(bookmarkMedia.bookmarkId, id)))
    await db.delete(bookmarkLinks).where(and(eq(bookmarkLinks.userId, userId), eq(bookmarkLinks.bookmarkId, id)))
    await db.delete(readStatus).where(and(eq(readStatus.userId, userId), eq(readStatus.bookmarkId, id)))
    await db.delete(bookmarks).where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, id)))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting bookmark:', error)
    return NextResponse.json(
      { error: 'Failed to delete bookmark' },
      { status: 500 }
    )
  }
}
