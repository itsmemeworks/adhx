import { recordActivity, previewPath } from '@/lib/activity/record'
import { keptSrc } from '@/lib/keep/src'
import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { nanoid } from '@/lib/utils'
import { db, runInTransaction } from '@/lib/db'
import { bookmarks, phoneSaveQueue, users } from '@/lib/db/schema'
import { addBookmark } from '@/lib/bookmarks/add'
import { privateByDefault, setSavePrivate, type SaveOptions } from '@/lib/bookmarks/privacy'
import { isLinkNetwork } from '@/lib/platform/networks'
import { wakeKeep } from '@/lib/keep/worker'
import { captureException } from '@/lib/sentry'

/**
 * Links shared from the phone app, saved in the background. The share sheet
 * hands a link over and gets an answer at once; reading the post (which can
 * take a while from a home server: Instagram is slow to answer one) happens
 * here, the same way the website saves (`addBookmark`), with retries.
 */

const TICK_MS = 5_000
/** Waits before each retry; after the last, the save fails for good. */
const BACKOFF_MS = [30_000, 2 * 60_000, 10 * 60_000]
/** Finished rows are kept this long, for a sheet that comes back to ask. */
const KEEP_FINISHED_MS = 7 * 24 * 60 * 60_000

export type QueuedSaveState = 'waiting' | 'saving' | 'saved' | 'failed'

export interface QueuedSave {
  id: string
  state: QueuedSaveState
  platform: string | null
  postId: string | null
  alreadySaved: boolean
  errorCode: string | null
  error: string | null
}

export const NOT_A_POST =
  'ADHX keeps single posts. Open the post itself (a Reel, a photo, a video) and share that.'
const UNAVAILABLE = 'That post couldn’t be read. It may be private or deleted.'
const FAILED = 'That couldn’t be saved. Share it again in a moment.'

interface State {
  timer: ReturnType<typeof setInterval> | null
  running: boolean
  lastClean: number
}

const g = globalThis as unknown as { __adhxSaveQueue?: State }
function state(): State {
  g.__adhxSaveQueue ??= { timer: null, running: false, lastClean: 0 }
  return g.__adhxSaveQueue
}

/**
 * Take a shared link: it's saved in the background. `options.private` is kept
 * with it, so a "Just for me" share is saved private, and so is `options.note`.
 */
export function enqueueSave(
  userId: string,
  url: string,
  now = new Date(),
  options: SaveOptions & { deferPublish?: boolean; requestId?: string } = {},
): QueuedSave {
  const id = nanoid()
  const iso = now.toISOString()
  const receipt = runInTransaction(() => {
    const inserted = db
      .insert(phoneSaveQueue)
      .values({
        id,
        userId,
        requestId: options.requestId ?? null,
        url,
        status: 'waiting',
        isPrivate: options.private === true,
        privateChoice: options.private ?? null,
        publishPending: options.deferPublish === true,
        defaultPrivate: options.private === undefined && privateByDefault(userId),
        // '' keeps "clear the note" distinct from null ("not given").
        note: options.note === undefined ? null : (options.note ?? ''),
        createdAt: iso,
        updatedAt: iso,
      })
      .onConflictDoNothing({ target: [phoneSaveQueue.userId, phoneSaveQueue.requestId] })
      .run()
    if (inserted.changes === 0 && options.requestId) {
      const existing = db
        .select()
        .from(phoneSaveQueue)
        .where(
          and(eq(phoneSaveQueue.userId, userId), eq(phoneSaveQueue.requestId, options.requestId)),
        )
        .get()
      if (!existing || existing.url !== url) throw new QueuedSaveConflict()
      return queuedSave(userId, existing.id)!
    }
    return queuedSave(userId, id)!
  })
  wakeSaveQueue()
  return receipt
}

/** Reusing a request id must never replace the URL or privacy intent it already accepted. */
export class QueuedSaveConflict extends Error {}

/** One of your queued saves, or null when it isn't yours (or is long gone). */
export function queuedSave(userId: string, id: string): QueuedSave | null {
  const [row] = db
    .select()
    .from(phoneSaveQueue)
    .where(and(eq(phoneSaveQueue.id, id), eq(phoneSaveQueue.userId, userId)))
    .limit(1)
    .all()
  if (!row) return null
  return {
    id: row.id,
    state: row.status === 'working' ? 'saving' : (row.status as QueuedSaveState),
    platform: row.platform,
    postId: row.postId,
    alreadySaved: row.alreadySaved,
    errorCode: row.errorCode,
    error: row.error,
  }
}

/** The next save due, marked as being worked on (null when none). */
function claimNext(now: Date): typeof phoneSaveQueue.$inferSelect | null {
  const iso = now.toISOString()
  const [next] = db
    .select()
    .from(phoneSaveQueue)
    .where(
      and(
        eq(phoneSaveQueue.status, 'waiting'),
        sql`EXISTS (SELECT 1 FROM ${users} WHERE ${users.id} = ${phoneSaveQueue.userId}
          AND ${users.approval} = 'approved'
          AND NOT EXISTS (SELECT 1 FROM user_bans WHERE user_id = ${users.id}))`,
        or(isNull(phoneSaveQueue.nextAttemptAt), lte(phoneSaveQueue.nextAttemptAt, iso)),
      ),
    )
    .orderBy(asc(phoneSaveQueue.createdAt))
    .limit(1)
    .all()
  if (!next) return null
  const claimed = db
    .update(phoneSaveQueue)
    .set({ status: 'working', updatedAt: iso })
    .where(and(eq(phoneSaveQueue.id, next.id), eq(phoneSaveQueue.status, 'waiting')))
    .run()
  return claimed.changes === 1 ? next : null
}

function finish(
  id: string,
  set: Partial<typeof phoneSaveQueue.$inferInsert>,
  now = new Date(),
): void {
  db.update(phoneSaveQueue)
    .set({ ...set, updatedAt: now.toISOString() })
    .where(eq(phoneSaveQueue.id, id))
    .run()
}

/** Save one queued link now. */
export async function runQueuedSave(row: typeof phoneSaveQueue.$inferSelect): Promise<void> {
  const canSave = () =>
    db
      .select({ id: phoneSaveQueue.id })
      .from(phoneSaveQueue)
      .where(
        and(
          eq(phoneSaveQueue.id, row.id),
          eq(phoneSaveQueue.userId, row.userId),
          inArray(phoneSaveQueue.status, ['waiting', 'working']),
          sql`EXISTS (SELECT 1 FROM ${users} WHERE ${users.id} = ${phoneSaveQueue.userId}
      AND ${users.approval} = 'approved'
      AND NOT EXISTS (SELECT 1 FROM user_bans WHERE user_id = ${users.id}))`,
        ),
      )
      .get() !== undefined
  const cancel = () =>
    finish(row.id, { status: 'failed', errorCode: 'cancelled', error: 'This save was cancelled.' })
  let status = 0
  let data: {
    isDuplicate?: boolean
    platform?: string
    bookmark?: { id?: string; platform?: string }
  } = {}
  try {
    if (!canSave()) {
      cancel()
      return
    }
    // New queued saves are staged privately. The final publication reads the
    // latest durable intent, never the stale row claimed before network I/O.
    // Repeat saves are untouched until that same atomic publication step.
    const response = await addBookmark(row.userId, row.url, 'phone_app', canSave, {
      defaultPrivate: true,
      // A new save is staged private, so its note shows only once it's published.
      ...(row.note === null ? {} : { note: row.note }),
    })
    status = response.status
    data = (await response.json().catch(() => ({}))) as typeof data
    if (!canSave()) {
      cancel()
      return
    }
  } catch (error) {
    captureException(error, { endpoint: 'app.save-queue' })
  }

  if (status === 400) {
    finish(row.id, { status: 'failed', errorCode: 'not_a_post', error: NOT_A_POST })
    return
  }
  if (status === 404) {
    finish(row.id, { status: 'failed', errorCode: 'unavailable', error: UNAVAILABLE })
    return
  }
  const platform = data.bookmark?.platform ?? data.platform
  const postId = data.bookmark?.id
  if (status >= 200 && status < 300 && platform && postId) {
    runInTransaction(() => {
      finish(row.id, {
        status: 'saved',
        platform,
        postId,
        alreadySaved: !!data.isDuplicate,
        attempts: row.attempts + 1,
      })
      const latest = db.select().from(phoneSaveQueue).where(eq(phoneSaveQueue.id, row.id)).get()
      if (latest) publishQueuedSave(latest)
    })
    // Link-network saves already woke the downloader; start the others now.
    if (!data.isDuplicate && !isLinkNetwork(platform)) wakeKeep()
    return
  }

  // Anything else (a slow or failing network, a server hiccup): try again later.
  const attempts = row.attempts + 1
  if (attempts > BACKOFF_MS.length) {
    finish(row.id, { status: 'failed', attempts, errorCode: 'failed', error: FAILED })
    return
  }
  finish(row.id, {
    status: 'waiting',
    attempts,
    nextAttemptAt: new Date(Date.now() + BACKOFF_MS[attempts - 1]).toISOString(),
  })
}

/** Apply a queue's latest intent in the same transaction as completion/update.
 * A new save remains private until the phone acknowledges its chosen intent.
 * Omitting a choice never changes an existing private save on a repeat share.
 */
function publishQueuedSave(row: typeof phoneSaveQueue.$inferSelect): void {
  if (row.publishPending || !row.platform || !row.postId) return
  const choice = row.privateChoice ?? (row.isPrivate ? true : undefined)
  const isPrivate = choice ?? (row.alreadySaved ? undefined : row.defaultPrivate)
  if (isPrivate === undefined) return
  const wasPrivate = db
    .select({ isPrivate: bookmarks.isPrivate })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, row.userId),
        eq(bookmarks.platform, row.platform),
        eq(bookmarks.id, row.postId),
      ),
    )
    .get()?.isPrivate
  setSavePrivate(row.userId, row.platform, row.postId, isPrivate)
  if (wasPrivate && !isPrivate && !row.alreadySaved) {
    const post = db
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, row.userId),
          eq(bookmarks.platform, row.platform),
          eq(bookmarks.id, row.postId),
        ),
      )
      .get()
    if (post)
      recordActivity({
        action: 'save',
        platform: post.platform,
        bookmarkId: post.id,
        userId: row.userId,
        author: post.author,
        authorName: post.authorName,
        text: post.text,
        contentType: post.category,
        thumbnailUrl:
          post.category === 'text' ? null : keptSrc(post.platform, post.id, 'poster', post.author),
        url: previewPath(post.platform, post.author, post.id, post.category),
        source: 'phone_app',
      })
  }
}

/** A phone's privacy choice, persisted even while the downloader is working.
 * Also acknowledges two-phase publication. Unknown/other-owner jobs fail closed.
 */
export function updateQueuedPrivacy(
  userId: string,
  id: string,
  choice?: boolean,
  intentVersion?: number,
): boolean {
  return runInTransaction(() => {
    const current = db
      .select()
      .from(phoneSaveQueue)
      .where(and(eq(phoneSaveQueue.id, id), eq(phoneSaveQueue.userId, userId)))
      .get()
    if (!current) return false
    // Versioned clients persist one monotonically increasing value per intent.
    // Accepting and applying it share this transaction. A lost response followed
    // by a retry cannot undo a later web toggle, nor can an older request win.
    if (intentVersion !== undefined && intentVersion <= current.privacyIntentVersion) return true
    // Legacy omission-only acknowledgement retries stay idempotent too.
    if (intentVersion === undefined && choice === undefined && !current.publishPending) return true
    const row = db
      .update(phoneSaveQueue)
      .set({
        ...(choice === undefined ? {} : { privateChoice: choice, isPrivate: choice }),
        publishPending: false,
        ...(intentVersion === undefined ? {} : { privacyIntentVersion: intentVersion }),
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(phoneSaveQueue.id, id), eq(phoneSaveQueue.userId, userId)))
      .returning()
      .get()
    if (!row) return false
    publishQueuedSave(row)
    return true
  })
}

/** Save everything due, one at a time (each can take a while). */
export async function saveQueueTick(now = new Date()): Promise<number> {
  const s = state()
  if (s.running) return 0
  s.running = true
  let done = 0
  try {
    for (;;) {
      const row = claimNext(new Date())
      if (!row) break
      await runQueuedSave(row)
      done++
    }
    if (now.getTime() - s.lastClean > 60 * 60_000) {
      s.lastClean = now.getTime()
      db.delete(phoneSaveQueue)
        .where(
          and(
            or(
              eq(phoneSaveQueue.status, 'failed'),
              and(eq(phoneSaveQueue.status, 'saved'), eq(phoneSaveQueue.publishPending, false)),
            ),
            lt(phoneSaveQueue.updatedAt, new Date(now.getTime() - KEEP_FINISHED_MS).toISOString()),
          ),
        )
        .run()
    }
  } catch (error) {
    captureException(error, { endpoint: 'app.save-queue' })
  } finally {
    s.running = false
  }
  return done
}

/** A link just arrived: save it now instead of on the next tick. */
export function wakeSaveQueue(): void {
  if (process.env.NODE_ENV === 'test') return
  void saveQueueTick()
}

export function startSaveQueue(): void {
  if (process.env.NODE_ENV === 'test') return
  const s = state()
  if (s.timer) return
  // A restart mid-save leaves rows marked working; try them again.
  db.update(phoneSaveQueue)
    .set({ status: 'waiting', updatedAt: new Date().toISOString() })
    .where(eq(phoneSaveQueue.status, 'working'))
    .run()
  s.timer = setInterval(() => void saveQueueTick(), TICK_MS)
  s.timer.unref?.()
  void saveQueueTick()
}

/** How many of a user's shared links are still being saved. */
export function savesInQueue(userId: string): number {
  const [row] = db
    .select({ n: sql<number>`count(*)` })
    .from(phoneSaveQueue)
    .where(
      and(
        eq(phoneSaveQueue.userId, userId),
        inArray(phoneSaveQueue.status, ['waiting', 'working']),
      ),
    )
    .all()
  return row?.n ?? 0
}
