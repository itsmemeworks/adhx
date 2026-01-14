import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkLinks, bookmarkTags, bookmarkMedia, readStatus } from '@/lib/db/schema'
import { eq, desc, like, and, or, count, notInArray, inArray, SQL } from 'drizzle-orm'
import { resolveMediaUrl, getShareableUrl, getThumbnailUrl } from '@/lib/media/fxembed'
import { expandUrls } from '@/lib/utils/url-expander'

// GET /api/bookmarks - List bookmarks with filters
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  // Parse query parameters
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
  const category = searchParams.get('category')
  const author = searchParams.get('author')
  const search = searchParams.get('search')
  const unreadOnly = searchParams.get('unreadOnly') === 'true'

  const offset = (page - 1) * limit

  try {
    // Build where conditions
    const conditions: SQL[] = []

    if (category) {
      conditions.push(eq(bookmarks.category, category))
    }

    if (author) {
      conditions.push(eq(bookmarks.author, author))
    }

    if (search) {
      const searchCondition = or(
        like(bookmarks.text, `%${search}%`),
        like(bookmarks.author, `%${search}%`),
        like(bookmarks.authorName, `%${search}%`)
      )
      if (searchCondition) {
        conditions.push(searchCondition)
      }
    }

    // For unread filter, we need to exclude bookmarks that have read status
    if (unreadOnly) {
      const readBookmarkIds = await db
        .select({ bookmarkId: readStatus.bookmarkId })
        .from(readStatus)
      const readIds = readBookmarkIds.map((r) => r.bookmarkId)
      if (readIds.length > 0) {
        conditions.push(notInArray(bookmarks.id, readIds))
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // Get total count
    const [totalResult] = await db
      .select({ count: count() })
      .from(bookmarks)
      .where(whereClause)

    const total = totalResult?.count || 0

    // Get bookmarks with pagination
    const results = await db
      .select()
      .from(bookmarks)
      .where(whereClause)
      .orderBy(desc(bookmarks.processedAt))
      .limit(limit)
      .offset(offset)

    // Get read status for all returned bookmarks
    const bookmarkIds = results.map((b) => b.id)
    const readStatuses = bookmarkIds.length > 0
      ? await db.select().from(readStatus).where(inArray(readStatus.bookmarkId, bookmarkIds))
      : []
    const readStatusMap = new Map(readStatuses.map((r) => [r.bookmarkId, r.readAt]))

    // Get links, tags, and media for each bookmark
    const bookmarksWithRelations = await Promise.all(
      results.map(async (bookmark) => {
        const [links, tags, media] = await Promise.all([
          db.select().from(bookmarkLinks).where(eq(bookmarkLinks.bookmarkId, bookmark.id)),
          db.select().from(bookmarkTags).where(eq(bookmarkTags.bookmarkId, bookmark.id)),
          db.select().from(bookmarkMedia).where(eq(bookmarkMedia.bookmarkId, bookmark.id)),
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

        const isRead = readStatusMap.has(bookmark.id)
        const readAt = readStatusMap.get(bookmark.id) || null

        // Expand t.co URLs in the text
        const expandedText = expandUrls(bookmark.text, links)

        return {
          ...bookmark,
          text: expandedText,
          links,
          tags: tags.map((t) => t.tag),
          media: mediaWithUrls,
          isRead,
          readAt,
        }
      })
    )

    // Get unread count for the current filter (without unread filter)
    const unreadConditions = conditions.filter((c) => c !== conditions[conditions.length - 1] || !unreadOnly)
    const [unreadResult] = await db
      .select({ count: count() })
      .from(bookmarks)
      .where(unreadConditions.length > 0 ? and(...unreadConditions) : undefined)

    const totalUnfiltered = unreadResult?.count || 0
    const readCount = await db.select({ count: count() }).from(readStatus)
    const unreadCount = totalUnfiltered - (readCount[0]?.count || 0)

    return NextResponse.json({
      bookmarks: bookmarksWithRelations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        unreadCount: Math.max(0, unreadCount),
      },
    })
  } catch (error) {
    console.error('Error fetching bookmarks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch bookmarks' },
      { status: 500 }
    )
  }
}
