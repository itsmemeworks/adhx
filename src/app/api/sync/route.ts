import { NextResponse } from 'next/server'
import { fetchBookmarks, TwitterBookmark } from '@/lib/twitter/client'
import { fetchTweetData, extractEnrichmentData } from '@/lib/media/fxembed'
import { db, runInTransaction } from '@/lib/db'
import {
  bookmarks,
  bookmarkLinks,
  bookmarkMedia,
  syncLogs,
  type NewBookmark,
  type NewBookmarkLink,
  type NewBookmarkMedia,
} from '@/lib/db/schema'
import { eq, desc, and, lt } from 'drizzle-orm'
import { nanoid } from '@/lib/utils'
import { withAuth } from '@/lib/api/with-auth'
import { hasExistingTokens } from '@/lib/auth/oauth'
import { captureException, metrics } from '@/lib/sentry'
import type { StreamedBookmark } from '@/components/feed/types'
import { categorizeTweetByUrls, extractDomain, determineLinkType } from '@/lib/tweets/processor'
import { recordActivity, previewPath } from '@/lib/activity/record'
import { getSyncCooldownMs } from '@/lib/sync/config'

/**
 * Cap on how many newly-synced tweets feed the public pulse per sync. Bookmarks
 * arrive most-recently-bookmarked first, so the freshest saves are recorded and
 * a large first-time backfill can't flood the shared, anonymous Discover feed.
 */
const SYNC_PULSE_CAP = 25
import { normalizeEntityMap } from '@/lib/utils/article-text'

/**
 * Auth-loss during sync (valid session JWT, but the OAuth tokens are gone —
 * disconnected, fatal refresh cleared them, or account data wiped). This is an
 * expected, user-recoverable state ("reconnect your account"), NOT a bug, so we
 * surface it to the user but do NOT report it to Sentry as an exception.
 */
function isAuthLossError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /not authenticated|reconnect your account/i.test(message)
}

// GET /api/sync - SSE endpoint for sync progress
export const GET = withAuth(async (request, userId) => {
  // Check cooldown between syncs (configurable via SYNC_COOLDOWN_MINUTES env)
  const cooldownMs = getSyncCooldownMs()
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
        { status: 429 },
      )
    }
  }

  // Guard: a valid session JWT doesn't guarantee live OAuth tokens (the token
  // chain can die while the cookie lingers). Bail before opening the SSE stream
  // so we don't write a phantom 'running' syncLog or report expected auth-loss
  // to Sentry — just ask the user to reconnect.
  if (!(await hasExistingTokens(userId))) {
    return NextResponse.json(
      { error: 'Your X session has expired. Please reconnect your account in Settings.' },
      { status: 401 },
    )
  }

  // Reap this user's stuck 'running' sync rows (e.g. process killed/deployed
  // over mid-sync, or a disconnected client whose stream never reached its
  // finally block) so they don't accumulate and skew sync history forever.
  const STALE_RUNNING_MS = 30 * 60 * 1000
  await db
    .update(syncLogs)
    .set({
      status: 'failed',
      errorMessage: 'Sync timed out (stuck in running state)',
      completedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(syncLogs.userId, userId),
        eq(syncLogs.status, 'running'),
        lt(syncLogs.startedAt, new Date(Date.now() - STALE_RUNNING_MS).toISOString()),
      ),
    )

  const searchParams = request.nextUrl.searchParams
  const all = searchParams.get('all') === 'true'
  const maxPagesRaw = parseInt(searchParams.get('maxPages') || '10', 10)
  const maxPages = Number.isNaN(maxPagesRaw) ? 10 : Math.min(20, Math.max(1, maxPagesRaw))

  // Disconnect handling: if the client goes away mid-sync (tab closed, nav
  // away, flaky mobile connection), stop paginating/processing and stop
  // enqueuing on a torn-down controller instead of running the full sync to
  // completion against a socket nobody's reading.
  let aborted = false
  let keepAliveInterval: ReturnType<typeof setInterval> | undefined
  const onAbort = () => {
    aborted = true
    if (keepAliveInterval) clearInterval(keepAliveInterval)
  }
  request.signal.addEventListener('abort', onAbort)

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: object) => {
        if (aborted) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Controller already closed/errored (client disconnected) — ignore.
        }
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
      keepAliveInterval = setInterval(() => {
        if (aborted) {
          clearInterval(keepAliveInterval)
          return
        }
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
          (
            await db
              .select({ id: bookmarks.id })
              .from(bookmarks)
              .where(eq(bookmarks.userId, userId))
          ).map((b) => b.id),
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

          while (hasMore && pageNumber < maxPages && !aborted) {
            pageNumber++
            const result = await fetchBookmarks(userId, {
              maxResults: 100,
              paginationToken: cursor,
            })

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
          if (aborted) break

          const tweet = allTweets[i]
          const isDuplicate = existingIds.has(tweet.id)

          if (isDuplicate) {
            duplicatesSkipped++
            send('duplicate', { tweetId: tweet.id, skipped: true })
          } else {
            const savedBookmark = await saveBookmark(tweet, userId, insertedDuringSync)
            insertedDuringSync.add(tweet.id) // Track that we inserted this ID
            newBookmarks++

            // Feed the public pulse, same as a manual save — a newly-synced tweet
            // is a new save. Capped (freshest first) so a big backfill can't flood
            // the shared feed. getTrendingItems derives type/counts from the
            // bookmark we just wrote; we still pass title/cover so articles read
            // rich. Fire-and-forget (recordActivity swallows errors).
            if (newBookmarks <= SYNC_PULSE_CAP) {
              recordActivity({
                action: 'save',
                platform: 'twitter',
                bookmarkId: savedBookmark.id,
                author: savedBookmark.author,
                authorName: savedBookmark.authorName,
                text: savedBookmark.articlePreview?.title || savedBookmark.text || null,
                thumbnailUrl:
                  savedBookmark.articlePreview?.imageUrl ||
                  savedBookmark.media?.[0]?.thumbnailUrl ||
                  null,
                contentType: savedBookmark.category,
                url: previewPath('twitter', savedBookmark.author, savedBookmark.id),
                userId,
              })
            }

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

        if (aborted) {
          // Client disconnected mid-sync — record what we actually got through
          // rather than leaving the row stuck at 'running' (that's what the
          // stale-row reaper above cleans up for crashed processes, but we can
          // just mark it directly here since we're still running).
          await db
            .update(syncLogs)
            .set({
              completedAt: new Date().toISOString(),
              status: 'failed',
              errorMessage: 'Client disconnected',
              totalFetched: total,
              newBookmarks,
              duplicatesSkipped,
            })
            .where(eq(syncLogs.id, syncId))
          return
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

        // Auth-loss (tokens vanished mid-flight, after the pre-stream guard) is
        // expected and user-recoverable — record it on the sync log + tell the
        // client to reconnect, but don't pollute Sentry with a non-bug.
        if (!isAuthLossError(error)) {
          captureException(error, {
            syncId,
            userId,
            all,
            maxPages,
            errorMessage: message,
          })
        }

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
        request.signal.removeEventListener('abort', onAbort)
        try {
          controller.close()
        } catch {
          // Already closed/errored via cancel() on client disconnect — ignore.
        }
      }
    },
    cancel() {
      // Fires when the consumer (client) cancels the stream — the standard
      // signal for "browser disconnected" on a Response body stream.
      onAbort()
      request.signal.removeEventListener('abort', onAbort)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})

// Save a single bookmark to the database with automatic enrichment
async function saveBookmark(
  tweet: TwitterBookmark,
  userId: string,
  insertedDuringSync: Set<string>,
): Promise<StreamedBookmark> {
  const now = new Date().toISOString()
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
    isRead: false,
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

// Note: categorizeBookmark, extractDomain, and determineLinkType are now
// imported from @/lib/tweets/processor for consistency with /api/tweets/add
