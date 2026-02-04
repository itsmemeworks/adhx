import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkLinks, bookmarkMedia, readStatus, syncLogs, bookmarkTags, collectionTweets } from '@/lib/db/schema'
import { eq, desc, like, and, or, sql, count, inArray, SQL, isNull } from 'drizzle-orm'
import { resolveMediaUrl, getShareableUrl, getThumbnailUrl } from '@/lib/media/fxembed'
import { expandUrls } from '@/lib/utils/url-expander'
import { getCurrentUserId } from '@/lib/auth/session'
import { selectArticleLink, buildArticlePreview, parseArticleContent } from '@/lib/utils/feed-helpers'
import { metrics, captureException } from '@/lib/sentry'

export type FilterType = 'all' | 'photos' | 'videos' | 'text' | 'articles' | 'quoted' | 'manual'

/**
 * Escape LIKE pattern metacharacters to prevent injection.
 * SQLite LIKE uses % (any chars) and _ (single char) as wildcards.
 */
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

// GET /api/feed - Unified feed for gallery view
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  // Get current user ID for multi-user data isolation
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse query parameters
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const filter = (searchParams.get('filter') || 'all') as FilterType
  const unreadOnly = searchParams.get('unreadOnly') !== 'false' // Default to true
  const search = searchParams.get('search')
  const tags = searchParams.getAll('tag') // Multiple tags via ?tag=foo&tag=bar
  const collectionId = searchParams.get('collection') // Filter by collection

  const offset = (page - 1) * limit

  try {
    // Build where conditions using SQL subqueries instead of loading all data
    const conditions: SQL[] = []

    // Filter by user ID for multi-user support
    conditions.push(eq(bookmarks.userId, userId))

    // Search filter - use SQL for efficiency
    if (search) {
      const safeSearch = escapeLikePattern(search)

      // Subquery: Find bookmark IDs with matching article titles/descriptions
      const articleMatchSubquery = sql`(
        SELECT DISTINCT ${bookmarkLinks.bookmarkId}
        FROM ${bookmarkLinks}
        WHERE ${bookmarkLinks.userId} = ${userId}
        AND (
          LOWER(${bookmarkLinks.previewTitle}) LIKE LOWER(${'%' + safeSearch + '%'})
          OR LOWER(${bookmarkLinks.previewDescription}) LIKE LOWER(${'%' + safeSearch + '%'})
        )
      )`

      conditions.push(
        or(
          like(bookmarks.text, `%${safeSearch}%`),
          like(bookmarks.author, `%${safeSearch}%`),
          like(bookmarks.authorName, `%${safeSearch}%`),
          sql`${bookmarks.id} IN ${articleMatchSubquery}`
        )!
      )
    }

    // Tag filter (AND logic - must have ALL specified tags)
    if (tags.length > 0) {
      const normalizedTags = tags.map((t) => t.toLowerCase())

      // Subquery: Find bookmarks with ALL requested tags using GROUP BY/HAVING
      const tagMatchSubquery = sql`(
        SELECT ${bookmarkTags.bookmarkId}
        FROM ${bookmarkTags}
        WHERE ${bookmarkTags.userId} = ${userId}
        AND ${bookmarkTags.tag} IN ${normalizedTags}
        GROUP BY ${bookmarkTags.bookmarkId}
        HAVING COUNT(DISTINCT ${bookmarkTags.tag}) = ${normalizedTags.length}
      )`

      conditions.push(sql`${bookmarks.id} IN ${tagMatchSubquery}`)
    }

    // Collection filter
    if (collectionId) {
      const collectionSubquery = sql`(
        SELECT ${collectionTweets.bookmarkId}
        FROM ${collectionTweets}
        WHERE ${collectionTweets.userId} = ${userId}
        AND ${collectionTweets.collectionId} = ${collectionId}
      )`
      conditions.push(sql`${bookmarks.id} IN ${collectionSubquery}`)
    }

    // Media type filters using subqueries
    if (filter === 'photos') {
      const photoSubquery = sql`(
        SELECT DISTINCT ${bookmarkMedia.bookmarkId}
        FROM ${bookmarkMedia}
        WHERE ${bookmarkMedia.userId} = ${userId}
        AND ${bookmarkMedia.mediaType} = 'photo'
      )`
      conditions.push(sql`${bookmarks.id} IN ${photoSubquery}`)
    } else if (filter === 'videos') {
      const videoSubquery = sql`(
        SELECT DISTINCT ${bookmarkMedia.bookmarkId}
        FROM ${bookmarkMedia}
        WHERE ${bookmarkMedia.userId} = ${userId}
        AND ${bookmarkMedia.mediaType} IN ('video', 'animated_gif')
      )`
      conditions.push(sql`${bookmarks.id} IN ${videoSubquery}`)
    } else if (filter === 'text') {
      // Bookmarks WITHOUT media AND not articles
      const mediaSubquery = sql`(
        SELECT DISTINCT ${bookmarkMedia.bookmarkId}
        FROM ${bookmarkMedia}
        WHERE ${bookmarkMedia.userId} = ${userId}
      )`
      const articleSubquery = sql`(
        SELECT DISTINCT ${bookmarkLinks.bookmarkId}
        FROM ${bookmarkLinks}
        WHERE ${bookmarkLinks.userId} = ${userId}
        AND (${bookmarkLinks.expandedUrl} LIKE '%/article/%' OR ${bookmarkLinks.expandedUrl} LIKE '%/i/article/%')
      )`
      conditions.push(sql`${bookmarks.id} NOT IN ${mediaSubquery}`)
      conditions.push(sql`${bookmarks.id} NOT IN ${articleSubquery}`)
      conditions.push(or(isNull(bookmarks.category), sql`${bookmarks.category} != 'article'`)!)
    } else if (filter === 'articles') {
      // Bookmarks with category 'article' OR links containing /article/
      const articleSubquery = sql`(
        SELECT DISTINCT ${bookmarkLinks.bookmarkId}
        FROM ${bookmarkLinks}
        WHERE ${bookmarkLinks.userId} = ${userId}
        AND (${bookmarkLinks.expandedUrl} LIKE '%/article/%' OR ${bookmarkLinks.expandedUrl} LIKE '%/i/article/%')
      )`
      conditions.push(
        or(
          eq(bookmarks.category, 'article'),
          sql`${bookmarks.id} IN ${articleSubquery}`
        )!
      )
    } else if (filter === 'quoted') {
      // Bookmarks that are quoted by another bookmark
      const quotedSubquery = sql`(
        SELECT DISTINCT ${bookmarks.quotedTweetId}
        FROM ${bookmarks}
        WHERE ${bookmarks.userId} = ${userId}
        AND ${bookmarks.quotedTweetId} IS NOT NULL
      )`
      conditions.push(sql`${bookmarks.id} IN ${quotedSubquery}`)
    } else if (filter === 'manual') {
      conditions.push(
        or(
          eq(bookmarks.source, 'manual'),
          eq(bookmarks.source, 'url_prefix')
        )!
      )
    }

    // Unread filter using subquery
    if (unreadOnly) {
      const readSubquery = sql`(
        SELECT ${readStatus.bookmarkId}
        FROM ${readStatus}
        WHERE ${readStatus.userId} = ${userId}
      )`
      conditions.push(sql`${bookmarks.id} NOT IN ${readSubquery}`)
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // Get total count and paginated results in parallel
    const [totalResult, results] = await Promise.all([
      db.select({ count: count() }).from(bookmarks).where(whereClause),
      db.select().from(bookmarks).where(whereClause).orderBy(desc(bookmarks.processedAt)).limit(limit).offset(offset),
    ])

    const total = totalResult[0]?.count || 0

    // Early return if no results
    if (results.length === 0) {
      // Get global stats for empty result
      const [totalBookmarks, readCount] = await Promise.all([
        db.select({ count: count() }).from(bookmarks).where(eq(bookmarks.userId, userId)),
        db.select({ count: count() }).from(readStatus).where(eq(readStatus.userId, userId)),
      ])
      const totalCount = totalBookmarks[0]?.count || 0
      const unreadCount = totalCount - (readCount[0]?.count || 0)

      return NextResponse.json({
        items: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        stats: { total: totalCount, unread: Math.max(0, unreadCount) },
        lastSyncAt: null,
      })
    }

    // Get IDs for batch fetching
    const bookmarkIds = results.map((b) => b.id)

    // Batch fetch all related data for result set only (not ALL user data)
    const [media, links, resultTags, readStatusRecords] = await Promise.all([
      db.select().from(bookmarkMedia).where(and(eq(bookmarkMedia.userId, userId), inArray(bookmarkMedia.bookmarkId, bookmarkIds))),
      db.select().from(bookmarkLinks).where(and(eq(bookmarkLinks.userId, userId), inArray(bookmarkLinks.bookmarkId, bookmarkIds))),
      db.select().from(bookmarkTags).where(and(eq(bookmarkTags.userId, userId), inArray(bookmarkTags.bookmarkId, bookmarkIds))),
      db.select({ bookmarkId: readStatus.bookmarkId }).from(readStatus).where(and(eq(readStatus.userId, userId), inArray(readStatus.bookmarkId, bookmarkIds))),
    ])

    // Build lookup maps
    const mediaByBookmark = new Map<string, typeof media>()
    for (const m of media) {
      const existing = mediaByBookmark.get(m.bookmarkId) || []
      existing.push(m)
      mediaByBookmark.set(m.bookmarkId, existing)
    }

    const linksByBookmark = new Map<string, typeof links>()
    const articleBookmarkIds = new Set<string>()
    for (const link of links) {
      const existing = linksByBookmark.get(link.bookmarkId) || []
      existing.push(link)
      linksByBookmark.set(link.bookmarkId, existing)
      if (link.expandedUrl?.includes('/article/') || link.expandedUrl?.includes('/i/article/')) {
        articleBookmarkIds.add(link.bookmarkId)
      }
    }

    const tagsByBookmark = new Map<string, string[]>()
    for (const t of resultTags) {
      const existing = tagsByBookmark.get(t.bookmarkId) || []
      existing.push(t.tag)
      tagsByBookmark.set(t.bookmarkId, existing)
    }

    const readIds = new Set(readStatusRecords.map((r) => r.bookmarkId))

    // Define the feed item type
    type FeedItemResponse = {
      id: string
      author: string
      authorName: string | null
      authorProfileImageUrl: string | null
      text: string
      tweetUrl: string
      createdAt: string | null
      processedAt: string
      category: string | null
      isRead: boolean
      isQuote: boolean | null
      quoteContext: unknown
      quotedTweetId: string | null
      quotedTweet: FeedItemResponse | null
      isRetweet: boolean | null
      retweetContext: unknown
      media: Array<{
        id: string
        mediaType: string
        width: number | null
        height: number | null
        durationMs: number | null
        altText: string | null
        url: string
        thumbnailUrl: string
        shareUrl: string
      }> | null
      links: typeof links | null
      articlePreview: {
        title: string | null
        description: string | null
        imageUrl: string | null
        url: string
        domain: string | null
        isXArticle?: boolean
      } | null
      articleContent: unknown
      isXArticle: boolean
      tags: string[]
      parentTweets: FeedItemResponse[] | null
      summary: string | null
    }

    // Helper function to build a FeedItem
    function buildFeedItem(
      bookmark: typeof results[0],
      bookmarkLinks: typeof links,
      bookmarkMedia: typeof media,
      bookmarkTags: string[],
      isRead: boolean,
      isArticle: boolean
    ): FeedItemResponse {
      // Build media with FxEmbed URLs
      const mediaWithUrls = bookmarkMedia.map((m, index) => {
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
      const expandedText = bookmark.text ? expandUrls(bookmark.text, bookmarkLinks) : bookmark.text

      // Parse quote context if exists
      let quoteContext = null
      if (bookmark.isQuote && bookmark.quoteContext) {
        try {
          quoteContext = JSON.parse(bookmark.quoteContext)
        } catch {
          // Ignore parse errors
        }
      }

      // Parse retweet context if exists
      let retweetContext = null
      if (bookmark.isRetweet && bookmark.retweetContext) {
        try {
          retweetContext = JSON.parse(bookmark.retweetContext)
        } catch {
          // Ignore parse errors
        }
      }

      // Get article preview and content from links
      let articlePreview = null
      let articleContent = null

      const articleLink = selectArticleLink(bookmarkLinks)

      if (articleLink) {
        articlePreview = buildArticlePreview(articleLink, isArticle)
        articleContent = parseArticleContent(articleLink.contentJson)
      } else if (isArticle) {
        const correctArticleUrl = `https://x.com/${bookmark.author}/article/${bookmark.id}`
        articlePreview = {
          title: `Article by @${bookmark.author}`,
          description: null,
          imageUrl: null,
          url: correctArticleUrl,
          domain: 'x.com',
          isXArticle: true,
        }
      }

      const effectiveCategory = isArticle ? 'article' : bookmark.category

      return {
        id: bookmark.id,
        author: bookmark.author,
        authorName: bookmark.authorName,
        authorProfileImageUrl: bookmark.authorProfileImageUrl,
        text: expandedText,
        tweetUrl: bookmark.tweetUrl,
        createdAt: bookmark.createdAt,
        processedAt: bookmark.processedAt,
        category: effectiveCategory,
        isRead,
        isQuote: bookmark.isQuote,
        quoteContext,
        quotedTweetId: bookmark.quotedTweetId,
        quotedTweet: null,
        isRetweet: bookmark.isRetweet,
        retweetContext,
        media: mediaWithUrls.length > 0 ? mediaWithUrls : null,
        links: bookmarkLinks.length > 0 ? bookmarkLinks : null,
        articlePreview,
        articleContent,
        isXArticle: isArticle,
        tags: bookmarkTags,
        parentTweets: null,
        summary: bookmark.summary,
      }
    }

    // Build feed items
    const items = results.map((bookmark) => {
      return buildFeedItem(
        bookmark,
        linksByBookmark.get(bookmark.id) || [],
        mediaByBookmark.get(bookmark.id) || [],
        tagsByBookmark.get(bookmark.id) || [],
        readIds.has(bookmark.id),
        articleBookmarkIds.has(bookmark.id)
      )
    })

    // Fetch quoted tweets for items that have quotedTweetId
    const quotedTweetIds = items
      .filter((item) => item.quotedTweetId)
      .map((item) => item.quotedTweetId!)
      .filter((id) => !bookmarkIds.includes(id)) // Don't refetch if already in result set

    if (quotedTweetIds.length > 0) {
      // Fetch quoted bookmarks, media, links, and tags in parallel
      const [quotedBookmarks, quotedMedia, quotedLinks, quotedTags, quotedRead] = await Promise.all([
        db.select().from(bookmarks).where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, quotedTweetIds))),
        db.select().from(bookmarkMedia).where(and(eq(bookmarkMedia.userId, userId), inArray(bookmarkMedia.bookmarkId, quotedTweetIds))),
        db.select().from(bookmarkLinks).where(and(eq(bookmarkLinks.userId, userId), inArray(bookmarkLinks.bookmarkId, quotedTweetIds))),
        db.select().from(bookmarkTags).where(and(eq(bookmarkTags.userId, userId), inArray(bookmarkTags.bookmarkId, quotedTweetIds))),
        db.select({ bookmarkId: readStatus.bookmarkId }).from(readStatus).where(and(eq(readStatus.userId, userId), inArray(readStatus.bookmarkId, quotedTweetIds))),
      ])

      // Build lookup maps for quoted tweets
      const quotedMediaByBookmark = new Map<string, typeof quotedMedia>()
      for (const qm of quotedMedia) {
        const existing = quotedMediaByBookmark.get(qm.bookmarkId) || []
        existing.push(qm)
        quotedMediaByBookmark.set(qm.bookmarkId, existing)
      }

      const quotedLinksByBookmark = new Map<string, typeof quotedLinks>()
      const quotedArticleIds = new Set<string>()
      for (const ql of quotedLinks) {
        const existing = quotedLinksByBookmark.get(ql.bookmarkId) || []
        existing.push(ql)
        quotedLinksByBookmark.set(ql.bookmarkId, existing)
        if (ql.expandedUrl?.includes('/article/') || ql.expandedUrl?.includes('/i/article/')) {
          quotedArticleIds.add(ql.bookmarkId)
        }
      }

      const quotedTagsByBookmark = new Map<string, string[]>()
      for (const qt of quotedTags) {
        const existing = quotedTagsByBookmark.get(qt.bookmarkId) || []
        existing.push(qt.tag)
        quotedTagsByBookmark.set(qt.bookmarkId, existing)
      }

      const quotedReadIds = new Set(quotedRead.map((r) => r.bookmarkId))

      // Build quoted tweet FeedItems
      const quotedItemMap = new Map<string, FeedItemResponse>()
      for (const qb of quotedBookmarks) {
        quotedItemMap.set(qb.id, buildFeedItem(
          qb,
          quotedLinksByBookmark.get(qb.id) || [],
          quotedMediaByBookmark.get(qb.id) || [],
          quotedTagsByBookmark.get(qb.id) || [],
          quotedReadIds.has(qb.id),
          quotedArticleIds.has(qb.id)
        ))
      }

      // Attach quoted tweets to parent items
      for (const item of items) {
        if (item.quotedTweetId && quotedItemMap.has(item.quotedTweetId)) {
          item.quotedTweet = quotedItemMap.get(item.quotedTweetId)!
        }
      }
    }

    // Fetch parent tweets for items that are quoted by other bookmarks
    const itemIds = items.map((item) => item.id)
    const parentBookmarks = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.quotedTweetId, itemIds)))

    if (parentBookmarks.length > 0) {
      const parentIds = parentBookmarks.map((p) => p.id)

      // Fetch related data for parent bookmarks in parallel
      const [parentMedia, parentLinks, parentTags, parentRead] = await Promise.all([
        db.select().from(bookmarkMedia).where(and(eq(bookmarkMedia.userId, userId), inArray(bookmarkMedia.bookmarkId, parentIds))),
        db.select().from(bookmarkLinks).where(and(eq(bookmarkLinks.userId, userId), inArray(bookmarkLinks.bookmarkId, parentIds))),
        db.select().from(bookmarkTags).where(and(eq(bookmarkTags.userId, userId), inArray(bookmarkTags.bookmarkId, parentIds))),
        db.select({ bookmarkId: readStatus.bookmarkId }).from(readStatus).where(and(eq(readStatus.userId, userId), inArray(readStatus.bookmarkId, parentIds))),
      ])

      // Build lookup maps
      const parentMediaByBookmark = new Map<string, typeof parentMedia>()
      for (const pm of parentMedia) {
        const existing = parentMediaByBookmark.get(pm.bookmarkId) || []
        existing.push(pm)
        parentMediaByBookmark.set(pm.bookmarkId, existing)
      }

      const parentLinksByBookmark = new Map<string, typeof parentLinks>()
      const parentArticleIds = new Set<string>()
      for (const pl of parentLinks) {
        const existing = parentLinksByBookmark.get(pl.bookmarkId) || []
        existing.push(pl)
        parentLinksByBookmark.set(pl.bookmarkId, existing)
        if (pl.expandedUrl?.includes('/article/') || pl.expandedUrl?.includes('/i/article/')) {
          parentArticleIds.add(pl.bookmarkId)
        }
      }

      const parentTagsByBookmark = new Map<string, string[]>()
      for (const pt of parentTags) {
        const existing = parentTagsByBookmark.get(pt.bookmarkId) || []
        existing.push(pt.tag)
        parentTagsByBookmark.set(pt.bookmarkId, existing)
      }

      const parentReadIds = new Set(parentRead.map((r) => r.bookmarkId))

      // Build parent items and group by quotedTweetId
      const parentsByQuotedId = new Map<string, FeedItemResponse[]>()
      for (const pb of parentBookmarks) {
        if (!pb.quotedTweetId) continue
        const parentItem = buildFeedItem(
          pb,
          parentLinksByBookmark.get(pb.id) || [],
          parentMediaByBookmark.get(pb.id) || [],
          parentTagsByBookmark.get(pb.id) || [],
          parentReadIds.has(pb.id),
          parentArticleIds.has(pb.id)
        )
        const existing = parentsByQuotedId.get(pb.quotedTweetId) || []
        existing.push(parentItem)
        parentsByQuotedId.set(pb.quotedTweetId, existing)
      }

      // Attach parent tweets to items
      for (const item of items) {
        if (parentsByQuotedId.has(item.id)) {
          item.parentTweets = parentsByQuotedId.get(item.id)!
        }
      }
    }

    // Get global stats
    const [totalBookmarks, readCount, lastSync] = await Promise.all([
      db.select({ count: count() }).from(bookmarks).where(eq(bookmarks.userId, userId)),
      db.select({ count: count() }).from(readStatus).where(eq(readStatus.userId, userId)),
      db.select({ startedAt: syncLogs.startedAt })
        .from(syncLogs)
        .where(and(eq(syncLogs.status, 'completed'), eq(syncLogs.userId, userId)))
        .orderBy(desc(syncLogs.startedAt))
        .limit(1),
    ])

    const totalCount = totalBookmarks[0]?.count || 0
    const unreadCount = totalCount - (readCount[0]?.count || 0)

    // Track feed metrics
    metrics.feedLoaded(items.length, filter !== 'all' ? filter : undefined)
    if (search) {
      metrics.feedSearched(items.length > 0, items.length)
    }
    if (filter !== 'all') {
      metrics.feedFiltered(filter)
    }
    metrics.trackUser(userId)

    return NextResponse.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: totalCount,
        unread: Math.max(0, unreadCount),
      },
      lastSyncAt: lastSync[0]?.startedAt || null,
    })
  } catch (error) {
    console.error('Error fetching feed:', error)
    captureException(error, { endpoint: '/api/feed', userId })
    return NextResponse.json(
      { error: 'Failed to fetch feed' },
      { status: 500 }
    )
  }
}
