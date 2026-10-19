import { and, asc, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { nanoid } from '@/lib/utils'
import { db } from '@/lib/db'
import { phoneSaveQueue } from '@/lib/db/schema'
import { addBookmark } from '@/lib/bookmarks/add'
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

/** Take a shared link: it's saved in the background. */
export function enqueueSave(userId: string, url: string, now = new Date()): QueuedSave {
  const id = nanoid()
  const iso = now.toISOString()
  db.insert(phoneSaveQueue)
    .values({ id, userId, url, status: 'waiting', createdAt: iso, updatedAt: iso })
    .run()
  wakeSaveQueue()
  return {
    id,
    state: 'waiting',
    platform: null,
    postId: null,
    alreadySaved: false,
    errorCode: null,
    error: null,
  }
}

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
  let status = 0
  let data: {
    isDuplicate?: boolean
    platform?: string
    bookmark?: { id?: string; platform?: string }
  } = {}
  try {
    const response = await addBookmark(row.userId, row.url, 'phone_app')
    status = response.status
    data = (await response.json().catch(() => ({}))) as typeof data
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
    finish(row.id, {
      status: 'saved',
      platform,
      postId,
      alreadySaved: !!data.isDuplicate,
      attempts: row.attempts + 1,
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
            inArray(phoneSaveQueue.status, ['saved', 'failed']),
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
