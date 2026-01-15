import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkLinks, bookmarkMedia } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { metrics } from '@/lib/sentry'
import { getCurrentUserId } from '@/lib/auth/session'
import {
  parseTweetUrl,
  fetchTweetFromFxTwitter,
  determineCategory,
} from '@/lib/tweets/processor'

// POST /api/tweets/add - Add a tweet by URL
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { url, source = 'manual' } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Parse the URL
    const parsed = parseTweetUrl(url)
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid tweet URL. Supported formats: twitter.com/user/status/123, x.com/user/status/123' },
        { status: 400 }
      )
    }

    // Check for duplicate (composite key: userId + tweetId)
    const existing = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, parsed.tweetId)))
      .limit(1)

    if (existing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          isDuplicate: true,
          message: 'This tweet is already in your bookmarks',
          bookmark: existing[0]
        },
        { status: 200 }
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
    const articlePreview = tweet.article ? {
      title: tweet.article.title,
      description: tweet.article.preview_text || null,
      imageUrl: tweet.article.cover_media?.media_info?.original_img_url || null,
      url: `https://x.com/${authorUsername}/article/${parsed.tweetId}`,
      domain: 'x.com',
    } : null

    // Create bookmark
    const now = new Date().toISOString()

    // Process quote tweet if present (FxTwitter includes quote data in tweet.quote)
    let isQuote = false
    let quoteContext: string | null = null
    let quotedTweetId: string | null = null

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
        media: tweet.quote.media ? {
          photos: tweet.quote.media.photos,
          videos: tweet.quote.media.videos,
        } : null,
        article: tweet.quote.article ? {
          url: `https://x.com/${tweet.quote.author?.screen_name}/article/${tweet.quote.id}`,
          title: tweet.quote.article.title,
          description: tweet.quote.article.preview_text,
          imageUrl: tweet.quote.article.cover_media?.media_info?.original_img_url,
        } : null,
        external: tweet.quote.external || null,
        createdAt: tweet.quote.created_at,
      })

      // Also save the quoted tweet as a separate bookmark if it doesn't exist
      const [existingQuotedTweet] = await db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, tweet.quote.id)))
        .limit(1)

      if (!existingQuotedTweet) {
        const quotedAuthor = tweet.quote.author?.screen_name || 'unknown'

        // Determine category for quoted tweet
        let quotedCategory = 'text'
        if (tweet.quote.article) {
          quotedCategory = 'article'
        } else if (tweet.quote.media?.videos?.length) {
          quotedCategory = 'video'
        } else if (tweet.quote.media?.photos?.length) {
          quotedCategory = 'photo'
        }

        await db.insert(bookmarks).values({
          id: tweet.quote.id,
          userId,
          author: quotedAuthor,
          authorName: tweet.quote.author?.name || null,
          authorProfileImageUrl: tweet.quote.author?.avatar_url || null,
          text: tweet.quote.text || '',
          tweetUrl: `https://x.com/${quotedAuthor}/status/${tweet.quote.id}`,
          createdAt: tweet.quote.created_at ? new Date(tweet.quote.created_at).toISOString() : now,
          processedAt: now,
          category: quotedCategory,
          source: 'quoted', // Mark as saved via quote
        }).onConflictDoNothing()

        // Save media for the quoted tweet
        if (tweet.quote.media?.photos) {
          for (let i = 0; i < tweet.quote.media.photos.length; i++) {
            const photo = tweet.quote.media.photos[i]
            await db.insert(bookmarkMedia).values({
              id: `${tweet.quote.id}_photo_${i}`,
              userId,
              bookmarkId: tweet.quote.id,
              mediaType: 'photo',
              originalUrl: photo.url,
              width: photo.width,
              height: photo.height,
            }).onConflictDoNothing()
          }
        }
        if (tweet.quote.media?.videos) {
          for (let i = 0; i < tweet.quote.media.videos.length; i++) {
            const video = tweet.quote.media.videos[i]
            await db.insert(bookmarkMedia).values({
              id: `${tweet.quote.id}_video_${i}`,
              userId,
              bookmarkId: tweet.quote.id,
              mediaType: 'video',
              originalUrl: video.url,
              previewUrl: video.thumbnail_url,
              width: video.width,
              height: video.height,
            }).onConflictDoNothing()
          }
        }
      }
    }

    await db.insert(bookmarks).values({
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

    // Process media if present
    if (tweet.media?.all && Array.isArray(tweet.media.all)) {
      for (let i = 0; i < tweet.media.all.length; i++) {
        const m = tweet.media.all[i]
        await db.insert(bookmarkMedia).values({
          id: `${parsed.tweetId}_${i}`,
          userId,
          bookmarkId: parsed.tweetId,
          mediaType: m.type || 'photo',
          originalUrl: m.url || '',
          previewUrl: m.thumbnail_url || m.url || '',
          width: m.width || null,
          height: m.height || null,
        }).onConflictDoNothing()
      }
    }

    // Process X Article link if present
    if (tweet.article && articlePreview) {
      // Build content JSON with mediaEntities for image URL mapping
      let contentJson: string | null = null
      if (tweet.article.content) {
        // Convert entityMap from array [{key, value}] to dictionary if needed
        const entityMap = Array.isArray(tweet.article.content.entityMap)
          ? tweet.article.content.entityMap.reduce((acc: Record<string, unknown>, item: { key: string; value: unknown }) => {
              acc[item.key] = item.value
              return acc
            }, {})
          : (tweet.article.content.entityMap || {})

        // Build mediaEntities mapping from media_entities array
        const mediaEntities = tweet.article.media_entities?.reduce((acc: Record<string, { url: string; width?: number; height?: number }>, entity: { media_id: string; media_info?: { original_img_url?: string; original_img_width?: number; original_img_height?: number } }) => {
          if (entity.media_id && entity.media_info?.original_img_url) {
            acc[entity.media_id] = {
              url: entity.media_info.original_img_url,
              width: entity.media_info.original_img_width,
              height: entity.media_info.original_img_height,
            }
          }
          return acc
        }, {})

        contentJson = JSON.stringify({
          blocks: tweet.article.content.blocks,
          entityMap,
          mediaEntities,
        })
      }

      await db.insert(bookmarkLinks).values({
        userId,
        bookmarkId: parsed.tweetId,
        expandedUrl: articlePreview.url,
        domain: 'x.com',
        linkType: 'article',
        previewTitle: articlePreview.title,
        previewDescription: articlePreview.description,
        previewImageUrl: articlePreview.imageUrl,
        contentJson,
      })
    }

    // Process other links if present (external URLs from tweet)
    if (tweet.urls && Array.isArray(tweet.urls)) {
      for (const link of tweet.urls) {
        await db.insert(bookmarkLinks).values({
          userId,
          bookmarkId: parsed.tweetId,
          originalUrl: link.url,
          expandedUrl: link.expanded_url || link.url,
          domain: link.domain || null,
        })
      }
    }

    // Fetch the created bookmark
    const newBookmark = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, parsed.tweetId)))
      .limit(1)

    // Track bookmark addition with source
    metrics.bookmarkAdded(source as 'manual' | 'url_prefix')

    return NextResponse.json({
      success: true,
      isDuplicate: false,
      bookmark: newBookmark[0],
      message: 'Tweet added successfully!',
    })
  } catch (error) {
    console.error('Failed to add tweet:', error)
    const message = error instanceof Error ? error.message : 'Failed to add tweet'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
