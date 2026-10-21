import { and, asc, desc, eq, lte, sql, type SQLWrapper } from 'drizzle-orm'
import { db } from '@/lib/db'
import { videoResultCurrent } from '@/lib/processing/config'
import { newWorkPaused } from '@/lib/processing/pause'
import {
  bookmarks,
  postEmbeddings,
  postExtractedText,
  understandingQueue,
  type UnderstandingJob,
} from '@/lib/db/schema'
import {
  EXTRACT_KINDS,
  KIND_ORDER,
  MAX_ATTEMPTS,
  PRIORITY,
  SEMANTIC_MODEL_VERSION,
  extractVersion,
  jobKinds,
  type JobKind,
} from './config'

export interface PostKey {
  platform: string
  postId: string
}

const BATCH = 200

/**
 * Queue every kind for these posts. A post already queued keeps its place but
 * is promoted to the higher priority and becomes due now — that is how fresh
 * saves and up-next posts jump the line.
 */
export async function enqueuePosts(
  keys: PostKey[],
  priority: number,
  kinds: readonly JobKind[] = jobKinds(),
): Promise<number> {
  if (keys.length === 0) return 0
  const now = new Date().toISOString()
  const rows = keys.flatMap((k) =>
    kinds.map((kind) => ({
      platform: k.platform || 'twitter',
      postId: k.postId,
      kind,
      priority,
      attempts: 0,
      enqueuedAt: now,
      nextAttemptAt: now,
    })),
  )
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(understandingQueue)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoUpdate({
        target: [understandingQueue.platform, understandingQueue.postId, understandingQueue.kind],
        set: {
          priority: sql`max(${understandingQueue.priority}, excluded.priority)`,
          nextAttemptAt: sql`CASE WHEN excluded.priority > ${understandingQueue.priority} THEN excluded.next_attempt_at ELSE ${understandingQueue.nextAttemptAt} END`,
        },
      })
  }
  return rows.length
}

/**
 * Queue (at backfill priority) every saved post that has no current result
 * for some kind. Idempotent and cheap enough to call on startup and whenever
 * someone opens the status view.
 */
export async function enqueueBackfill(userId?: string): Promise<number> {
  const saved = await db
    .selectDistinct({ platform: bookmarks.platform, postId: bookmarks.id })
    .from(bookmarks)
    .where(userId ? eq(bookmarks.userId, userId) : undefined)
  if (saved.length === 0) return 0
  const done = await db
    .select({
      platform: postEmbeddings.platform,
      postId: postEmbeddings.postId,
      kind: postEmbeddings.kind,
      contentHash: postEmbeddings.contentHash,
    })
    .from(postEmbeddings)
    .where(eq(postEmbeddings.model, SEMANTIC_MODEL_VERSION))
  const have = new Set(
    done
      .filter((d) => d.kind !== 'video' || videoResultCurrent(d.contentHash))
      .map((d) => `${d.platform}:${d.postId}:${d.kind}`),
  )
  const queued = await db
    .select({
      platform: understandingQueue.platform,
      postId: understandingQueue.postId,
      kind: understandingQueue.kind,
    })
    .from(understandingQueue)
  for (const q of queued) have.add(`${q.platform}:${q.postId}:${q.kind}`)
  const extracted = await db
    .select({
      platform: postExtractedText.platform,
      postId: postExtractedText.postId,
      kind: postExtractedText.kind,
      model: postExtractedText.model,
    })
    .from(postExtractedText)
  for (const e of extracted) {
    const kind = EXTRACT_KINDS.find((k) => k === e.kind)
    if (kind && e.model === extractVersion(kind)) have.add(`${e.platform}:${e.postId}:${e.kind}`)
  }
  const kinds = jobKinds()
  const now = new Date().toISOString()
  const missing = saved.flatMap((s) =>
    kinds
      .filter((kind) => !have.has(`${s.platform}:${s.postId}:${kind}`))
      .map((kind) => ({
        platform: s.platform,
        postId: s.postId,
        kind,
        priority: PRIORITY.backfill,
        attempts: 0,
        enqueuedAt: now,
        nextAttemptAt: now,
      })),
  )
  for (let i = 0; i < missing.length; i += BATCH) {
    await db
      .insert(understandingQueue)
      .values(missing.slice(i, i + BATCH))
      .onConflictDoNothing()
  }
  return missing.length
}

/** `CASE kind …` in `KIND_ORDER`: within a priority, cheap results land first. */
export function kindOrderSql(column: SQLWrapper) {
  return sql`CASE ${column} ${sql.raw(
    Object.entries(KIND_ORDER)
      .map(([kind, order]) => `WHEN '${kind}' THEN ${order}`)
      .join(' '),
  )} ELSE 9 END`
}

/**
 * The next due job: highest priority first; within a priority, words, then
 * a picture, what is said, text on screen and the video (cheap results land
 * first); then oldest first.
 */
export async function nextJob(now = new Date()): Promise<UnderstandingJob | undefined> {
  // An admin paused new work (Processing).
  if (newWorkPaused()) return undefined
  const [job] = await db
    .select()
    .from(understandingQueue)
    .where(lte(understandingQueue.nextAttemptAt, now.toISOString()))
    .orderBy(
      desc(understandingQueue.priority),
      kindOrderSql(understandingQueue.kind),
      asc(understandingQueue.enqueuedAt),
    )
    .limit(1)
  return job
}

function where(job: Pick<UnderstandingJob, 'platform' | 'postId' | 'kind'>) {
  return and(
    eq(understandingQueue.platform, job.platform),
    eq(understandingQueue.postId, job.postId),
    eq(understandingQueue.kind, job.kind),
  )
}

export async function completeJob(
  job: Pick<UnderstandingJob, 'platform' | 'postId' | 'kind'>,
): Promise<void> {
  await db.delete(understandingQueue).where(where(job))
}

/**
 * Record a failed attempt. Returns true when the job has given up (the caller
 * stores a `failed` result so it is not retried until content or model changes,
 * or someone presses Retry).
 */
export async function failJob(
  job: UnderstandingJob,
  error: string,
  now = new Date(),
): Promise<boolean> {
  const attempts = job.attempts + 1
  if (attempts >= MAX_ATTEMPTS) {
    await completeJob(job)
    return true
  }
  const backoffMs = Math.min(60 * 60_000, 30_000 * 2 ** attempts)
  await db
    .update(understandingQueue)
    .set({
      attempts,
      lastError: error.slice(0, 500),
      nextAttemptAt: new Date(now.getTime() + backoffMs).toISOString(),
    })
    .where(where(job))
  return false
}
