import { fetchTweetData, extractEnrichmentData } from '@/lib/media/fxembed'
import { db, runInTransaction } from '@/lib/db'
import {
  bookmarks,
  bookmarkLinks,
  bookmarkMedia,
  type NewBookmark,
  type NewBookmarkLink,
  type NewBookmarkMedia,
} from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { captureException } from '@/lib/sentry'
import type { TwitterBookmark } from '@/lib/twitter/client'
import type { StreamedBookmark } from '@/components/feed/types'
import { categorizeTweetByUrls, extractDomain, determineLinkType } from '@/lib/tweets/processor'
import { normalizeEntityMap } from '@/lib/utils/article-text'

// Note: categorizeBookmark, extractDomain, and determineLinkType are
// imported from @/lib/tweets/processor for consistency with /api/tweets/add

/**
 * Save a single bookmark to the database with automatic enrichment.
 *
 * `processedAt` is the "added to ADHX" stamp the Collection's default sort
 * (`sort=added`, newest first) orders by. Callers that import a *batch* in a
 * meaningful order must pass it explicitly: X returns bookmarks
 * newest-bookmarked first, so stamping each row with `Date.now()` as the loop
 * runs makes the last-saved (oldest) bookmark the newest "added" row and turns
 * the whole collection upside down. See `addedAtForIndex`.
 */
export async function saveBookmark(
  tweet: TwitterBookmark,
  userId: string,
  insertedDuringSync: Set<string>,
  processedAt?: string,
): Promise<StreamedBookmark> {
  const now = processedAt ?? new Date().toISOString()
  const authorUsername = tweet.author?.username || 'unknown'
  const tweetUrl = tweet.author
    ? `https://x.com/${authorUsername}/status/${tweet.id}`
    : `https://x.com/i/status/${tweet.id}`

  // Determine category based on URLs (will be overridden by FxTwitter if media detected)
  let category = categorizeTweetByUrls(
    tweet.entities?.urls?.map((u) => ({ expandedUrl: u.expandedUrl })) || [],
  )

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

  // Sync is a background stream, not a latency-sensitive page render, so give the
  // enrichment fetch a generous timeout (15s) and 3 attempts. Article payloads are
  // large and were timing out under bulk load at the default 5s — leaving synced
  // articles un-enriched (no category='article', no bookmark_links) so they showed
  // bare in Trending until an individual preview re-fetched them.
  const FX_ATTEMPTS = 3
  for (let attempt = 1; attempt <= FX_ATTEMPTS; attempt++) {
    try {
      const fxData = await fetchTweetData(authorUsername, tweet.id, { timeoutMs: 15_000 })
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
      // fetchTweetData swallows timeouts/HTTP errors and returns null (no throw),
      // so back off here before the next attempt rather than hammering instantly.
      if (attempt < FX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 300))
      }
    } catch (error) {
      if (attempt === FX_ATTEMPTS) {
        console.error(
          `Failed to fetch FxTwitter enrichment data after ${FX_ATTEMPTS} attempts:`,
          error,
        )
        captureException(error, {
          context: 'fxtwitter_enrichment',
          tweetId: tweet.id,
          authorUsername,
          attempt,
        })
      } else {
        // Back off before retrying (linear: 300ms, 600ms).
        await new Promise((resolve) => setTimeout(resolve, attempt * 300))
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
          media: fxData.tweet.media
            ? {
                photos: fxData.tweet.media.photos,
                videos: fxData.tweet.media.videos,
              }
            : null,
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

  // Fetch quoted tweet data for quote tweets and save as separate bookmark.
  // The FxTwitter fetch is network I/O and stays outside the transaction; it
  // only stages plain row objects (`quotedInsert`) for the DB writes, which
  // happen inside the single per-bookmark transaction below alongside the
  // "already exists" check, so the check-then-insert can't race.
  let quoteContext: string | null = null
  let quotedTweetId: string | null = null
  let quotedInsert: {
    bookmark: NewBookmark
    photos: NewBookmarkMedia[]
    videos: NewBookmarkMedia[]
    articleLink: NewBookmarkLink | null
  } | null = null
  const quoteRef = tweet.referencedTweets?.find((rt) => rt.type === 'quoted')
  if (isQuote && quoteRef) {
    try {
      // Use FxTwitter API to get the quoted tweet
      const fxData = await fetchTweetData('i', quoteRef.id)
      if (fxData?.tweet) {
        quotedTweetId = quoteRef.id

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

        // Build full article content with blocks, entityMap, and mediaEntities
        const articleContent = fxData.tweet.article?.content
          ? {
              blocks: fxData.tweet.article.content.blocks,
              entityMap: normalizeEntityMap(fxData.tweet.article.content.entityMap),
              // Include media_entities to map mediaId to actual image URLs
              mediaEntities: fxData.tweet.article.media_entities?.reduce(
                (
                  acc: Record<string, { url: string; width?: number; height?: number }>,
                  entity: {
                    media_id?: string
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
              ),
            }
          : null

        // Stage the quoted tweet's bookmark/media/article-link rows. Written
        // inside the transaction below, guarded there by the same
        // "already exists" check the original code did up front.
        quotedInsert = {
          bookmark: {
            id: quoteRef.id,
            userId,
            author: quotedAuthor,
            authorName: fxData.tweet.author.name,
            authorProfileImageUrl: fxData.tweet.author.avatar_url,
            text: fxData.tweet.text,
            tweetUrl: quotedTweetUrl,
            createdAt: fxData.tweet.created_at
              ? new Date(fxData.tweet.created_at).toISOString()
              : null,
            processedAt: now,
            category: quotedCategory,
            isReply: false,
            isQuote: false,
            isRetweet: false,
          },
          photos: (fxData.tweet.media?.photos || []).map((photo, i) => ({
            id: `${quoteRef.id}_photo_${i}`,
            userId,
            bookmarkId: quoteRef.id,
            mediaType: 'photo',
            originalUrl: photo.url,
            width: photo.width,
            height: photo.height,
          })),
          videos: (fxData.tweet.media?.videos || []).map((video, i) => ({
            id: `${quoteRef.id}_video_${i}`,
            userId,
            bookmarkId: quoteRef.id,
            mediaType: 'video',
            originalUrl: video.url,
            previewUrl: video.thumbnail_url,
            width: video.width,
            height: video.height,
            durationMs: video.duration ? video.duration * 1000 : null,
          })),
          articleLink:
            fxData.tweet.article && quotedArticleUrl
              ? {
                  userId,
                  bookmarkId: quoteRef.id,
                  expandedUrl: quotedArticleUrl,
                  domain: 'x.com',
                  linkType: 'article',
                  previewTitle: fxData.tweet.article.title,
                  previewDescription: fxData.tweet.article.preview_text,
                  previewImageUrl: fxData.tweet.article.cover_media?.media_info?.original_img_url,
                  contentJson: articleContent ? JSON.stringify(articleContent) : null,
                }
              : null,
        }

        // Also store quoteContext for backwards compatibility
        quoteContext = JSON.stringify({
          tweetId: quoteRef.id,
          author: fxData.tweet.author.screen_name,
          authorName: fxData.tweet.author.name,
          authorProfileImageUrl: fxData.tweet.author.avatar_url,
          text: fxData.tweet.text,
          media: fxData.tweet.media
            ? {
                photos: fxData.tweet.media.photos,
                videos: fxData.tweet.media.videos,
              }
            : null,
          article: fxData.tweet.article
            ? {
                url: quotedArticleUrl,
                title: fxData.tweet.article.title,
                description: fxData.tweet.article.preview_text,
                imageUrl: fxData.tweet.article.cover_media?.media_info?.original_img_url,
              }
            : null,
          external: fxData.tweet.external
            ? {
                url: fxData.tweet.external.expanded_url || fxData.tweet.external.url,
                title: fxData.tweet.external.title,
                description: fxData.tweet.external.description,
                imageUrl: fxData.tweet.external.thumbnail_url,
              }
            : null,
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

  // Pure computation (no I/O) — staged for the transaction below.
  const linkInserts: NewBookmarkLink[] = (tweet.entities?.urls || [])
    .filter((url) => !url.expandedUrl.includes('/status/'))
    .map((url) => ({
      userId,
      bookmarkId: tweet.id,
      originalUrl: url.url,
      expandedUrl: url.expandedUrl,
      domain: extractDomain(url.expandedUrl),
      linkType: determineLinkType(url.expandedUrl),
    }))

  const mediaInserts: NewBookmarkMedia[] = (tweet.media || []).map((media) => ({
    id: `${tweet.id}_${media.mediaKey}`,
    userId,
    bookmarkId: tweet.id,
    mediaType: media.type,
    originalUrl: media.url || media.previewUrl || '',
    previewUrl: media.previewUrl || null,
    width: media.width || null,
    height: media.height || null,
    durationMs: media.durationMs || null,
  }))

  const articleLinkInsert: NewBookmarkLink | null =
    enrichment?.article && enrichment.article.url
      ? {
          userId,
          bookmarkId: tweet.id,
          expandedUrl: enrichment.article.url,
          domain: 'x.com',
          linkType: 'article',
          previewTitle: enrichment.article.title,
          previewDescription: enrichment.article.description,
          previewImageUrl: enrichment.article.imageUrl,
          contentJson: enrichment.article.content
            ? JSON.stringify(enrichment.article.content)
            : null,
        }
      : null

  // All writes for this bookmark (quoted tweet + bookmark + links + media)
  // happen in one transaction: either the full set lands, or none of it does,
  // so a mid-write crash/disconnect can't leave a bookmark half-saved.
  const savedMedia = runInTransaction(() => {
    if (quotedInsert && quotedTweetId) {
      // Check if the quoted tweet already exists as a bookmark for THIS USER
      // OR was already inserted during this sync (use composite key: userId + id)
      const alreadyInserted =
        insertedDuringSync.has(quotedTweetId) ||
        db
          .select({ id: bookmarks.id })
          .from(bookmarks)
          .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, quotedTweetId)))
          .limit(1)
          .all().length > 0

      if (!alreadyInserted) {
        // Use onConflictDoNothing to handle case where another user already synced this tweet
        db.insert(bookmarks).values(quotedInsert.bookmark).onConflictDoNothing().run()
        insertedDuringSync.add(quotedTweetId)

        for (const photo of quotedInsert.photos) {
          db.insert(bookmarkMedia).values(photo).onConflictDoNothing().run()
        }
        for (const video of quotedInsert.videos) {
          db.insert(bookmarkMedia).values(video).onConflictDoNothing().run()
        }
        if (quotedInsert.articleLink) {
          db.insert(bookmarkLinks).values(quotedInsert.articleLink).run()
        }
      } else {
        insertedDuringSync.add(quotedTweetId)
      }
    }

    // Insert bookmark with userId for multi-user support and enrichment data
    // Use onConflictDoNothing to handle case where another user already synced this tweet
    // Note: Current schema uses tweet ID as primary key, so same tweet can only exist once
    db.insert(bookmarks)
      .values({
        id: tweet.id,
        userId, // Include userId for multi-user support
        author: authorUsername,
        authorName,
        authorProfileImageUrl,
        text: tweet.text,
        tweetUrl,
        createdAt: tweet.createdAt ? new Date(tweet.createdAt).toISOString() : null,
        processedAt: now,
        category,
        isReply,
        isQuote,
        quoteContext,
        quotedTweetId, // Reference to the separately stored quoted tweet
        isRetweet,
        retweetContext,
        rawJson: JSON.stringify(tweet),
      })
      .onConflictDoNothing()
      .run()

    // Insert links (include userId)
    for (const link of linkInserts) {
      db.insert(bookmarkLinks).values(link).run()
    }

    // Insert media (include userId for composite key)
    for (const media of mediaInserts) {
      db.insert(bookmarkMedia).values(media).onConflictDoNothing().run()
    }

    // Insert article link with preview data if enrichment found an article (include userId)
    if (articleLinkInsert) {
      db.insert(bookmarkLinks).values(articleLinkInsert).run()
    }

    // Insert external link with preview data if enrichment found external link
    if (enrichment?.external && enrichment.external.url) {
      // Check if we already added this link from tweet.entities.urls (filter by userId)
      const existingLinks = db
        .select()
        .from(bookmarkLinks)
        .where(and(eq(bookmarkLinks.userId, userId), eq(bookmarkLinks.bookmarkId, tweet.id)))
        .all()

      const existingMatch = existingLinks.find(
        (link) => link.expandedUrl === enrichment!.external!.url,
      )

      if (!existingMatch) {
        const domain = extractDomain(enrichment.external.url)
        db.insert(bookmarkLinks)
          .values({
            userId,
            bookmarkId: tweet.id,
            expandedUrl: enrichment.external.url,
            domain,
            linkType: 'article',
            previewTitle: enrichment.external.title,
            previewDescription: enrichment.external.description,
            previewImageUrl: enrichment.external.imageUrl,
          })
          .run()
      } else {
        // Update existing link with preview data
        db.update(bookmarkLinks)
          .set({
            previewTitle: enrichment.external.title,
            previewDescription: enrichment.external.description,
            previewImageUrl: enrichment.external.imageUrl,
          })
          .where(eq(bookmarkLinks.id, existingMatch.id))
          .run()
      }
    }

    // Query the media we just inserted for the return value (filter by userId)
    return db
      .select()
      .from(bookmarkMedia)
      .where(and(eq(bookmarkMedia.userId, userId), eq(bookmarkMedia.bookmarkId, tweet.id)))
      .all()
  })

  // Build the StreamedBookmark return value
  return {
    id: tweet.id,
    author: authorUsername,
    authorName,
    authorProfileImageUrl,
    text: tweet.text,
    tweetUrl,
    createdAt: tweet.createdAt ? new Date(tweet.createdAt).toISOString() : null,
    processedAt: now,
    category,
    isArchived: false,
    isQuote,
    isRetweet,
    media:
      savedMedia.length > 0
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
