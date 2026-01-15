import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkLinks, bookmarkMedia, readStatus, syncLogs, bookmarkTags } from '@/lib/db/schema'
import { eq, desc, like, and, or, sql, count, notInArray, inArray, SQL, isNull, isNotNull } from 'drizzle-orm'
import { resolveMediaUrl, getShareableUrl, getThumbnailUrl } from '@/lib/media/fxembed'
import { expandUrls } from '@/lib/utils/url-expander'
import { getCurrentUserId } from '@/lib/auth/session'
import { selectArticleLink, buildArticlePreview, parseArticleContent } from '@/lib/utils/feed-helpers'
import { metrics } from '@/lib/sentry'

export type FilterType = 'all' | 'photos' | 'videos' | 'text' | 'articles' | 'quoted' | 'manual'

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

  const offset = (page - 1) * limit

  try {
    // First, get all bookmark IDs that have media (for filtering) - filtered by userId
    const bookmarksWithMedia = await db
      .selectDistinct({ bookmarkId: bookmarkMedia.bookmarkId })
      .from(bookmarkMedia)
      .where(eq(bookmarkMedia.userId, userId))

    const bookmarkIdsWithMedia = new Set(bookmarksWithMedia.map((b) => b.bookmarkId))

    // Get all media for this user grouped by bookmark
    const allMedia = await db.select().from(bookmarkMedia).where(eq(bookmarkMedia.userId, userId))
    const mediaByBookmark = new Map<string, typeof allMedia>()
    for (const m of allMedia) {
      const existing = mediaByBookmark.get(m.bookmarkId) || []
      existing.push(m)
      mediaByBookmark.set(m.bookmarkId, existing)
    }

    // Get read bookmark IDs for this user
    const readBookmarkIds = await db
      .select({ bookmarkId: readStatus.bookmarkId })
      .from(readStatus)
      .where(eq(readStatus.userId, userId))
    const readIds = new Set(readBookmarkIds.map((r) => r.bookmarkId))

    // Build where conditions
    const conditions: SQL[] = []

    // Filter by user ID for multi-user support (strict check - no null fallback)
    conditions.push(eq(bookmarks.userId, userId))

    // Get all links for this user (needed for search and article detection)
    const allLinks = await db.select().from(bookmarkLinks).where(eq(bookmarkLinks.userId, userId))

    if (search) {
      // Find bookmark IDs that have matching article titles/descriptions
      const matchingArticleBookmarks = allLinks
        .filter((link) =>
          (link.previewTitle && link.previewTitle.toLowerCase().includes(search.toLowerCase())) ||
          (link.previewDescription && link.previewDescription.toLowerCase().includes(search.toLowerCase()))
        )
        .map((link) => link.bookmarkId)

      const searchCondition = matchingArticleBookmarks.length > 0
        ? or(
            like(bookmarks.text, `%${search}%`),
            like(bookmarks.author, `%${search}%`),
            like(bookmarks.authorName, `%${search}%`),
            inArray(bookmarks.id, [...new Set(matchingArticleBookmarks)])
          )
        : or(
            like(bookmarks.text, `%${search}%`),
            like(bookmarks.author, `%${search}%`),
            like(bookmarks.authorName, `%${search}%`)
          )
      if (searchCondition) {
        conditions.push(searchCondition)
      }
    }

    // Tag filter (AND logic - must have ALL specified tags)
    // Use SQL-level filtering instead of loading all tags into memory
    if (tags.length > 0) {
      // Normalize tags to lowercase for case-insensitive matching
      const normalizedTags = tags.map((t) => t.toLowerCase())

      // Use SQL GROUP BY/HAVING to find bookmarks with ALL requested tags
      // This is more efficient than loading all tags into memory
      const matchingBookmarks = await db
        .select({ bookmarkId: bookmarkTags.bookmarkId })
        .from(bookmarkTags)
        .where(and(
          eq(bookmarkTags.userId, userId),
          inArray(bookmarkTags.tag, normalizedTags)
        ))
        .groupBy(bookmarkTags.bookmarkId)
        .having(sql`count(distinct ${bookmarkTags.tag}) = ${normalizedTags.length}`)

      const matchingIds = matchingBookmarks.map((b) => b.bookmarkId)

      if (matchingIds.length > 0) {
        conditions.push(inArray(bookmarks.id, matchingIds))
      } else {
        // No bookmarks have all the requested tags
        return NextResponse.json({
          items: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
          stats: { total: 0, unread: 0 },
        })
      }
    }

    // Tags will be loaded later only for the result set (not all tags upfront)

    // Build linksByBookmarkId and articleBookmarkIds from already-fetched allLinks
    const linksByBookmarkId = new Map<string, typeof allLinks>()
    const articleBookmarkIds = new Set<string>()

    for (const link of allLinks) {
      const existing = linksByBookmarkId.get(link.bookmarkId) || []
      existing.push(link)
      linksByBookmarkId.set(link.bookmarkId, existing)

      // Detect X/Twitter articles by URL pattern
      if (link.expandedUrl?.includes('/article/') || link.expandedUrl?.includes('/i/article/')) {
        articleBookmarkIds.add(link.bookmarkId)
      }
    }

    // Filter by content type
    if (filter === 'photos') {
      // Only bookmarks with photo media
      const photoBookmarkIds = allMedia
        .filter((m) => m.mediaType === 'photo')
        .map((m) => m.bookmarkId)
      if (photoBookmarkIds.length > 0) {
        conditions.push(inArray(bookmarks.id, [...new Set(photoBookmarkIds)]))
      } else {
        // No photos, return empty
        return NextResponse.json({
          items: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
          stats: { total: 0, unread: 0 },
        })
      }
    } else if (filter === 'videos') {
      // Bookmarks with video or animated_gif
      const videoBookmarkIds = allMedia
        .filter((m) => m.mediaType === 'video' || m.mediaType === 'animated_gif')
        .map((m) => m.bookmarkId)
      if (videoBookmarkIds.length > 0) {
        conditions.push(inArray(bookmarks.id, [...new Set(videoBookmarkIds)]))
      } else {
        return NextResponse.json({
          items: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
          stats: { total: 0, unread: 0 },
        })
      }
    } else if (filter === 'text') {
      // Bookmarks without any media AND not articles
      const idsWithMedia = [...bookmarkIdsWithMedia]
      if (idsWithMedia.length > 0) {
        conditions.push(notInArray(bookmarks.id, idsWithMedia))
      }
      // Also exclude articles from text filter
      const idsWithArticles = [...articleBookmarkIds]
      if (idsWithArticles.length > 0) {
        conditions.push(notInArray(bookmarks.id, idsWithArticles))
      }
      // Exclude bookmarks categorized as 'article'
      conditions.push(or(isNull(bookmarks.category), sql`${bookmarks.category} != 'article'`)!)
    } else if (filter === 'articles') {
      // Bookmarks with category 'article' OR links containing /article/
      const allArticleIds = [...articleBookmarkIds]
      // Also include bookmarks categorized as article (filter by userId)
      const categorizedArticles = await db.select({ id: bookmarks.id }).from(bookmarks).where(and(eq(bookmarks.userId, userId), eq(bookmarks.category, 'article')))
      for (const a of categorizedArticles) {
        allArticleIds.push(a.id)
      }

      if (allArticleIds.length > 0) {
        conditions.push(inArray(bookmarks.id, [...new Set(allArticleIds)]))
      } else {
        return NextResponse.json({
          items: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
          stats: { total: 0, unread: 0 },
        })
      }
    } else if (filter === 'quoted') {
      // Bookmarks that are quoted by another bookmark (have a parent)
      // Find all quotedTweetIds from bookmarks that are quote tweets (filter by userId)
      const quotedBookmarkIds = await db
        .selectDistinct({ quotedId: bookmarks.quotedTweetId })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), isNotNull(bookmarks.quotedTweetId)))

      const quotedIds = quotedBookmarkIds.map((r) => r.quotedId).filter(Boolean) as string[]
      if (quotedIds.length > 0) {
        conditions.push(inArray(bookmarks.id, [...new Set(quotedIds)]))
      } else {
        return NextResponse.json({
          items: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
          stats: { total: 0, unread: 0 },
        })
      }
    } else if (filter === 'manual') {
      // Bookmarks added manually via URL prefix or manual add
      conditions.push(
        or(
          eq(bookmarks.source, 'manual'),
          eq(bookmarks.source, 'url_prefix')
        )!
      )
    }

    // Unread filter
    if (unreadOnly && readIds.size > 0) {
      conditions.push(notInArray(bookmarks.id, [...readIds]))
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // Get total count for current filter
    const [totalResult] = await db
      .select({ count: count() })
      .from(bookmarks)
      .where(whereClause)

    const total = totalResult?.count || 0

    // Get bookmarks with pagination, ordered by processedAt (most recent first)
    const results = await db
      .select()
      .from(bookmarks)
      .where(whereClause)
      .orderBy(desc(bookmarks.processedAt))
      .limit(limit)
      .offset(offset)

    // Get links and tags for returned bookmarks (filter by userId)
    // This loads data only for the result set, not all bookmarks
    const bookmarkIds = results.map((b) => b.id)
    const [links, resultTags] = bookmarkIds.length > 0
      ? await Promise.all([
          db.select().from(bookmarkLinks).where(and(eq(bookmarkLinks.userId, userId), inArray(bookmarkLinks.bookmarkId, bookmarkIds))),
          db.select().from(bookmarkTags).where(and(eq(bookmarkTags.userId, userId), inArray(bookmarkTags.bookmarkId, bookmarkIds))),
        ])
      : [[], []]

    const linksByBookmark = new Map<string, typeof links>()
    for (const link of links) {
      const existing = linksByBookmark.get(link.bookmarkId) || []
      existing.push(link)
      linksByBookmark.set(link.bookmarkId, existing)
    }

    // Build tags map from result set only (not all tags)
    const tagsByBookmark = new Map<string, string[]>()
    for (const t of resultTags) {
      const existing = tagsByBookmark.get(t.bookmarkId) || []
      existing.push(t.tag)
      tagsByBookmark.set(t.bookmarkId, existing)
    }

    // Define the feed item type for explicit return type
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
      parentTweets: FeedItemResponse[] | null // Tweets that quote this one (for reverse navigation)
    }

    // Helper function to build a FeedItem from a bookmark
    function buildFeedItem(bookmark: typeof results[0], bookmarkLinks: typeof links, _isQuotedTweet = false): FeedItemResponse {
      const media = mediaByBookmark.get(bookmark.id) || []
      const isRead = readIds.has(bookmark.id)

      // Check if this is an X/Twitter article by URL pattern
      const isXArticle = articleBookmarkIds.has(bookmark.id)

      // Build media with FxEmbed URLs
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
      const expandedText = bookmark.text ? expandUrls(bookmark.text, bookmarkLinks) : bookmark.text

      // Parse quote context if exists (for backwards compatibility)
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
        articlePreview = buildArticlePreview(articleLink, isXArticle)
        articleContent = parseArticleContent(articleLink.contentJson)
      } else if (isXArticle) {
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

      const effectiveCategory = isXArticle ? 'article' : bookmark.category

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
        quotedTweet: null as FeedItemResponse | null, // Will be populated below
        isRetweet: bookmark.isRetweet,
        retweetContext,
        media: mediaWithUrls.length > 0 ? mediaWithUrls : null,
        links: bookmarkLinks.length > 0 ? bookmarkLinks : null,
        articlePreview,
        articleContent,
        isXArticle,
        tags: tagsByBookmark.get(bookmark.id) || [],
        parentTweets: null as FeedItemResponse[] | null, // Will be populated below
      }
    }

    // Build feed items
    const items = results.map((bookmark) => {
      const bookmarkLinksList = linksByBookmark.get(bookmark.id) || []
      return buildFeedItem(bookmark, bookmarkLinksList)
    })

    // Fetch quoted tweets for items that have quotedTweetId
    const quotedTweetIds = items
      .filter((item) => item.quotedTweetId)
      .map((item) => item.quotedTweetId!)

    if (quotedTweetIds.length > 0) {
      // Fetch quoted bookmarks (filter by userId)
      const quotedBookmarks = await db
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.id, quotedTweetIds)))

      // Get media for quoted bookmarks (filter by userId)
      const quotedMedia = await db
        .select()
        .from(bookmarkMedia)
        .where(and(eq(bookmarkMedia.userId, userId), inArray(bookmarkMedia.bookmarkId, quotedTweetIds)))

      for (const qm of quotedMedia) {
        const existing = mediaByBookmark.get(qm.bookmarkId) || []
        existing.push(qm)
        mediaByBookmark.set(qm.bookmarkId, existing)
      }

      // Get links for quoted bookmarks (filter by userId)
      const quotedLinks = await db
        .select()
        .from(bookmarkLinks)
        .where(and(eq(bookmarkLinks.userId, userId), inArray(bookmarkLinks.bookmarkId, quotedTweetIds)))

      const quotedLinksByBookmark = new Map<string, typeof quotedLinks>()
      for (const ql of quotedLinks) {
        const existing = quotedLinksByBookmark.get(ql.bookmarkId) || []
        existing.push(ql)
        quotedLinksByBookmark.set(ql.bookmarkId, existing)

        // Also check if these are articles
        if (ql.expandedUrl?.includes('/article/') || ql.expandedUrl?.includes('/i/article/')) {
          articleBookmarkIds.add(ql.bookmarkId)
        }
      }

      // Build quoted tweet FeedItems and attach to parent items
      const quotedItemMap = new Map<string, FeedItemResponse>()
      for (const qb of quotedBookmarks) {
        const qLinks = quotedLinksByBookmark.get(qb.id) || []
        quotedItemMap.set(qb.id, buildFeedItem(qb, qLinks, true))
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
    if (itemIds.length > 0) {
      // Find bookmarks that quote any of our current items (filter by userId)
      const parentBookmarks = await db
        .select()
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), inArray(bookmarks.quotedTweetId, itemIds)))

      if (parentBookmarks.length > 0) {
        // Get media for parent bookmarks (filter by userId)
        const parentIds = parentBookmarks.map((p) => p.id)
        const parentMedia = await db
          .select()
          .from(bookmarkMedia)
          .where(and(eq(bookmarkMedia.userId, userId), inArray(bookmarkMedia.bookmarkId, parentIds)))

        for (const pm of parentMedia) {
          const existing = mediaByBookmark.get(pm.bookmarkId) || []
          existing.push(pm)
          mediaByBookmark.set(pm.bookmarkId, existing)
        }

        // Get links for parent bookmarks (filter by userId)
        const parentLinks = await db
          .select()
          .from(bookmarkLinks)
          .where(and(eq(bookmarkLinks.userId, userId), inArray(bookmarkLinks.bookmarkId, parentIds)))

        const parentLinksByBookmark = new Map<string, typeof parentLinks>()
        for (const pl of parentLinks) {
          const existing = parentLinksByBookmark.get(pl.bookmarkId) || []
          existing.push(pl)
          parentLinksByBookmark.set(pl.bookmarkId, existing)
        }

        // Build parent items and group by quotedTweetId
        const parentsByQuotedId = new Map<string, FeedItemResponse[]>()
        for (const pb of parentBookmarks) {
          if (!pb.quotedTweetId) continue
          const pLinks = parentLinksByBookmark.get(pb.id) || []
          const parentItem = buildFeedItem(pb, pLinks, true)
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
    }

    // Get global stats (filtered by user - strict check)
    const [totalBookmarks] = await db.select({ count: count() }).from(bookmarks).where(eq(bookmarks.userId, userId))
    const totalCount = totalBookmarks?.count || 0
    const unreadCount = totalCount - readIds.size

    // Get last sync timestamp for "new" indicator (filtered by user - strict check)
    const [lastSync] = await db
      .select({ startedAt: syncLogs.startedAt })
      .from(syncLogs)
      .where(and(eq(syncLogs.status, 'completed'), eq(syncLogs.userId, userId)))
      .orderBy(desc(syncLogs.startedAt))
      .limit(1)

    // Track feed metrics
    metrics.feedLoaded(items.length, filter !== 'all' ? filter : undefined)
    if (search) {
      metrics.feedSearched(items.length > 0, items.length)
    }
    if (filter !== 'all') {
      metrics.feedFiltered(filter)
    }
    // Track daily active users
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
      lastSyncAt: lastSync?.startedAt || null,
    })
  } catch (error) {
    console.error('Error fetching feed:', error)
    return NextResponse.json(
      { error: 'Failed to fetch feed' },
      { status: 500 }
    )
  }
}
