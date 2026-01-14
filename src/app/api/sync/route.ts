import { NextRequest, NextResponse } from 'next/server'
import { fetchBookmarks, TwitterBookmark } from '@/lib/twitter/client'
import { fetchTweetData, extractEnrichmentData } from '@/lib/media/fxembed'
import { db } from '@/lib/db'
import { bookmarks, bookmarkLinks, bookmarkMedia, syncLogs } from '@/lib/db/schema'
import { eq, desc, and } from 'drizzle-orm'
import { nanoid } from '@/lib/utils'
import { getCurrentUserId } from '@/lib/auth/session'
import { captureException, metrics } from '@/lib/sentry'
import type { StreamedBookmark } from '@/components/feed/types'

// GET /api/sync - SSE endpoint for sync progress
export async function GET(request: NextRequest) {
  // Get current user ID for multi-user data isolation
  const userId = await getCurrentUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check cooldown - 1 hour between syncs (strict userId check)
  const cooldownMs = 60 * 60 * 1000 // 1 hour
  const [lastSync] = await db
    .select()
    .from(syncLogs)
    .where(and(eq(syncLogs.status, 'completed'), eq(syncLogs.userId, userId)))
    .orderBy(desc(syncLogs.completedAt))
    .limit(1)

  if (lastSync?.completedAt) {
    const elapsed = Date.now() - new Date(lastSync.completedAt).getTime()
    if (elapsed < cooldownMs) {
      return NextResponse.json(
        {
          error: 'Please wait before syncing again',
          cooldownRemaining: cooldownMs - elapsed,
        },
        { status: 429 }
      )
    }
  }

  const searchParams = request.nextUrl.searchParams
  const all = searchParams.get('all') === 'true'
  const maxPages = parseInt(searchParams.get('maxPages') || '10')

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: object) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      // Create sync log entry
      const syncId = nanoid()
      const startedAt = new Date().toISOString()

      await db.insert(syncLogs).values({
        id: syncId,
        userId, // Include userId for multi-user support
        startedAt,
        status: 'running',
        triggerType: 'manual',
      })

      // Keep-alive interval to prevent connection drops (defined outside try so finally can clear it)
      const keepAliveInterval = setInterval(() => {
        send('ping', { timestamp: Date.now() })
      }, 10000) // Send ping every 10 seconds

      // Track sync start
      const syncType = all ? 'full' : 'incremental'
      metrics.syncStarted(syncType)
      const syncStartTime = Date.now()

      try {
        send('start', { syncId, total: null })

        // Get existing bookmark IDs for this user (strict userId check)
        const existingIds = new Set(
          (await db.select({ id: bookmarks.id }).from(bookmarks).where(eq(bookmarks.userId, userId))).map((b) => b.id)
        )

        // Track IDs we've inserted during this sync (for quote tweets that get saved separately)
        const insertedDuringSync = new Set<string>()

        let allTweets: TwitterBookmark[] = []
        let pageNumber = 0
        let duplicatesSkipped = 0
        let newBookmarks = 0

        // Fetch bookmarks with pagination
        if (all) {
          // Fetch all with progress updates
          let cursor: string | undefined
          let hasMore = true

          while (hasMore && pageNumber < maxPages) {
            pageNumber++
            const result = await fetchBookmarks(userId, { maxResults: 100, paginationToken: cursor })

            send('page', {
              pageNumber,
              tweetsFound: result.bookmarks.length,
              cursor: result.nextToken || null,
            })

            allTweets.push(...result.bookmarks)
            cursor = result.nextToken
            hasMore = !!cursor
          }
        } else {
          // Single fetch
          const result = await fetchBookmarks(userId, { maxResults: 50 })
          allTweets = result.bookmarks
          send('page', { pageNumber: 1, tweetsFound: result.bookmarks.length, cursor: null })
        }

        // Process each bookmark
        const total = allTweets.length
        for (let i = 0; i < allTweets.length; i++) {
          const tweet = allTweets[i]
          const isDuplicate = existingIds.has(tweet.id)

          if (isDuplicate) {
            duplicatesSkipped++
            send('duplicate', { tweetId: tweet.id, skipped: true })
          } else {
            const savedBookmark = await saveBookmark(tweet, userId, insertedDuringSync)
            insertedDuringSync.add(tweet.id) // Track that we inserted this ID
            newBookmarks++

            send('processing', {
              current: i + 1,
              total,
              tweet: {
                id: tweet.id,
                author: tweet.author?.username || 'unknown',
                text: tweet.text.slice(0, 100) + (tweet.text.length > 100 ? '...' : ''),
              },
              // Include full bookmark data for real-time gallery updates
              bookmark: savedBookmark,
            })

            // Rate limit: wait 150ms between bookmarks to avoid overwhelming FxTwitter API
            // This ensures article enrichment data is fetched reliably
            if (i < allTweets.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 150))
            }
          }
        }

        // Update sync log
        const completedAt = new Date().toISOString()
        await db
          .update(syncLogs)
          .set({
            completedAt,
            status: 'completed',
            totalFetched: total,
            newBookmarks,
            duplicatesSkipped,
          })
          .where(eq(syncLogs.id, syncId))

        // Track sync completion
        const syncDuration = Date.now() - syncStartTime
        metrics.syncCompleted(newBookmarks, pageNumber, syncDuration)
        metrics.trackUser(userId)

        send('complete', {
          stats: {
            total,
            new: newBookmarks,
            duplicates: duplicatesSkipped,
            categorized: 0, // Will be populated if AI categorization runs
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'

        // Track sync failure
        metrics.syncFailed(message)

        // Capture error in Sentry with context
        captureException(error, {
          syncId,
          userId,
          all,
          maxPages,
          errorMessage: message,
        })

        // Update sync log with error
        await db
          .update(syncLogs)
          .set({
            completedAt: new Date().toISOString(),
            status: 'failed',
            errorMessage: message,
          })
          .where(eq(syncLogs.id, syncId))

        send('error', { message })
      } finally {
        clearInterval(keepAliveInterval)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

// Save a single bookmark to the database with automatic enrichment
async function saveBookmark(
  tweet: TwitterBookmark,
  userId: string,
  insertedDuringSync: Set<string>
): Promise<StreamedBookmark> {
  const now = new Date().toISOString()
  const authorUsername = tweet.author?.username || 'unknown'
  const tweetUrl = tweet.author
    ? `https://x.com/${authorUsername}/status/${tweet.id}`
    : `https://x.com/i/status/${tweet.id}`

  // Determine category based on URLs
  let category = categorizeBookmark(tweet)

  // Check for reply/quote/retweet context
  const isReply = tweet.referencedTweets?.some((rt) => rt.type === 'replied_to') || false
  const isQuote = tweet.referencedTweets?.some((rt) => rt.type === 'quoted') || false
  const retweetRef = tweet.referencedTweets?.find((rt) => rt.type === 'retweeted')
  const isRetweet = !!retweetRef

  // Fetch FxTwitter data for enrichment (author profile image, article previews)
  // Retry once if the first attempt fails (API can be flaky under load)
  let authorProfileImageUrl: string | null = null
  let authorName = tweet.author?.name || null
  let enrichment: ReturnType<typeof extractEnrichmentData> | null = null

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const fxData = await fetchTweetData(authorUsername, tweet.id)
      if (fxData?.tweet) {
        enrichment = extractEnrichmentData(fxData)
        if (enrichment) {
          authorProfileImageUrl = enrichment.authorProfileImageUrl || null
          authorName = enrichment.authorName || authorName

          // Update category if FxTwitter detected an article
          if (enrichment.article) {
            category = 'article'
          } else if (fxData.tweet.media?.videos?.length) {
            category = 'video'
          } else if (fxData.tweet.media?.photos?.length) {
            category = 'photo'
          }
        }
        break // Success, exit retry loop
      }
    } catch (error) {
      if (attempt === 2) {
        console.error('Failed to fetch FxTwitter enrichment data after 2 attempts:', error)
        captureException(error, {
          context: 'fxtwitter_enrichment',
          tweetId: tweet.id,
          authorUsername,
          attempt,
        })
      } else {
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }
  }

  // Fetch original tweet data for retweets
  let retweetContext: string | null = null
  if (isRetweet && retweetRef) {
    try {
      // Use FxTwitter API to get the original tweet
      // The retweetRef.id is the original tweet ID
      // We need to fetch it to get author info
      const fxData = await fetchTweetData('i', retweetRef.id)
      if (fxData?.tweet) {
        retweetContext = JSON.stringify({
          tweetId: retweetRef.id,
          author: fxData.tweet.author.screen_name,
          authorName: fxData.tweet.author.name,
          authorProfileImageUrl: fxData.tweet.author.avatar_url,
          text: fxData.tweet.text,
          media: fxData.tweet.media ? {
            photos: fxData.tweet.media.photos,
            videos: fxData.tweet.media.videos,
          } : null,
        })
      }
    } catch (error) {
      console.error('Failed to fetch retweet data:', error)
      captureException(error, {
        context: 'retweet_fetch',
        tweetId: tweet.id,
        retweetId: retweetRef.id,
      })
    }
  }

  // Fetch quoted tweet data for quote tweets and save as separate bookmark
  let quoteContext: string | null = null
  let quotedTweetId: string | null = null
  const quoteRef = tweet.referencedTweets?.find((rt) => rt.type === 'quoted')
  if (isQuote && quoteRef) {
    try {
      // Use FxTwitter API to get the quoted tweet
      const fxData = await fetchTweetData('i', quoteRef.id)
      if (fxData?.tweet) {
        quotedTweetId = quoteRef.id

        // Check if the quoted tweet already exists as a bookmark for THIS USER
        // OR was already inserted during this sync (use composite key: userId + id)
        const alreadyInserted = insertedDuringSync.has(quoteRef.id)
        const [existingQuotedTweet] = alreadyInserted
          ? [{ id: quoteRef.id }] // Skip DB query if we know we already inserted it
          : await db
              .select({ id: bookmarks.id })
              .from(bookmarks)
              .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, quoteRef.id)))
              .limit(1)

        // If quoted tweet doesn't exist, save it as a separate bookmark
        if (!existingQuotedTweet) {
          const quotedAuthor = fxData.tweet.author.screen_name
          const quotedTweetUrl = `https://x.com/${quotedAuthor}/status/${quoteRef.id}`

          // Determine category for quoted tweet
          let quotedCategory = 'tweet'
          if (fxData.tweet.article) {
            quotedCategory = 'article'
          } else if (fxData.tweet.media?.videos?.length) {
            quotedCategory = 'video'
          } else if (fxData.tweet.media?.photos?.length) {
            quotedCategory = 'photo'
          }

          // Build article URL if the quoted tweet has an article
          const quotedArticleUrl = fxData.tweet.article
            ? `https://x.com/${quotedAuthor}/article/${quoteRef.id}`
            : null

          // Save the quoted tweet as its own bookmark
          // Use onConflictDoNothing to handle case where another user already synced this tweet
          await db.insert(bookmarks).values({
            id: quoteRef.id,
            userId,
            author: quotedAuthor,
            authorName: fxData.tweet.author.name,
            authorProfileImageUrl: fxData.tweet.author.avatar_url,
            text: fxData.tweet.text,
            tweetUrl: quotedTweetUrl,
            createdAt: fxData.tweet.created_at || null,
            processedAt: now,
            category: quotedCategory,
            isReply: false,
            isQuote: false,
            isRetweet: false,
          }).onConflictDoNothing()

          // Track that we've inserted this quoted tweet
          insertedDuringSync.add(quoteRef.id)

          // Save media for the quoted tweet (include userId for composite key)
          if (fxData.tweet.media?.photos) {
            for (let i = 0; i < fxData.tweet.media.photos.length; i++) {
              const photo = fxData.tweet.media.photos[i]
              const mediaId = `${quoteRef.id}_photo_${i}`
              await db.insert(bookmarkMedia).values({
                id: mediaId,
                userId,
                bookmarkId: quoteRef.id,
                mediaType: 'photo',
                originalUrl: photo.url,
                width: photo.width,
                height: photo.height,
              })
            }
          }

          if (fxData.tweet.media?.videos) {
            for (let i = 0; i < fxData.tweet.media.videos.length; i++) {
              const video = fxData.tweet.media.videos[i]
              const mediaId = `${quoteRef.id}_video_${i}`
              await db.insert(bookmarkMedia).values({
                id: mediaId,
                userId,
                bookmarkId: quoteRef.id,
                mediaType: 'video',
                originalUrl: video.url,
                previewUrl: video.thumbnail_url,
                width: video.width,
                height: video.height,
                durationMs: video.duration ? video.duration * 1000 : null,
              })
            }
          }

          // Save article link for quoted tweet if it's an article
          if (fxData.tweet.article && quotedArticleUrl) {
            // Build full article content with blocks, entityMap, and mediaEntities
            const articleContent = fxData.tweet.article.content ? {
              blocks: fxData.tweet.article.content.blocks,
              // FxTwitter returns entityMap as array [{key, value}], convert to dictionary
              entityMap: Array.isArray(fxData.tweet.article.content.entityMap)
                ? fxData.tweet.article.content.entityMap.reduce((acc: Record<string, unknown>, item: { key: string; value: unknown }) => {
                    acc[item.key] = item.value
                    return acc
                  }, {})
                : (fxData.tweet.article.content.entityMap || {}),
              // Include media_entities to map mediaId to actual image URLs
              mediaEntities: fxData.tweet.article.media_entities?.reduce((acc: Record<string, { url: string; width?: number; height?: number }>, entity: { media_id?: string; media_info?: { original_img_url?: string; original_img_width?: number; original_img_height?: number } }) => {
                if (entity.media_id && entity.media_info?.original_img_url) {
                  acc[entity.media_id] = {
                    url: entity.media_info.original_img_url,
                    width: entity.media_info.original_img_width,
                    height: entity.media_info.original_img_height,
                  }
                }
                return acc
              }, {}),
            } : null

            await db.insert(bookmarkLinks).values({
              userId,
              bookmarkId: quoteRef.id,
              expandedUrl: quotedArticleUrl,
              domain: 'x.com',
              linkType: 'article',
              previewTitle: fxData.tweet.article.title,
              previewDescription: fxData.tweet.article.preview_text,
              previewImageUrl: fxData.tweet.article.cover_media?.media_info?.original_img_url,
              contentJson: articleContent ? JSON.stringify(articleContent) : null,
            })
          }
        }

        // Also store quoteContext for backwards compatibility
        const quotedArticleUrl = fxData.tweet.article
          ? `https://x.com/${fxData.tweet.author.screen_name}/article/${fxData.tweet.id}`
          : null

        quoteContext = JSON.stringify({
          tweetId: quoteRef.id,
          author: fxData.tweet.author.screen_name,
          authorName: fxData.tweet.author.name,
          authorProfileImageUrl: fxData.tweet.author.avatar_url,
          text: fxData.tweet.text,
          media: fxData.tweet.media ? {
            photos: fxData.tweet.media.photos,
            videos: fxData.tweet.media.videos,
          } : null,
          article: fxData.tweet.article ? {
            url: quotedArticleUrl,
            title: fxData.tweet.article.title,
            description: fxData.tweet.article.preview_text,
            imageUrl: fxData.tweet.article.cover_media?.media_info?.original_img_url,
          } : null,
          external: fxData.tweet.external ? {
            url: fxData.tweet.external.expanded_url || fxData.tweet.external.url,
            title: fxData.tweet.external.title,
            description: fxData.tweet.external.description,
            imageUrl: fxData.tweet.external.thumbnail_url,
          } : null,
        })
      }
    } catch (error) {
      console.error('Failed to fetch quote tweet data:', error)
      captureException(error, {
        context: 'quote_tweet_fetch',
        tweetId: tweet.id,
        quoteId: quoteRef.id,
      })
    }
  }

  // Insert bookmark with userId for multi-user support and enrichment data
  // Use onConflictDoNothing to handle case where another user already synced this tweet
  // Note: Current schema uses tweet ID as primary key, so same tweet can only exist once
  await db.insert(bookmarks).values({
    id: tweet.id,
    userId, // Include userId for multi-user support
    author: authorUsername,
    authorName,
    authorProfileImageUrl,
    text: tweet.text,
    tweetUrl,
    createdAt: tweet.createdAt || null,
    processedAt: now,
    category,
    isReply,
    isQuote,
    quoteContext,
    quotedTweetId, // Reference to the separately stored quoted tweet
    isRetweet,
    retweetContext,
    rawJson: JSON.stringify(tweet),
  }).onConflictDoNothing()

  // Insert links (include userId)
  if (tweet.entities?.urls) {
    for (const url of tweet.entities.urls) {
      if (url.expandedUrl.includes('/status/')) continue

      const domain = extractDomain(url.expandedUrl)
      const linkType = determineLinkType(url.expandedUrl)

      await db.insert(bookmarkLinks).values({
        userId,
        bookmarkId: tweet.id,
        originalUrl: url.url,
        expandedUrl: url.expandedUrl,
        domain,
        linkType,
      })
    }
  }

  // Insert media (include userId for composite key)
  if (tweet.media && tweet.media.length > 0) {
    for (let i = 0; i < tweet.media.length; i++) {
      const media = tweet.media[i]
      const mediaId = `${tweet.id}_${media.mediaKey}`
      const originalUrl = media.url || media.previewUrl || ''

      await db.insert(bookmarkMedia).values({
        id: mediaId,
        userId,
        bookmarkId: tweet.id,
        mediaType: media.type,
        originalUrl,
        previewUrl: media.previewUrl || null,
        width: media.width || null,
        height: media.height || null,
        durationMs: media.durationMs || null,
      })
    }
  }

  // Insert article link with preview data if enrichment found an article (include userId)
  if (enrichment?.article && enrichment.article.url) {
    const articleContentJson = enrichment.article.content
      ? JSON.stringify(enrichment.article.content)
      : null

    await db.insert(bookmarkLinks).values({
      userId,
      bookmarkId: tweet.id,
      expandedUrl: enrichment.article.url,
      domain: 'x.com',
      linkType: 'article',
      previewTitle: enrichment.article.title,
      previewDescription: enrichment.article.description,
      previewImageUrl: enrichment.article.imageUrl,
      contentJson: articleContentJson,
    })
  }

  // Insert external link with preview data if enrichment found external link
  if (enrichment?.external && enrichment.external.url) {
    // Check if we already added this link from tweet.entities.urls (filter by userId)
    const existingLinks = await db
      .select()
      .from(bookmarkLinks)
      .where(and(eq(bookmarkLinks.userId, userId), eq(bookmarkLinks.bookmarkId, tweet.id)))

    const alreadyExists = existingLinks.some(
      (link) => link.expandedUrl === enrichment!.external!.url
    )

    if (!alreadyExists) {
      const domain = extractDomain(enrichment.external.url)
      await db.insert(bookmarkLinks).values({
        userId,
        bookmarkId: tweet.id,
        expandedUrl: enrichment.external.url,
        domain,
        linkType: 'article',
        previewTitle: enrichment.external.title,
        previewDescription: enrichment.external.description,
        previewImageUrl: enrichment.external.imageUrl,
      })
    } else {
      // Update existing link with preview data
      for (const link of existingLinks) {
        if (link.expandedUrl === enrichment.external.url) {
          await db
            .update(bookmarkLinks)
            .set({
              previewTitle: enrichment.external.title,
              previewDescription: enrichment.external.description,
              previewImageUrl: enrichment.external.imageUrl,
            })
            .where(eq(bookmarkLinks.id, link.id))
          break
        }
      }
    }
  }

  // Query the media we just inserted for the return value (filter by userId)
  const savedMedia = await db
    .select()
    .from(bookmarkMedia)
    .where(and(eq(bookmarkMedia.userId, userId), eq(bookmarkMedia.bookmarkId, tweet.id)))

  // Build the StreamedBookmark return value
  return {
    id: tweet.id,
    author: authorUsername,
    authorName,
    authorProfileImageUrl,
    text: tweet.text,
    tweetUrl,
    createdAt: tweet.createdAt || null,
    processedAt: now,
    category,
    isRead: false,
    isQuote,
    isRetweet,
    media: savedMedia.length > 0
      ? savedMedia.map((m) => ({
          id: m.id,
          mediaType: m.mediaType,
          url: m.originalUrl || '',
          thumbnailUrl: m.previewUrl || m.originalUrl || '',
        }))
      : null,
    articlePreview: enrichment?.article
      ? {
          title: enrichment.article.title || null,
          imageUrl: enrichment.article.imageUrl || null,
        }
      : null,
    tags: [],
  }
}

function categorizeBookmark(tweet: TwitterBookmark): string {
  // Only detect articles from known blog/article platforms
  // All other categorization is done via user tags
  const urls = tweet.entities?.urls || []

  for (const url of urls) {
    const expanded = url.expandedUrl.toLowerCase()

    if (
      expanded.includes('medium.com') ||
      expanded.includes('substack.com') ||
      expanded.includes('dev.to') ||
      expanded.includes('/article/') ||
      expanded.includes('/blog/')
    ) {
      return 'article'
    }
  }

  return 'tweet'
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace('www.', '')
  } catch {
    return ''
  }
}

function determineLinkType(url: string): string {
  const lower = url.toLowerCase()

  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'tweet'
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'video'
  if (/\.(jpg|jpeg|png|gif|webp)$/i.test(lower)) return 'image'
  if (/\.(mp4|webm|mov)$/i.test(lower)) return 'media'

  return 'link'
}
