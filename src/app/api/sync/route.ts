import { NextResponse } from 'next/server'
import { fetchBookmarks, TwitterBookmark } from '@/lib/twitter/client'
import { db } from '@/lib/db'
import { bookmarks, syncLogs } from '@/lib/db/schema'
import { eq, desc, and, lt } from 'drizzle-orm'
import { nanoid } from '@/lib/utils'
import { withAuth } from '@/lib/api/with-auth'
import { hasExistingTokens } from '@/lib/auth/oauth'
import { captureException, captureMessage, metrics } from '@/lib/sentry'
import { REAUTH_MESSAGE } from '@/lib/sync/messages'
import { isReauthError, toTwitterCallError } from '@/lib/twitter/errors'
import { recordActivity, previewPath } from '@/lib/activity/record'
import { getSyncCooldownMs } from '@/lib/sync/config'
import { saveBookmark } from '@/lib/sync/save-bookmark'
import { addedAtForIndex } from '@/lib/sync/added-at'
import { recordAnalytic } from '@/lib/analytics/record'

/**
 * Cap on how many newly-synced tweets feed the public pulse per sync. Bookmarks
 * arrive most-recently-bookmarked first, so the freshest saves are recorded and
 * a large first-time backfill can't flood the shared, anonymous Discover feed.
 */
const SYNC_PULSE_CAP = 25

/**
 * Auth-loss during sync (valid session JWT, but the OAuth tokens are gone —
 * disconnected, fatal refresh cleared them, or X rejected the user token with
 * 401/402/403). This is an expected, user-recoverable state ("reconnect"),
 * NOT a bug, so we surface it to the user but do NOT report it to Sentry
 * as an exception — except 402, which we record as a warning so a developer
 * plan lapse is still visible.
 */

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
  // chain can die while the cookie lingers). Send an SSE error event (not a
  // JSON 401) so EventSource delivers the classified message instead of the
  // client showing a generic "Connection lost".
  if (!(await hasExistingTokens(userId))) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ message: REAUTH_MESSAGE, code: 'reauth' })}\n\n`,
          ),
        )
        controller.close()
      },
    })
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
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
            // Count the "added" stamp backwards from the sync start so X's
            // newest-bookmarked-first order survives the Collection's
            // `added desc` sort — see addedAtForIndex.
            const savedBookmark = await saveBookmark(
              tweet,
              userId,
              insertedDuringSync,
              addedAtForIndex(syncStartTime, i),
            )
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
                source: 'sync',
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
        recordAnalytic({ name: 'sync.complete', userId, source: 'sync' })

        send('complete', {
          stats: {
            total,
            new: newBookmarks,
            duplicates: duplicatesSkipped,
            categorized: 0, // Will be populated if AI categorization runs
          },
        })
      } catch (error) {
        const classified = toTwitterCallError(error)
        const message = classified.message

        // Track sync failure
        metrics.syncFailed(classified.code)

        // Auth-loss is expected and user-recoverable — record it on the sync
        // log + tell the client to reconnect. 402 is the developer app being
        // out of X API credits: warn in Sentry (with X's body) but do *not*
        // send the user back through OAuth — that loops.
        if (classified.httpStatus === 402) {
          captureMessage('X bookmarks returned 402 (no API credits)', 'warning', {
            syncId,
            userId,
            twitterStatus: 402,
            twitterBody: classified.twitterBody,
          })
        } else if (!isReauthError(classified)) {
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

        send('error', { message, code: classified.code })
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
