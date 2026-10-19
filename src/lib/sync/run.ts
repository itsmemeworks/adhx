import { and, eq } from 'drizzle-orm'
import { fetchBookmarks, type TwitterBookmark } from '@/lib/twitter/client'
import { db } from '@/lib/db'
import { bookmarks } from '@/lib/db/schema'
import { captureException, captureMessage, metrics } from '@/lib/sentry'
import { SYNC_IN_PROGRESS_MESSAGE } from '@/lib/sync/messages'
import { isReauthError, toTwitterCallError } from '@/lib/twitter/errors'
import { recordActivity, previewPath } from '@/lib/activity/record'
import { saveBookmark } from '@/lib/sync/save-bookmark'
import { addedAtForIndex } from '@/lib/sync/added-at'
import { recordAnalytic } from '@/lib/analytics/record'
import { finishOwnedSync, renewSyncLease, updateOwnedSyncProgress } from '@/lib/sync/claim'
import { noteSaved, PRIORITY } from '@/lib/semantic'

/**
 * Cap on how many newly-synced tweets feed the public pulse per sync. Bookmarks
 * arrive most-recently-bookmarked first, so the freshest saves are recorded and
 * a large first-time backfill can't flood the shared, anonymous Discover feed.
 */
const SYNC_PULSE_CAP = 25

export type SyncMode =
  /** Every page until X stops returning a next-page token (the Sync button). */
  | 'full'
  /** Newest bookmarks only: stop after the first page holding one already saved (the hourly sync). */
  | 'new'

export interface SyncOutcome {
  status: 'completed' | 'failed' | 'aborted' | 'lease_lost'
  total: number
  newBookmarks: number
  duplicatesSkipped: number
  /** Classified failure, when `status` is `failed`. */
  error?: { message: string; code: string; httpStatus?: number }
}

export interface RunSyncOptions {
  mode: SyncMode
  /** Progress events (the SSE stream); the automatic sync passes nothing. */
  send?: (event: string, data: object) => void
  /** The client went away (stream only). */
  isAborted?: () => boolean
}

/**
 * Bring in a user's X bookmarks under a sync claim the caller already holds
 * (`claimSync`). Renews the lease while it runs and always leaves the sync
 * row finished: completed, failed, or failed as "Client disconnected".
 */
export async function runBookmarkSync(
  userId: string,
  syncId: string,
  { mode, send = () => {}, isAborted = () => false }: RunSyncOptions,
): Promise<SyncOutcome> {
  let leaseLost = false
  const stopped = () => isAborted() || leaseLost
  const syncStartTime = Date.now()
  let total = 0
  let newBookmarks = 0
  let duplicatesSkipped = 0

  const keepAlive = setInterval(() => {
    if (isAborted()) {
      clearInterval(keepAlive)
      return
    }
    try {
      if (!renewSyncLease(userId, syncId)) {
        leaseLost = true
        clearInterval(keepAlive)
        return
      }
    } catch {
      // A failed renewal cannot prove ownership. Stop safely and leave
      // the row for stale recovery rather than continuing unlocked.
      leaseLost = true
      clearInterval(keepAlive)
      return
    }
    send('ping', { timestamp: Date.now() })
  }, 10000)

  try {
    // Track sync start only after the durable claim exists. Any failure
    // from here on is caught below and releases the claim as failed.
    metrics.syncStarted(mode === 'full' ? 'full' : 'incremental')

    send('start', { syncId, total: null })

    // Get existing bookmark IDs for this user (strict userId check)
    const existingIds = new Set(
      (
        await db
          .select({ id: bookmarks.id })
          .from(bookmarks)
          .where(and(eq(bookmarks.userId, userId), eq(bookmarks.platform, 'twitter')))
      ).map((b) => b.id),
    )

    // Track IDs we've inserted during this sync (for quote tweets that get saved separately)
    const insertedDuringSync = new Set<string>()

    const allTweets: TwitterBookmark[] = []
    let pageNumber = 0
    const publishProgress = () => {
      if (
        !updateOwnedSyncProgress(userId, syncId, {
          totalFetched: allTweets.length,
          newBookmarks,
          duplicatesSkipped,
        })
      )
        leaseLost = true
    }

    // A full sync is complete only when X stops returning a next-page token.
    // Keep going through short, empty, and already-saved pages: they can
    // still lead to older bookmarks missing from this account. The hourly
    // sync stops after the first page holding a bookmark already here: X
    // lists newest bookmarks first, so everything after it was seen before.
    // Either way X serves only the newest 800 (8 pages of 100).
    let cursor: string | undefined
    const requestedCursors = new Set<string>()
    while (!stopped()) {
      if (cursor) {
        if (requestedCursors.has(cursor)) {
          throw new Error(
            'X repeated a bookmark page. Sync could not finish; please try again later.',
          )
        }
        requestedCursors.add(cursor)
      }
      const result = await fetchBookmarks(userId, {
        maxResults: 100,
        paginationToken: cursor,
      })
      if (stopped()) break
      pageNumber++
      allTweets.push(...result.bookmarks)
      publishProgress()
      send('page', {
        pageNumber,
        tweetsFound: result.bookmarks.length,
        cursor: result.nextToken || null,
      })
      cursor = result.nextToken
      if (!cursor) break
      if (mode === 'new' && result.bookmarks.some((b) => existingIds.has(b.id))) break
    }

    // Process each bookmark
    total = allTweets.length
    for (let i = 0; i < allTweets.length; i++) {
      if (stopped()) break

      const tweet = allTweets[i]
      const isDuplicate = existingIds.has(tweet.id)

      if (isDuplicate) {
        duplicatesSkipped++
        send('duplicate', { tweetId: tweet.id, skipped: true })
      } else {
        // Count the "added" stamp backwards from the sync start so X's
        // newest-bookmarked-first order survives the Collection's
        // `added desc` sort — see addedAtForIndex.
        const { bookmark: savedBookmark, inserted } = await saveBookmark(
          tweet,
          userId,
          insertedDuringSync,
          addedAtForIndex(syncStartTime, i),
        )
        if (leaseLost) break
        insertedDuringSync.add(tweet.id)
        existingIds.add(tweet.id)

        // The preloaded ID set is only an optimization. Another writer can
        // insert after that snapshot, so the bookmark INSERT result is the
        // source of truth for stats, events, and the public save pulse.
        if (!inserted) {
          duplicatesSkipped++
          publishProgress()
          send('duplicate', { tweetId: tweet.id, skipped: true })
          continue
        }

        newBookmarks++
        noteSaved([{ platform: 'twitter', postId: savedBookmark.id }], PRIORITY.sync)

        // Feed the public pulse, same as a manual save — a newly-synced tweet
        // is a new save. Capped (freshest first) so a big backfill can't flood
        // the shared feed. Fire-and-forget (recordActivity swallows errors).
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
      publishProgress()
    }

    const counts = { total, newBookmarks, duplicatesSkipped }

    if (leaseLost) {
      send('error', { message: SYNC_IN_PROGRESS_MESSAGE, code: 'in_progress' })
      return { status: 'lease_lost', ...counts }
    }

    if (isAborted()) {
      // Client disconnected mid-sync — record what we actually got through
      // rather than leaving the row stuck at 'running'.
      finishOwnedSync(userId, syncId, {
        completedAt: new Date().toISOString(),
        status: 'failed',
        errorMessage: 'Client disconnected',
        totalFetched: total,
        newBookmarks,
        duplicatesSkipped,
      })
      return { status: 'aborted', ...counts }
    }

    const completed = finishOwnedSync(userId, syncId, {
      completedAt: new Date().toISOString(),
      status: 'completed',
      totalFetched: total,
      newBookmarks,
      duplicatesSkipped,
    })
    if (!completed) {
      send('error', { message: SYNC_IN_PROGRESS_MESSAGE, code: 'in_progress' })
      return { status: 'lease_lost', ...counts }
    }

    metrics.syncCompleted(newBookmarks, pageNumber, Date.now() - syncStartTime)
    metrics.trackUser(userId)
    recordAnalytic({
      name: mode === 'full' ? 'sync.complete' : 'sync.auto',
      userId,
      source: 'sync',
    })

    send('complete', {
      stats: {
        total,
        new: newBookmarks,
        duplicates: duplicatesSkipped,
        categorized: 0, // Will be populated if AI categorization runs
      },
    })
    return { status: 'completed', ...counts }
  } catch (error) {
    const classified = toTwitterCallError(error)
    const message = classified.message
    const counts = { total, newBookmarks, duplicatesSkipped }

    const failed = finishOwnedSync(userId, syncId, {
      completedAt: new Date().toISOString(),
      status: 'failed',
      errorMessage: message,
    })
    if (!failed) {
      send('error', { message: SYNC_IN_PROGRESS_MESSAGE, code: 'in_progress' })
      return { status: 'lease_lost', ...counts }
    }

    // Track sync failure only while this run still owns the claim.
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
      captureException(error, { syncId, userId, errorMessage: message })
    }

    send('error', { message, code: classified.code })
    return {
      status: 'failed',
      ...counts,
      error: { message, code: classified.code, httpStatus: classified.httpStatus },
    }
  } finally {
    clearInterval(keepAlive)
  }
}
