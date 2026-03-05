import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tagShares, bookmarkTags, bookmarks, bookmarkMedia, bookmarkLinks, oauthTokens } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { getCurrentUserId } from '@/lib/auth/session'

/**
 * POST /api/share/tag/by-name/[username]/[tag]/clone
 * Clone a shared tag collection to the current user's account
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string; tag: string }> }
) {
  const currentUserId = await getCurrentUserId()
  if (!currentUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { username, tag: tagName } = await params

    // Find user by username
    const [user] = await db
      .select({ userId: oauthTokens.userId })
      .from(oauthTokens)
      .where(eq(oauthTokens.username, username))
      .limit(1)

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Find tag share
    const [share] = await db
      .select()
      .from(tagShares)
      .where(and(eq(tagShares.userId, user.userId), eq(tagShares.tag, tagName)))
      .limit(1)

    if (!share) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    if (!share.isPublic) {
      return NextResponse.json({ error: 'This tag is private' }, { status: 403 })
    }

    // Prevent self-cloning
    if (share.userId === currentUserId) {
      return NextResponse.json({ error: 'Cannot clone your own tag' }, { status: 400 })
    }

    const sourceUserId = share.userId

    // Get all bookmark IDs with this tag from source user
    const sourceTaggedBookmarks = await db
      .select({ bookmarkId: bookmarkTags.bookmarkId })
      .from(bookmarkTags)
      .where(and(eq(bookmarkTags.userId, sourceUserId), eq(bookmarkTags.tag, tagName)))

    const sourceBookmarkIds = sourceTaggedBookmarks.map((t) => t.bookmarkId)

    if (sourceBookmarkIds.length === 0) {
      return NextResponse.json({
        success: true,
        clonedCount: 0,
        message: 'No bookmarks to clone',
      })
    }

    // Get source bookmarks
    const sourceBookmarks = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, sourceUserId), inArray(bookmarks.id, sourceBookmarkIds)))

    // Get source media
    const sourceMedia = await db
      .select()
      .from(bookmarkMedia)
      .where(and(eq(bookmarkMedia.userId, sourceUserId), inArray(bookmarkMedia.bookmarkId, sourceBookmarkIds)))

    // Get source links
    const sourceLinks = await db
      .select()
      .from(bookmarkLinks)
      .where(and(eq(bookmarkLinks.userId, sourceUserId), inArray(bookmarkLinks.bookmarkId, sourceBookmarkIds)))

    // Check which bookmarks the user already has
    const existingBookmarks = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, currentUserId), inArray(bookmarks.id, sourceBookmarkIds)))

    const existingBookmarkIds = new Set(existingBookmarks.map((b) => b.id))

    // Clone bookmarks that don't exist
    const newBookmarks = sourceBookmarks.filter((b) => !existingBookmarkIds.has(b.id))

    if (newBookmarks.length > 0) {
      await db.insert(bookmarks).values(
        newBookmarks.map((b) => ({
          ...b,
          userId: currentUserId,
          source: 'clone' as const,
        }))
      )
    }

    // Clone media for new bookmarks
    const newBookmarkIds = new Set(newBookmarks.map((b) => b.id))
    const newMedia = sourceMedia.filter((m) => newBookmarkIds.has(m.bookmarkId))

    if (newMedia.length > 0) {
      await db.insert(bookmarkMedia).values(
        newMedia.map((m) => ({
          ...m,
          userId: currentUserId,
        }))
      )
    }

    // Clone links for new bookmarks
    const newLinks = sourceLinks.filter((l) => newBookmarkIds.has(l.bookmarkId))

    if (newLinks.length > 0) {
      await db.insert(bookmarkLinks).values(
        newLinks.map((l) => ({
          userId: currentUserId,
          bookmarkId: l.bookmarkId,
          originalUrl: l.originalUrl,
          expandedUrl: l.expandedUrl,
          linkType: l.linkType,
          domain: l.domain,
          contentJson: l.contentJson,
          previewTitle: l.previewTitle,
          previewDescription: l.previewDescription,
          previewImageUrl: l.previewImageUrl,
        }))
      )
    }

    // Add tag to all cloned bookmarks (both new and existing)
    const bookmarksToTag = sourceBookmarkIds
    for (const bookmarkId of bookmarksToTag) {
      try {
        await db.insert(bookmarkTags).values({
          userId: currentUserId,
          bookmarkId,
          tag: tagName,
        })
      } catch {
        // Ignore duplicate tag errors
      }
    }

    return NextResponse.json({
      success: true,
      clonedCount: newBookmarks.length,
      taggedCount: bookmarksToTag.length,
    })
  } catch (error) {
    console.error('Error cloning tag:', error)
    return NextResponse.json({ error: 'Failed to clone tag' }, { status: 500 })
  }
}
