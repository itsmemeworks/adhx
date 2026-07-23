import { NextResponse } from 'next/server'
import { db, runInTransaction } from '@/lib/db'
import { bookmarks, bookmarkLinks, bookmarkMedia } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { metrics, captureException } from '@/lib/sentry'
import { withAuth } from '@/lib/api/with-auth'
import { parseTweetUrl, fetchTweetFromFxTwitter, determineCategory } from '@/lib/tweets/processor'
import { extractUrlsFromFacets } from '@/lib/media/fxembed'
import { fetchOgMetadata } from '@/lib/utils/og-fetch'
import { normalizeEntityMap } from '@/lib/utils/article-text'
import { recordActivity, previewPath } from '@/lib/activity/record'

// POST /api/tweets/add - Add a tweet by URL
export const POST = withAuth(async (request, userId) => {
  try {
    const body = await request.json()
    const { url, source = 'manual' } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Parse the URL
    const parsed = parseTweetUrl(url)
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            'Invalid tweet URL. Supported formats: twitter.com/user/status/123, x.com/user/status/123',
        },
        { status: 400 },
      )
    }

    // Check for duplicate (composite key: userId + platform + tweetId — this
    // endpoint is twitter-only, so filter explicitly to avoid colliding with a
    // numerically-identical id saved from another platform)
    const existing = await db
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, userId),
          eq(bookmarks.platform, 'twitter'),
          eq(bookmarks.id, parsed.tweetId),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      // Already saved — but the user still acted on it (re-added), so surface it
      // in the Latest pulse. Without this, re-adding a saved tweet is invisible
      // to Trending/Latest (the "missed loop"). De-duped within 60s. Pull the
      // thumbnail from stored media so a saved photo/video tweet still reads
      // rich (getTrendingItems also derives type/cover from the bookmark).
      const dup = existing[0]
      const [firstMedia] = await db
        .select({ previewUrl: bookmarkMedia.previewUrl, originalUrl: bookmarkMedia.originalUrl })
        .from(bookmarkMedia)
        .where(
          and(
            eq(bookmarkMedia.userId, userId),
            eq(bookmarkMedia.platform, 'twitter'),
            eq(bookmarkMedia.bookmarkId, parsed.tweetId),
          ),
        )
        .limit(1)
      recordActivity({
        action: 'save',
        platform: 'twitter',
        bookmarkId: parsed.tweetId,
        author: dup.author,
        authorName: dup.authorName,
        text: dup.text || null,
        thumbnailUrl: firstMedia?.previewUrl || firstMedia?.originalUrl || null,
        contentType: dup.category,
        url: previewPath('twitter', dup.author, parsed.tweetId),
        userId,
      })
      return NextResponse.json(
        {
          success: false,
          isDuplicate: true,
          message: 'This tweet is already in your bookmarks',
          bookmark: existing[0],
        },
        { status: 200 },
      )
    }

    // Fetch tweet data from fxtwitter
    const fxResponse = await fetchTweetFromFxTwitter(parsed.author, parsed.tweetId)
    if (!fxResponse?.tweet) {
      return NextResponse.json({ error: 'Failed to fetch tweet data' }, { status: 500 })
    }
    const tweet = fxResponse.tweet

    // Determine category based on content
    const category = determineCategory(tweet)

    // Extract article preview data if available
    // Note: thumbnail_url is often null, use cover_media.media_info.original_img_url instead
    // Note: url is often null, construct it ourselves with /article/ path for proper detection
    // Note: description is often null, use preview_text instead
    const authorUsername = tweet.author?.screen_name || parsed.author
    const articlePreview = tweet.article
      ? {
          title: tweet.article.title,
          description: tweet.article.preview_text || null,
          imageUrl: tweet.article.cover_media?.media_info?.original_img_url || null,
          url: `https://x.com/${authorUsername}/article/${parsed.tweetId}`,
          domain: 'x.com',
        }
      : null

    // Create bookmark
    const now = new Date().toISOString()

    // Process quote tweet if present (FxTwitter includes quote data in tweet.quote)
    let isQuote = false
    let quoteContext: string | null = null
    let quotedTweetId: string | null = null
    let shouldInsertQuotedTweet = false
    let quotedAuthor = 'unknown'
    let quotedCategory = 'text'

    if (tweet.quote) {
      isQuote = true
      quotedTweetId = tweet.quote.id

      // Build quoteContext JSON for display
      quoteContext = JSON.stringify({
        tweetId: tweet.quote.id,
        author: tweet.quote.author?.screen_name,
        authorName: tweet.quote.author?.name,
        authorProfileImageUrl: tweet.quote.author?.avatar_url,
        text: tweet.quote.text,
        media: tweet.quote.media
          ? {
              photos: tweet.quote.media.photos,
              videos: tweet.quote.media.videos,
            }
          : null,
        article: tweet.quote.article
          ? {
              url: `https://x.com/${tweet.quote.author?.screen_name}/article/${tweet.quote.id}`,
              title: tweet.quote.article.title,
              description: tweet.quote.article.preview_text,
              imageUrl: tweet.quote.article.cover_media?.media_info?.original_img_url,
            }
          : null,
        external: tweet.quote.external || null,
        createdAt: tweet.quote.created_at,
      })

      // Also save the quoted tweet as a separate bookmark if it doesn't exist.
      // Filter by platform ('twitter' — quotes always reference a tweet) to
      // avoid colliding with a numerically-identical id on another platform.
      const [existingQuotedTweet] = await db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.platform, 'twitter'),
            eq(bookmarks.id, tweet.quote.id),
          ),
        )
        .limit(1)

      shouldInsertQuotedTweet = !existingQuotedTweet
      if (shouldInsertQuotedTweet) {
        quotedAuthor = tweet.quote.author?.screen_name || 'unknown'

        // Determine category for quoted tweet
        if (tweet.quote.article) {
          quotedCategory = 'article'
        } else if (tweet.quote.media?.videos?.length) {
          quotedCategory = 'video'
        } else if (tweet.quote.media?.photos?.length) {
          quotedCategory = 'photo'
        }
      }
    }

    // Pre-fetch OG metadata for facet-extracted links — an external async
    // call, so it must happen before the synchronous transaction below.
    const directUrls =
      tweet.urls && Array.isArray(tweet.urls) && tweet.urls.length > 0 ? tweet.urls : null
    const facetLinksWithOg: Array<{
      link: ReturnType<typeof extractUrlsFromFacets>[number]
      og: Awaited<ReturnType<typeof fetchOgMetadata>>
    }> = []
    if (!directUrls && !tweet.article) {
      // Fallback: extract URLs from raw_text.facets when tweet.urls is missing
      const facetUrls = extractUrlsFromFacets(tweet)
      for (const link of facetUrls) {
        // Fetch OG metadata for rich link previews in the feed
        const og = await fetchOgMetadata(link.expanded_url)
        facetLinksWithOg.push({ link, og })
      }
    }

    // Build X Article contentJson ahead of the transaction — pure JSON
    // transformation, no I/O.
    let articleContentJson: string | null = null
    if (tweet.article?.content) {
      const entityMap = normalizeEntityMap(tweet.article.content.entityMap)

      // Build mediaEntities mapping from media_entities array
      const mediaEntities = tweet.article.media_entities?.reduce(
        (
          acc: Record<string, { url: string; width?: number; height?: number }>,
          entity: {
            media_id: string
            media_info?: {
              original_img_url?: string
              original_img_width?: number
              original_img_height?: number
            }
          },
        ) => {
          if (entity.media_id && entity.media_info?.original_img_url) {
            acc[entity.media_id] = {
              url: entity.media_info.original_img_url,
              width: entity.media_info.original_img_width,
              height: entity.media_info.original_img_height,
            }
          }
          return acc
        },
        {},
      )

      articleContentJson = JSON.stringify({
        blocks: tweet.article.content.blocks,
        entityMap,
        mediaEntities,
      })
    }

    const quotedTweetData = tweet.quote

    // All multi-table writes happen atomically: main bookmark + its media +
    // links, plus (optionally) the quoted tweet + its media.
    runInTransaction(() => {
      if (quotedTweetData && shouldInsertQuotedTweet) {
        db.insert(bookmarks)
          .values({
            id: quotedTweetData.id,
            userId,
            author: quotedAuthor,
            authorName: quotedTweetData.author?.name || null,
            authorProfileImageUrl: quotedTweetData.author?.avatar_url || null,
            text: quotedTweetData.text || '',
            tweetUrl: `https://x.com/${quotedAuthor}/status/${quotedTweetData.id}`,
            createdAt: quotedTweetData.created_at
              ? new Date(quotedTweetData.created_at).toISOString()
              : now,
            processedAt: now,
            category: quotedCategory,
            source: 'quoted', // Mark as saved via quote
          })
          .onConflictDoNothing()
          .run()

        // Save media for the quoted tweet
        if (quotedTweetData.media?.photos) {
          quotedTweetData.media.photos.forEach((photo, i) => {
            db.insert(bookmarkMedia)
              .values({
                id: `${quotedTweetData.id}_photo_${i}`,
                userId,
                bookmarkId: quotedTweetData.id,
                mediaType: 'photo',
                originalUrl: photo.url,
                width: photo.width,
                height: photo.height,
              })
              .onConflictDoNothing()
              .run()
          })
        }
        if (quotedTweetData.media?.videos) {
          quotedTweetData.media.videos.forEach((video, i) => {
            db.insert(bookmarkMedia)
              .values({
                id: `${quotedTweetData.id}_video_${i}`,
                userId,
                bookmarkId: quotedTweetData.id,
                mediaType: 'video',
                originalUrl: video.url,
                previewUrl: video.thumbnail_url,
                width: video.width,
                height: video.height,
              })
              .onConflictDoNothing()
              .run()
          })
        }
      }

      db.insert(bookmarks)
        .values({
          id: parsed.tweetId,
          userId,
          author: tweet.author?.screen_name || parsed.author,
          authorName: tweet.author?.name || null,
          authorProfileImageUrl: tweet.author?.avatar_url || null,
          text: tweet.text || '',
          tweetUrl: `https://twitter.com/${parsed.author}/status/${parsed.tweetId}`,
          createdAt: tweet.created_at ? new Date(tweet.created_at).toISOString() : now,
          processedAt: now,
          category,
          source, // 'manual' or 'url_prefix'
          isQuote,
          quoteContext,
          quotedTweetId,
        })
        .run()

      // Process media if present
      if (tweet.media?.all && Array.isArray(tweet.media.all)) {
        tweet.media.all.forEach((m, i) => {
          db.insert(bookmarkMedia)
            .values({
              id: `${parsed.tweetId}_${i}`,
              userId,
              bookmarkId: parsed.tweetId,
              mediaType: m.type || 'photo',
              originalUrl: m.url || '',
              previewUrl: m.thumbnail_url || m.url || '',
              width: m.width || null,
              height: m.height || null,
            })
            .onConflictDoNothing()
            .run()
        })
      }

      // Process X Article link if present
      if (tweet.article && articlePreview) {
        db.insert(bookmarkLinks)
          .values({
            userId,
            bookmarkId: parsed.tweetId,
            expandedUrl: articlePreview.url,
            domain: 'x.com',
            linkType: 'article',
            previewTitle: articlePreview.title,
            previewDescription: articlePreview.description,
            previewImageUrl: articlePreview.imageUrl,
            contentJson: articleContentJson,
          })
          .run()
      }

      // Process other links if present (external URLs from tweet, or
      // facet-extracted URLs with their pre-fetched OG metadata)
      if (directUrls) {
        for (const link of directUrls) {
          db.insert(bookmarkLinks)
            .values({
              userId,
              bookmarkId: parsed.tweetId,
              originalUrl: link.url,
              expandedUrl: link.expanded_url || link.url,
              domain: link.domain || null,
            })
            .run()
        }
      } else if (!tweet.article) {
        for (const { link, og } of facetLinksWithOg) {
          db.insert(bookmarkLinks)
            .values({
              userId,
              bookmarkId: parsed.tweetId,
              originalUrl: link.url,
              expandedUrl: link.expanded_url,
              domain: link.domain || null,
              previewTitle: og?.title || null,
              previewDescription: og?.description || null,
              previewImageUrl: og?.image || null,
            })
            .run()
        }
      }
    })

    // Fetch the created bookmark
    const newBookmark = await db
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, userId),
          eq(bookmarks.platform, 'twitter'),
          eq(bookmarks.id, parsed.tweetId),
        ),
      )
      .limit(1)

    // Track bookmark addition with source
    metrics.bookmarkAdded(source as 'manual' | 'url_prefix')

    // Push to the public activity pulse (anonymous, server-resolved content).
    const saveAuthor = tweet.author?.screen_name || parsed.author
    recordActivity({
      action: 'save',
      platform: 'twitter',
      bookmarkId: parsed.tweetId,
      author: saveAuthor,
      authorName: tweet.author?.name || null,
      text: tweet.text || null,
      // Real media only — no avatar fallback, so text tweets stay "text".
      thumbnailUrl: tweet.media?.all?.[0]?.thumbnail_url || tweet.media?.all?.[0]?.url || null,
      url: previewPath('twitter', saveAuthor, parsed.tweetId),
      userId,
    })

    return NextResponse.json({
      success: true,
      isDuplicate: false,
      bookmark: newBookmark[0],
      message: 'Tweet added successfully!',
    })
  } catch (error) {
    console.error('Failed to add tweet:', error)
    captureException(error, { endpoint: '/api/tweets/add' })
    const message = error instanceof Error ? error.message : 'Failed to add tweet'
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
