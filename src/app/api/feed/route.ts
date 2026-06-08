import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  bookmarks,
  bookmarkLinks,
  bookmarkMedia,
  readStatus,
  syncLogs,
  bookmarkTags,
  collectionTweets,
} from '@/lib/db/schema'
import { eq, desc, asc, like, and, or, sql, count, inArray, SQL, isNull } from 'drizzle-orm'
import { resolveMediaUrl, getShareableUrl, getThumbnailUrl } from '@/lib/media/fxembed'
import { expandUrls } from '@/lib/utils/url-expander'
import {
  selectArticleLink,
  buildArticlePreview,
  parseArticleContent,
} from '@/lib/utils/feed-helpers'
import { metrics } from '@/lib/sentry'
import { withAuth } from '@/lib/api/with-auth'
import { handleRouteError } from '@/lib/api/response'

export type FilterType = 'all' | 'photos' | 'videos' | 'text' | 'articles' | 'quoted' | 'manual'
export type PlatformFilter = 'all' | 'twitter' | 'instagram' | 'tiktok'

/**
 * Escape LIKE pattern metacharacters to prevent injection.
 * SQLite LIKE uses % (any chars) and _ (single char) as wildcards.
 */
function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

// GET /api/feed - Unified feed for gallery view
export const GET = withAuth(async (request: NextRequest, userId) => {
  const searchParams = request.nextUrl.searchParams

  // Parse query parameters
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const filter = (searchParams.get('filter') || 'all') as FilterType
  const unreadOnly = searchParams.get('unreadOnly') !== 'false' // Default to true
  const search = searchParams.get('search')
  const tags = searchParams.getAll('tag') // Multiple tags via ?tag=foo&tag=bar
  const sort = searchParams.get('sort') || 'added' // 'added' or 'posted'
  const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc' // default desc (newest first)
  const collectionId = searchParams.get('collection') // Filter by collection
  const platformFilter = (searchParams.get('platform') || 'all') as PlatformFilter // 'all' | 'twitter' | 'instagram' | 'tiktok'
  // Direct id lookup (?id=...). Returns the specific bookmark(s) regardless of
  // read state / pagination — used to open a saved tweet in triage (e.g. the
  // "View in Collection" action on an already-saved preview).
  const ids = searchParams.getAll('id')

  const offset = (page - 1) * limit

  try {
    // Build where conditions using SQL subqueries instead of loading all data
    const conditions: SQL[] = []

    // Filter by user ID for multi-user support
    conditions.push(eq(bookmarks.userId, userId))

    // Direct id lookup short-circuits the read/pagination filters below.
    if (ids.length > 0) {
      conditions.push(inArray(bookmarks.id, ids))
    }

    // Platform filter (X / Instagram / TikTok / all)
    if (platformFilter !== 'all') {
      conditions.push(eq(bookmarks.platform, platformFilter))
    }

    // Search filter - use SQL for efficiency
    if (search) {
      const safeSearch = escapeLikePattern(search)

      // Subquery: Find (bookmarkId, platform) pairs with matching article titles/descriptions
      const articleMatchSubquery = sql`(
        SELECT DISTINCT ${bookmarkLinks.bookmarkId}, ${bookmarkLinks.platform}
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
          sql`(${bookmarks.id}, ${bookmarks.platform}) IN ${articleMatchSubquery}`,
        )!,
      )
    }

    // Tag filter (AND logic - must have ALL specified tags)
    if (tags.length > 0) {
      const normalizedTags = tags.map((t) => t.toLowerCase())

      const tagMatchSubquery = sql`(
        SELECT ${bookmarkTags.bookmarkId}, ${bookmarkTags.platform}
        FROM ${bookmarkTags}
        WHERE ${bookmarkTags.userId} = ${userId}
        AND ${bookmarkTags.tag} IN ${normalizedTags}
        GROUP BY ${bookmarkTags.bookmarkId}, ${bookmarkTags.platform}
        HAVING COUNT(DISTINCT ${bookmarkTags.tag}) = ${normalizedTags.length}
      )`

      conditions.push(sql`(${bookmarks.id}, ${bookmarks.platform}) IN ${tagMatchSubquery}`)
    }

    // Collection filter
    if (collectionId) {
      const collectionSubquery = sql`(
        SELECT ${collectionTweets.bookmarkId}, ${collectionTweets.platform}
        FROM ${collectionTweets}
        WHERE ${collectionTweets.userId} = ${userId}
        AND ${collectionTweets.collectionId} = ${collectionId}
      )`
      conditions.push(sql`(${bookmarks.id}, ${bookmarks.platform}) IN ${collectionSubquery}`)
    }

    // Media type filters using subqueries (composite key prevents cross-platform id collisions)
    if (filter === 'photos') {
      const photoSubquery = sql`(
        SELECT DISTINCT ${bookmarkMedia.bookmarkId}, ${bookmarkMedia.platform}
        FROM ${bookmarkMedia}
        WHERE ${bookmarkMedia.userId} = ${userId}
        AND ${bookmarkMedia.mediaType} = 'photo'
      )`
      conditions.push(sql`(${bookmarks.id}, ${bookmarks.platform}) IN ${photoSubquery}`)
    } else if (filter === 'videos') {
      const videoSubquery = sql`(
        SELECT DISTINCT ${bookmarkMedia.bookmarkId}, ${bookmarkMedia.platform}
        FROM ${bookmarkMedia}
        WHERE ${bookmarkMedia.userId} = ${userId}
        AND ${bookmarkMedia.mediaType} IN ('video', 'animated_gif')
      )`
      conditions.push(sql`(${bookmarks.id}, ${bookmarks.platform}) IN ${videoSubquery}`)
    } else if (filter === 'text') {
      const mediaSubquery = sql`(
        SELECT DISTINCT ${bookmarkMedia.bookmarkId}, ${bookmarkMedia.platform}
        FROM ${bookmarkMedia}
        WHERE ${bookmarkMedia.userId} = ${userId}
      )`
      const articleSubquery = sql`(
        SELECT DISTINCT ${bookmarkLinks.bookmarkId}, ${bookmarkLinks.platform}
        FROM ${bookmarkLinks}
        WHERE ${bookmarkLinks.userId} = ${userId}
        AND (${bookmarkLinks.expandedUrl} LIKE '%/article/%' OR ${bookmarkLinks.expandedUrl} LIKE '%/i/article/%')
      )`
      conditions.push(sql`(${bookmarks.id}, ${bookmarks.platform}) NOT IN ${mediaSubquery}`)
      conditions.push(sql`(${bookmarks.id}, ${bookmarks.platform}) NOT IN ${articleSubquery}`)
      conditions.push(or(isNull(bookmarks.category), sql`${bookmarks.category} != 'article'`)!)
    } else if (filter === 'articles') {
      const articleSubquery = sql`(
        SELECT DISTINCT ${bookmarkLinks.bookmarkId}, ${bookmarkLinks.platform}
        FROM ${bookmarkLinks}
        WHERE ${bookmarkLinks.userId} = ${userId}
        AND (${bookmarkLinks.expandedUrl} LIKE '%/article/%' OR ${bookmarkLinks.expandedUrl} LIKE '%/i/article/%')
      )`
      conditions.push(
        or(
          eq(bookmarks.category, 'article'),
          sql`(${bookmarks.id}, ${bookmarks.platform}) IN ${articleSubquery}`,
        )!,
      )
    } else if (filter === 'quoted') {
      // Quote relations are Twitter-only — quotedTweetId always references a tweet
      const quotedSubquery = sql`(
        SELECT DISTINCT ${bookmarks.quotedTweetId}
        FROM ${bookmarks}
        WHERE ${bookmarks.userId} = ${userId}
        AND ${bookmarks.quotedTweetId} IS NOT NULL
      )`
      conditions.push(sql`${bookmarks.id} IN ${quotedSubquery}`)
      conditions.push(eq(bookmarks.platform, 'twitter'))
    } else if (filter === 'manual') {
      conditions.push(or(eq(bookmarks.source, 'manual'), eq(bookmarks.source, 'url_prefix'))!)
    }

    // Unread filter — composite key (bookmarkId, platform) matches read_status PK.
    // Skipped for direct id lookups so an already-read tweet still resolves.
    if (unreadOnly && ids.length === 0) {
      const readSubquery = sql`(
        SELECT ${readStatus.bookmarkId}, ${readStatus.platform}
        FROM ${readStatus}
        WHERE ${readStatus.userId} = ${userId}
      )`
      conditions.push(sql`(${bookmarks.id}, ${bookmarks.platform}) NOT IN ${readSubquery}`)
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    // Get total count and paginated results in parallel
    const [totalResult, results] = await Promise.all([
      db.select({ count: count() }).from(bookmarks).where(whereClause),
      db
        .select()
        .from(bookmarks)
        .where(whereClause)
        .orderBy(
          (sortDir === 'asc' ? asc : desc)(
            sort === 'posted' ? bookmarks.createdAt : bookmarks.processedAt,
          ),
        )
        .limit(limit)
        .offset(offset),
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

    // Composite lookup key (platform + id) prevents collisions across platforms
    const compositeKey = (platform: string, id: string) => `${platform}:${id}`

    // Batch fetch all related data for result set only (not ALL user data)
    const [media, links, resultTags, readStatusRecords] = await Promise.all([
      db
        .select()
        .from(bookmarkMedia)
        .where(
          and(eq(bookmarkMedia.userId, userId), inArray(bookmarkMedia.bookmarkId, bookmarkIds)),
        ),
      db
        .select()
        .from(bookmarkLinks)
        .where(
          and(eq(bookmarkLinks.userId, userId), inArray(bookmarkLinks.bookmarkId, bookmarkIds)),
        ),
      db
        .select()
        .from(bookmarkTags)
        .where(and(eq(bookmarkTags.userId, userId), inArray(bookmarkTags.bookmarkId, bookmarkIds))),
      db
        .select({ bookmarkId: readStatus.bookmarkId, platform: readStatus.platform })
        .from(readStatus)
        .where(and(eq(readStatus.userId, userId), inArray(readStatus.bookmarkId, bookmarkIds))),
    ])

    // Build lookup maps keyed by composite (platform + bookmarkId)
    const mediaByBookmark = new Map<string, typeof media>()
    for (const m of media) {
      const key = compositeKey(m.platform, m.bookmarkId)
      const existing = mediaByBookmark.get(key) || []
      existing.push(m)
      mediaByBookmark.set(key, existing)
    }

    const linksByBookmark = new Map<string, typeof links>()
    const articleKeys = new Set<string>()
    for (const link of links) {
      const key = compositeKey(link.platform, link.bookmarkId)
      const existing = linksByBookmark.get(key) || []
      existing.push(link)
      linksByBookmark.set(key, existing)
      if (link.expandedUrl?.includes('/article/') || link.expandedUrl?.includes('/i/article/')) {
        articleKeys.add(key)
      }
    }

    const tagsByBookmark = new Map<string, string[]>()
    for (const t of resultTags) {
      const key = compositeKey(t.platform, t.bookmarkId)
      const existing = tagsByBookmark.get(key) || []
      existing.push(t.tag)
      tagsByBookmark.set(key, existing)
    }

    const readKeys = new Set(readStatusRecords.map((r) => compositeKey(r.platform, r.bookmarkId)))

    // Define the feed item type
    type FeedItemResponse = {
      id: string
      platform: string
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
        originalUrl: string | null
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
      bookmark: (typeof results)[0],
      bookmarkLinks: typeof links,
      bookmarkMedia: typeof media,
      bookmarkTags: string[],
      isRead: boolean,
      isArticle: boolean,
    ): FeedItemResponse {
      // Build media URLs — platform-aware. Twitter uses FxEmbed; Instagram and
      // TikTok stream through our own proxy routes (CDN URLs require referer/sig
      // headers that only the proxy adds).
      const mediaWithUrls = bookmarkMedia.map((m, index) => {
        const mediaType = m.mediaType as 'photo' | 'video' | 'animated_gif'

        if (bookmark.platform === 'instagram') {
          // Reels play inline via the IG video proxy (mirror registry), keyed by
          // the reel id; the thumbnail proxy re-resolves the signed CDN poster
          // fresh per view. A row still typed 'photo' (a rare photo post, or
          // pre-backfill) renders as a poster + link-out instead of a player.
          const thumbnailUrl = `/api/media/instagram/thumbnail?id=${encodeURIComponent(bookmark.id)}`
          const isVideo = m.mediaType === 'video'
          const streamUrl = `/api/media/instagram/video?id=${encodeURIComponent(bookmark.id)}`
          const downloadUrl = `/api/media/instagram/video/download?id=${encodeURIComponent(bookmark.id)}`
          return {
            id: m.id,
            mediaType: m.mediaType,
            width: m.width,
            height: m.height,
            durationMs: isVideo ? m.durationMs : null,
            altText: m.altText,
            url: isVideo ? streamUrl : thumbnailUrl,
            thumbnailUrl,
            shareUrl: isVideo ? downloadUrl : bookmark.tweetUrl,
            originalUrl: null,
          }
        }

        if (bookmark.platform === 'tiktok') {
          const streamUrl = `/api/media/tiktok/video?username=${encodeURIComponent(bookmark.author)}&id=${encodeURIComponent(bookmark.id)}`
          const downloadUrl = `/api/media/tiktok/video/download?username=${encodeURIComponent(bookmark.author)}&id=${encodeURIComponent(bookmark.id)}`
          const thumbnailUrl = `/api/media/tiktok/thumbnail?username=${encodeURIComponent(bookmark.author)}&id=${encodeURIComponent(bookmark.id)}`
          return {
            id: m.id,
            mediaType: m.mediaType,
            width: m.width,
            height: m.height,
            durationMs: m.durationMs,
            altText: m.altText,
            url: streamUrl,
            thumbnailUrl,
            shareUrl: downloadUrl,
            originalUrl: null,
          }
        }

        if (bookmark.platform === 'youtube') {
          // Playback is the official iframe embed (handled in MediaCard by
          // platform+id); the gallery just needs the poster + a 'video' type.
          return {
            id: m.id,
            mediaType: 'video' as const,
            width: m.width,
            height: m.height,
            durationMs: m.durationMs,
            altText: m.altText,
            url: `https://www.youtube.com/shorts/${bookmark.id}`,
            thumbnailUrl: `https://i.ytimg.com/vi/${bookmark.id}/hqdefault.jpg`,
            shareUrl: `https://www.youtube.com/shorts/${bookmark.id}`,
            originalUrl: null,
          }
        }

        // Twitter / default — existing FxEmbed flow
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
          originalUrl: m.originalUrl ?? null,
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
        platform: bookmark.platform,
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

    // Build feed items (keyed by composite platform+id)
    const items = results.map((bookmark) => {
      const key = compositeKey(bookmark.platform, bookmark.id)
      return buildFeedItem(
        bookmark,
        linksByBookmark.get(key) || [],
        mediaByBookmark.get(key) || [],
        tagsByBookmark.get(key) || [],
        readKeys.has(key),
        articleKeys.has(key),
      )
    })

    // Fetch quoted tweets for items that have quotedTweetId
    const quotedTweetIds = items
      .filter((item) => item.quotedTweetId)
      .map((item) => item.quotedTweetId!)
      .filter((id) => !bookmarkIds.includes(id)) // Don't refetch if already in result set

    if (quotedTweetIds.length > 0) {
      // Quotes are Twitter-only (quotedTweetId always references a tweet)
      const [quotedBookmarks, quotedMedia, quotedLinks, quotedTags, quotedRead] = await Promise.all(
        [
          db
            .select()
            .from(bookmarks)
            .where(
              and(
                eq(bookmarks.userId, userId),
                eq(bookmarks.platform, 'twitter'),
                inArray(bookmarks.id, quotedTweetIds),
              ),
            ),
          db
            .select()
            .from(bookmarkMedia)
            .where(
              and(
                eq(bookmarkMedia.userId, userId),
                eq(bookmarkMedia.platform, 'twitter'),
                inArray(bookmarkMedia.bookmarkId, quotedTweetIds),
              ),
            ),
          db
            .select()
            .from(bookmarkLinks)
            .where(
              and(
                eq(bookmarkLinks.userId, userId),
                eq(bookmarkLinks.platform, 'twitter'),
                inArray(bookmarkLinks.bookmarkId, quotedTweetIds),
              ),
            ),
          db
            .select()
            .from(bookmarkTags)
            .where(
              and(
                eq(bookmarkTags.userId, userId),
                eq(bookmarkTags.platform, 'twitter'),
                inArray(bookmarkTags.bookmarkId, quotedTweetIds),
              ),
            ),
          db
            .select({ bookmarkId: readStatus.bookmarkId })
            .from(readStatus)
            .where(
              and(
                eq(readStatus.userId, userId),
                eq(readStatus.platform, 'twitter'),
                inArray(readStatus.bookmarkId, quotedTweetIds),
              ),
            ),
        ],
      )

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

      const quotedItemMap = new Map<string, FeedItemResponse>()
      for (const qb of quotedBookmarks) {
        quotedItemMap.set(
          qb.id,
          buildFeedItem(
            qb,
            quotedLinksByBookmark.get(qb.id) || [],
            quotedMediaByBookmark.get(qb.id) || [],
            quotedTagsByBookmark.get(qb.id) || [],
            quotedReadIds.has(qb.id),
            quotedArticleIds.has(qb.id),
          ),
        )
      }

      for (const item of items) {
        if (item.quotedTweetId && quotedItemMap.has(item.quotedTweetId)) {
          item.quotedTweet = quotedItemMap.get(item.quotedTweetId)!
        }
      }
    }

    // Fetch parent tweets for items that are quoted by other bookmarks (Twitter-only)
    const itemIds = items.filter((i) => i.platform === 'twitter').map((item) => item.id)
    const parentBookmarks =
      itemIds.length > 0
        ? await db
            .select()
            .from(bookmarks)
            .where(
              and(
                eq(bookmarks.userId, userId),
                eq(bookmarks.platform, 'twitter'),
                inArray(bookmarks.quotedTweetId, itemIds),
              ),
            )
        : []

    if (parentBookmarks.length > 0) {
      const parentIds = parentBookmarks.map((p) => p.id)

      const [parentMedia, parentLinks, parentTags, parentRead] = await Promise.all([
        db
          .select()
          .from(bookmarkMedia)
          .where(
            and(
              eq(bookmarkMedia.userId, userId),
              eq(bookmarkMedia.platform, 'twitter'),
              inArray(bookmarkMedia.bookmarkId, parentIds),
            ),
          ),
        db
          .select()
          .from(bookmarkLinks)
          .where(
            and(
              eq(bookmarkLinks.userId, userId),
              eq(bookmarkLinks.platform, 'twitter'),
              inArray(bookmarkLinks.bookmarkId, parentIds),
            ),
          ),
        db
          .select()
          .from(bookmarkTags)
          .where(
            and(
              eq(bookmarkTags.userId, userId),
              eq(bookmarkTags.platform, 'twitter'),
              inArray(bookmarkTags.bookmarkId, parentIds),
            ),
          ),
        db
          .select({ bookmarkId: readStatus.bookmarkId })
          .from(readStatus)
          .where(
            and(
              eq(readStatus.userId, userId),
              eq(readStatus.platform, 'twitter'),
              inArray(readStatus.bookmarkId, parentIds),
            ),
          ),
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
          parentArticleIds.has(pb.id),
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
      db
        .select({ startedAt: syncLogs.startedAt })
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
    return handleRouteError(error, {
      endpoint: '/api/feed',
      userId,
      message: 'Failed to fetch feed',
    })
  }
})
