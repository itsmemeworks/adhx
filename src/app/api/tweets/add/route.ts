import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bookmarks, bookmarkLinks, bookmarkMedia } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { metrics } from '@/lib/sentry'
import { getCurrentUserId } from '@/lib/auth/session'

// Parse tweet URL to extract author and tweet ID
function parseTweetUrl(url: string): { author: string; tweetId: string } | null {
  // Supported patterns:
  // https://twitter.com/user/status/123
  // https://x.com/user/status/123
  // https://mobile.twitter.com/user/status/123
  // https://vxtwitter.com/user/status/123
  // https://fxtwitter.com/user/status/123
  const patterns = [
    /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter|x|vxtwitter|fxtwitter)\.com\/([^/]+)\/status\/(\d+)/i,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) {
      return { author: match[1], tweetId: match[2] }
    }
  }

  return null
}

// Fetch tweet data from fxtwitter API
async function fetchTweetData(author: string, tweetId: string) {
  const apiUrl = `https://api.fxtwitter.com/${author}/status/${tweetId}`
  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'ADHX/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch tweet: ${response.status}`)
  }

  const data = await response.json()
  return data.tweet
}

// Determine category from tweet data
function determineCategory(tweet: Record<string, unknown>): string {
  // Check for X Article
  if (tweet.article || tweet.is_article) {
    return 'article'
  }

  // Check for video content
  const media = tweet.media as { videos?: unknown[] } | undefined
  if (media?.videos && Array.isArray(media.videos) && media.videos.length > 0) {
    return 'video'
  }

  // Check for photos
  const mediaAll = (tweet.media as { all?: Array<{ type?: string }> })?.all
  if (mediaAll && Array.isArray(mediaAll)) {
    const hasPhoto = mediaAll.some(m => m.type === 'photo')
    if (hasPhoto) return 'photo'
  }

  // Check for external links (articles from other sites)
  const urls = tweet.urls as Array<{ expanded_url?: string }> | undefined
  if (urls && Array.isArray(urls) && urls.length > 0) {
    const hasExternalLink = urls.some(u => {
      const url = u.expanded_url || ''
      return !url.includes('twitter.com') && !url.includes('x.com')
    })
    if (hasExternalLink) return 'article'
  }

  return 'text'
}

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
    const tweet = await fetchTweetData(parsed.author, parsed.tweetId)

    // Determine category based on content
    const category = determineCategory(tweet)

    // Extract article preview data if available
    // Note: thumbnail_url is often null, use cover_media.media_info.original_img_url instead
    // Note: url is often null, construct it ourselves with /article/ path for proper detection
    // Note: description is often null, use preview_text instead
    const authorUsername = tweet.author?.screen_name || parsed.author
    const articlePreview = tweet.article ? {
      title: tweet.article.title,
      description: tweet.article.preview_text || tweet.article.description,
      imageUrl: tweet.article.cover_media?.media_info?.original_img_url || tweet.article.thumbnail_url,
      url: `https://x.com/${authorUsername}/article/${parsed.tweetId}`,
      domain: 'x.com',
    } : null

    // Create bookmark
    const now = new Date().toISOString()

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
        })
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
          originalUrl: link.url || link,
          expandedUrl: link.expanded_url || link.url || link,
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
