import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { tagShares, bookmarkTags, bookmarks, bookmarkMedia, oauthTokens } from '@/lib/db/schema'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { resolveMediaUrl, getShareableUrl, getThumbnailUrl } from '@/lib/media/fxembed'

/**
 * GET /api/share/tag/by-name/[username]/[tag]
 * Public access to a shared tag using friendly URL (username + tag name)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string; tag: string }> }
) {
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

    // Find tag share by userId and tag name
    const [share] = await db
      .select()
      .from(tagShares)
      .where(and(eq(tagShares.userId, user.userId), eq(tagShares.tag, tagName)))
      .limit(1)

    if (!share) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    // Check if tag is public
    if (!share.isPublic) {
      return NextResponse.json({ error: 'This tag is private' }, { status: 403 })
    }

    const tagOwnerId = share.userId

    // Get all bookmarks with this tag
    const taggedBookmarkIds = await db
      .select({ bookmarkId: bookmarkTags.bookmarkId })
      .from(bookmarkTags)
      .where(and(eq(bookmarkTags.userId, tagOwnerId), eq(bookmarkTags.tag, tagName)))

    const bookmarkIds = taggedBookmarkIds.map((t) => t.bookmarkId)

    if (bookmarkIds.length === 0) {
      return NextResponse.json({
        tag: tagName,
        username,
        tweets: [],
        tweetCount: 0,
      })
    }

    // Get bookmarks
    const bookmarkResults = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, tagOwnerId), inArray(bookmarks.id, bookmarkIds)))
      .orderBy(desc(bookmarks.processedAt))

    // Get media for all bookmarks
    const mediaResults = await db
      .select()
      .from(bookmarkMedia)
      .where(and(eq(bookmarkMedia.userId, tagOwnerId), inArray(bookmarkMedia.bookmarkId, bookmarkIds)))

    // Build tweet objects with media
    const tweets = bookmarkResults.map((bookmark) => {
      const media = mediaResults
        .filter((m) => m.bookmarkId === bookmark.id)
        .map((m, index) => {
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
            url: resolveMediaUrl(urlOptions),
            thumbnailUrl: getThumbnailUrl({ ...urlOptions, previewUrl: m.previewUrl || undefined }),
            shareUrl: getShareableUrl(urlOptions),
          }
        })

      return {
        id: bookmark.id,
        author: bookmark.author,
        authorName: bookmark.authorName,
        authorProfileImageUrl: bookmark.authorProfileImageUrl,
        text: bookmark.text,
        tweetUrl: bookmark.tweetUrl,
        createdAt: bookmark.createdAt,
        category: bookmark.category,
        media,
      }
    })

    return NextResponse.json({
      tag: tagName,
      username,
      tweets,
      tweetCount: tweets.length,
    })
  } catch (error) {
    console.error('Error fetching shared tag:', error)
    return NextResponse.json({ error: 'Failed to fetch tag' }, { status: 500 })
  }
}
