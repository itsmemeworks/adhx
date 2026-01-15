import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkLinks, bookmarkTags, bookmarkMedia, readStatus } from '@/lib/db/schema'
import { eq, desc, like, and, or, count, notInArray, inArray, SQL } from 'drizzle-orm'
import { resolveMediaUrl, getShareableUrl, getThumbnailUrl } from '@/lib/media/fxembed'
import { expandUrls } from '@/lib/utils/url-expander'
import { getCurrentUserId } from '@/lib/auth/session'

// GET /api/bookmarks - List bookmarks with filters
export async function GET(request: NextRequest) {
  // Get current user ID for multi-user data isolation
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    // Build where conditions - always filter by userId
    const conditions: SQL[] = [eq(bookmarks.userId, userId)]

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

    // For unread filter, we need to exclude bookmarks that have read status (filtered by userId)
    if (unreadOnly) {
      const readBookmarkIds = await db
        .select({ bookmarkId: readStatus.bookmarkId })
        .from(readStatus)
        .where(eq(readStatus.userId, userId))
      const readIds = readBookmarkIds.map((r) => r.bookmarkId)
      if (readIds.length > 0) {
        conditions.push(notInArray(bookmarks.id, readIds))
      }
    }

    const whereClause = and(...conditions)

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

    // Batch fetch all related data (fixes N+1 query problem)
    const bookmarkIds = results.map((b) => b.id)

    // Fetch all related data in parallel batches instead of per-bookmark
    const [allLinks, allTags, allMedia, allReadStatuses] = bookmarkIds.length > 0
      ? await Promise.all([
          db.select().from(bookmarkLinks).where(and(eq(bookmarkLinks.userId, userId), inArray(bookmarkLinks.bookmarkId, bookmarkIds))),
          db.select().from(bookmarkTags).where(and(eq(bookmarkTags.userId, userId), inArray(bookmarkTags.bookmarkId, bookmarkIds))),
          db.select().from(bookmarkMedia).where(and(eq(bookmarkMedia.userId, userId), inArray(bookmarkMedia.bookmarkId, bookmarkIds))),
          db.select().from(readStatus).where(and(eq(readStatus.userId, userId), inArray(readStatus.bookmarkId, bookmarkIds))),
        ])
      : [[], [], [], []]

    // Group related data by bookmark ID for O(1) lookups
    const linksByBookmark = new Map<string, typeof allLinks>()
    for (const link of allLinks) {
      const existing = linksByBookmark.get(link.bookmarkId) || []
      existing.push(link)
      linksByBookmark.set(link.bookmarkId, existing)
    }

    const tagsByBookmark = new Map<string, string[]>()
    for (const tag of allTags) {
      const existing = tagsByBookmark.get(tag.bookmarkId) || []
      existing.push(tag.tag)
      tagsByBookmark.set(tag.bookmarkId, existing)
    }

    const mediaByBookmark = new Map<string, typeof allMedia>()
    for (const media of allMedia) {
      const existing = mediaByBookmark.get(media.bookmarkId) || []
      existing.push(media)
      mediaByBookmark.set(media.bookmarkId, existing)
    }

    const readStatusMap = new Map(allReadStatuses.map((r) => [r.bookmarkId, r.readAt]))

    // Transform bookmarks with related data (no additional queries)
    const bookmarksWithRelations = results.map((bookmark) => {
      const links = linksByBookmark.get(bookmark.id) || []
      const tags = tagsByBookmark.get(bookmark.id) || []
      const media = mediaByBookmark.get(bookmark.id) || []

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
        tags,
        media: mediaWithUrls,
        isRead,
        readAt,
      }
    })

    // Get unread count for the current filter (without unread filter)
    const baseConditions: SQL[] = [eq(bookmarks.userId, userId)]
    if (category) baseConditions.push(eq(bookmarks.category, category))
    if (author) baseConditions.push(eq(bookmarks.author, author))
    if (search) {
      const searchCondition = or(
        like(bookmarks.text, `%${search}%`),
        like(bookmarks.author, `%${search}%`),
        like(bookmarks.authorName, `%${search}%`)
      )
      if (searchCondition) baseConditions.push(searchCondition)
    }

    const [totalUnfilteredResult] = await db
      .select({ count: count() })
      .from(bookmarks)
      .where(and(...baseConditions))

    const totalUnfiltered = totalUnfilteredResult?.count || 0
    const [readCountResult] = await db.select({ count: count() }).from(readStatus).where(eq(readStatus.userId, userId))
    const unreadCount = totalUnfiltered - (readCountResult?.count || 0)

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
