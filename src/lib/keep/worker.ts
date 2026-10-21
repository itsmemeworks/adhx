import fs from 'fs/promises'
import { repairDarkPosters } from './poster'
import { newWorkPaused } from '@/lib/processing/pause'
import { and, eq, sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { bookmarks, keepJobs, keepSettings } from '@/lib/db/schema'
import { captureException } from '@/lib/sentry'
import { noteSaved, PRIORITY } from '@/lib/semantic'
import { keepBackfill, keepConcurrency, keepEnabled, keepMinFreeBytes, mediaDir } from './config'
import { keepPost, NothingToKeep } from './download'
import {
  clearKeepProgress,
  keepProgress,
  reportKeepConverting,
  reportKeepProgress,
} from './progress'
import { forgetPost, recordKept } from './store'
import { YtdlpError } from './ytdlp'

/**
 * The download queue. Every saved post gets a `keep_jobs` row; a few run at a
 * time, newest saves first, so a fresh save is kept within seconds and older
 * saves fill in behind it. Failures retry with growing waits, then give up
 * (the post keeps playing through the old proxy where there is one).
 */

const TICK_MS = 5_000
const SCAN_EVERY_MS = 30_000
const CLEAN_EVERY_MS = 60 * 60_000
/** Waits before each retry; after the last, the job is marked unavailable. */
const BACKOFF_MS = [60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000]
/** Tries a download gets before it gives up: the first, then one per wait. */
export const KEEP_MAX_ATTEMPTS = BACKOFF_MS.length + 1

interface State {
  timer: ReturnType<typeof setInterval> | null
  owner: symbol | null
  running: number
  lastScan: number
  lastPosterRepair?: number
  lastClean: number
  /** With KEEP_BACKFILL=off: only saves made after this. */
  since: string | null
}

const g = globalThis as unknown as { __adhxKeep?: State }
function state(): State {
  g.__adhxKeep ??= { timer: null, owner: null, running: 0, lastScan: 0, lastClean: 0, since: null }
  return g.__adhxKeep
}

/**
 * Add a pending job for every saved post that doesn't have one (only posts
 * saved since `since`, when given).
 */
export function scanForNewSaves(limit = 1000, since: string | null = null): number {
  const now = new Date().toISOString()
  const result = db.run(sql`
    INSERT OR IGNORE INTO keep_jobs (platform, post_id, status, attempts, updated_at)
    SELECT DISTINCT b.platform, b.id, 'pending', 0, ${now}
    FROM bookmarks b
    WHERE NOT EXISTS (
      SELECT 1 FROM keep_jobs j WHERE j.platform = b.platform AND j.post_id = b.id
    )
      AND (${since} IS NULL OR b.processed_at >= ${since})
    LIMIT ${limit}
  `)
  return result.changes
}

/**
 * Claim the next job, newest save first (only posts saved since `since`, when
 * given — so turning the backfill off also skips older jobs already queued).
 */
export function claimNext(
  now = new Date(),
  since: string | null = null,
): { platform: string; postId: string } | null {
  const iso = now.toISOString()
  const [next] = db.all<{ platform: string; postId: string }>(sql`
    SELECT j.platform AS platform, j.post_id AS postId
    FROM keep_jobs j
    WHERE j.status IN ('pending', 'failed')
      AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= ${iso})
      AND (${since} IS NULL OR EXISTS (
        SELECT 1 FROM bookmarks b
        WHERE b.platform = j.platform AND b.id = j.post_id AND b.processed_at >= ${since}
      ))
    ORDER BY j.status = 'failed',
      (SELECT MAX(b.processed_at) FROM bookmarks b WHERE b.platform = j.platform AND b.id = j.post_id) DESC
    LIMIT 1
  `)
  if (!next) return null
  const claimed = db
    .update(keepJobs)
    .set({ status: 'running', progress: null, updatedAt: iso })
    .where(
      and(
        eq(keepJobs.platform, next.platform),
        eq(keepJobs.postId, next.postId),
        sql`${keepJobs.status} IN ('pending', 'failed')`,
      ),
    )
    .run()
  return claimed.changes === 1 ? next : null
}

function fail(platform: string, postId: string, error: unknown): void {
  const [job] = db
    .select({ attempts: keepJobs.attempts })
    .from(keepJobs)
    .where(and(eq(keepJobs.platform, platform), eq(keepJobs.postId, postId)))
    .all()
  const attempts = (job?.attempts ?? 0) + 1
  const permanent =
    error instanceof NothingToKeep || (error instanceof YtdlpError && error.permanent)
  const giveUp = permanent || attempts > BACKOFF_MS.length
  const message = error instanceof Error ? error.message : String(error)
  db.update(keepJobs)
    .set({
      status: giveUp ? 'unavailable' : 'failed',
      attempts,
      lastError: message.slice(0, 500),
      nextAttemptAt: giveUp ? null : new Date(Date.now() + BACKOFF_MS[attempts - 1]).toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(keepJobs.platform, platform), eq(keepJobs.postId, postId)))
    .run()
}

/** Persisted percents move in steps of this much (one write per step at most). */
const PROGRESS_STEP = 5

/**
 * Write the download percent to `keep_jobs.progress` once per step, so the
 * theater's "Getting it ready" ring (`keep-status.ts`) has it even when the
 * in-memory progress is gone (a restart, another process).
 */
function persistKeepProgress(platform: string, postId: string): void {
  const percent = keepProgress(platform, postId)
  if (percent === null) return
  const stepped = Math.floor(percent / PROGRESS_STEP) * PROGRESS_STEP
  try {
    db.update(keepJobs)
      .set({ progress: stepped })
      .where(
        and(
          eq(keepJobs.platform, platform),
          eq(keepJobs.postId, postId),
          eq(keepJobs.status, 'running'),
          sql`COALESCE(${keepJobs.progress}, -1) < ${stepped}`,
        ),
      )
      .run()
  } catch (error) {
    captureException(error, { endpoint: 'keep.progress' })
  }
}

/** Download one post now. */
export async function runJob(platform: string, postId: string): Promise<void> {
  const [saved] = db
    .select({ author: bookmarks.author, category: bookmarks.category })
    .from(bookmarks)
    .where(and(eq(bookmarks.platform, platform), eq(bookmarks.id, postId)))
    .limit(1)
    .all()
  if (!saved) {
    await forgetPost(platform, postId)
    return
  }
  try {
    const files = await keepPost({
      platform,
      postId,
      author: saved.author,
      category: saved.category,
      onProgress: (percent) => {
        reportKeepProgress(platform, postId, percent)
        persistKeepProgress(platform, postId)
      },
      onConverting: () => reportKeepConverting(platform, postId),
    })
    await recordKept(platform, postId, files)
    // Understand it again from the kept files (unchanged parts are skipped).
    if (files.length) noteSaved([{ platform, postId }], PRIORITY.sync)
  } catch (error) {
    fail(platform, postId, error)
  } finally {
    clearKeepProgress(platform, postId)
  }
}

/** Delete files for posts nobody has saved any more. */
export async function cleanUp(): Promise<number> {
  const orphans = db.all<{ platform: string; postId: string }>(sql`
    SELECT j.platform AS platform, j.post_id AS postId FROM keep_jobs j
    WHERE NOT EXISTS (SELECT 1 FROM bookmarks b WHERE b.platform = j.platform AND b.id = j.post_id)
    LIMIT 500
  `)
  for (const o of orphans) await forgetPost(o.platform, o.postId)
  // Scratch folders left by a crash.
  await fs.rm(`${mediaDir()}/.tmp`, { recursive: true, force: true }).catch(() => {})
  return orphans.length
}

async function tick(): Promise<void> {
  const s = state()
  try {
    const now = Date.now()
    if (now - s.lastClean > CLEAN_EVERY_MS && s.running === 0) {
      s.lastClean = now
      await cleanUp()
    }
    if (now - s.lastScan > SCAN_EVERY_MS) {
      s.lastScan = now
      scanForNewSaves(1000, s.since)
    }
    if (!(await diskHasRoom())) return
    // An admin paused new work (Processing): running downloads finish, nothing new starts.
    if (newWorkPaused()) return
    while (s.running < keepConcurrency()) {
      const job = claimNext(new Date(), s.since)
      if (!job) break
      s.running++
      void runJob(job.platform, job.postId)
        .catch((error) => captureException(error, { endpoint: 'keep.runJob' }))
        .finally(() => {
          s.running--
        })
    }
    if (s.running === 0 && now - (s.lastPosterRepair ?? 0) >= 5 * 60_000) {
      s.lastPosterRepair = now
      // Revisited after resume; the repair helper enforces local mode and pause.
      void repairDarkPosters().catch((error) =>
        captureException(error, { endpoint: 'keep.posterRepair' }),
      )
    }
  } catch (error) {
    captureException(error, { endpoint: 'keep.tick' })
  }
}

let warnedFull = 0

/** Free bytes on the media disk, or null when it can't be read. */
export async function freeDiskBytes(): Promise<number | null> {
  try {
    await fs.mkdir(mediaDir(), { recursive: true })
    const stats = await fs.statfs(mediaDir())
    return stats.bavail * stats.bsize
  } catch {
    return null
  }
}

/** Pause downloading while the media disk is nearly full (KEEP_MIN_FREE_GB). */
export async function diskHasRoom(): Promise<boolean> {
  try {
    const free = await freeDiskBytes()
    if (free === null || free >= keepMinFreeBytes()) return true
    if (Date.now() - warnedFull > 60 * 60_000) {
      warnedFull = Date.now()
      console.warn(
        `[keep] Paused: ${(free / 1024 ** 3).toFixed(1)} GB free in ${mediaDir()} (KEEP_MIN_FREE_GB)`,
      )
    }
    return false
  } catch {
    return true
  }
}

/**
 * With KEEP_BACKFILL=off, the save time before which posts are left alone
 * (null when everything is kept, or when the worker isn't running here).
 */
export function keepCutoff(): string | null {
  const s = state()
  return s.timer ? s.since : null
}

/** A save just happened: look for it now instead of on the next scan. */
export function wakeKeep(): void {
  if (!keepEnabled()) return
  state().lastScan = 0
  void tick()
}

const MODULE = Symbol('keep-worker')

/** Keep the backfill-off boundary across restarts; enabling backfill resets it. */
export function backfillCutoff(now = new Date()): string | null {
  return runInTransaction(() => {
    if (keepBackfill()) {
      db.delete(keepSettings).where(eq(keepSettings.key, 'backfill_cutoff')).run()
      return null
    }
    db.insert(keepSettings)
      .values({ key: 'backfill_cutoff', value: new Date(now.getTime() - 60_000).toISOString() })
      .onConflictDoNothing()
      .run()
    return db.select().from(keepSettings).where(eq(keepSettings.key, 'backfill_cutoff')).get()!
      .value
  })
}

export function startKeeping(): void {
  if (!keepEnabled()) return
  const s = state()
  if (s.owner && s.owner !== MODULE && s.timer) {
    clearInterval(s.timer)
    s.timer = null
  }
  if (s.timer) return
  s.owner = MODULE
  s.since = backfillCutoff()
  // A restart mid-download leaves rows marked running; try them again.
  db.update(keepJobs)
    .set({ status: 'pending', updatedAt: new Date().toISOString() })
    .where(eq(keepJobs.status, 'running'))
    .run()
  s.timer = setInterval(() => void tick(), TICK_MS)
  s.timer.unref?.()
  void tick()
}
