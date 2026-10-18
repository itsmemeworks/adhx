import { sql } from 'drizzle-orm'
import { repairUnloadedArticles } from '@/lib/sync/repair-articles'
import { db } from '@/lib/db'
import type { UnderstandingJob } from '@/lib/db/schema'
import { captureException } from '@/lib/sentry'
import { PRIORITY, VIDEO_FPS, semanticEnabled, type UnderstandingKind } from './config'
import { buildPostDocument, hashFor, type PostDocument } from './documents'
import { indexPostText } from './keywords'
import {
  fetchImageBytes,
  MediaUnavailableError,
  MediaGoneError,
  NotAVideoError,
  keptLocalFile,
  sampleVideoFrames,
} from './media'
import { embedImageBytes, embedTexts, embedVideoFrames } from './model'
import { loadPostItem } from './posts'
import { completeJob, enqueueBackfill, enqueuePosts, failJob, nextJob } from './queue'
import { getEmbedding, isCurrent, saveEmbedding } from './store'

/**
 * The understanding worker, run inside the `jobs` child process (never the
 * web server; see `supervisor.ts`): one job at a time, resting between
 * jobs so web requests on the same CPU stay snappy (pond's pacing: rest ≈ half
 * of the last run, clamped). The queue is durable, so a restart just resumes.
 */
export interface WorkerActivity {
  platform: string
  postId: string
  kind: UnderstandingKind
  phase: 'loading' | 'sampling' | 'understanding'
  frames: number
  startedAt: string
}

type WorkerState = {
  running: boolean
  wake: (() => void) | null
  current: WorkerActivity | null
  lastRunMs: number
}

const g = globalThis as unknown as { __adhxUnderstandingWorker?: WorkerState }
const state: WorkerState = (g.__adhxUnderstandingWorker ??= {
  running: false,
  wake: null,
  current: null,
  lastRunMs: 0,
})

const IDLE_POLL_MS = 15_000
const REST_MIN_MS = 400
const REST_MAX_MS = 3_000

export function currentActivity(): WorkerActivity | null {
  return state.current
}

/** Nudge an idle worker after new work is queued. */
export function wakeWorker(): void {
  state.wake?.()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      state.wake = null
      resolve()
    }, ms)
    timer.unref?.()
    state.wake = () => {
      clearTimeout(timer)
      state.wake = null
      resolve()
    }
  })
}

async function understand(job: UnderstandingJob, doc: PostDocument): Promise<Float32Array> {
  const activity = state.current!
  if (job.kind === 'text') {
    activity.phase = 'understanding'
    const [vector] = await embedTexts([doc.text])
    return vector
  }
  if (job.kind === 'image') {
    const bytes = await fetchImageBytes(doc.image!.url)
    activity.phase = 'understanding'
    return embedImageBytes(bytes)
  }
  activity.phase = 'sampling'
  const sampled = await sampleVideoFrames(doc.video!.url)
  try {
    activity.frames = sampled.files.length
    activity.phase = 'understanding'
    return await embedVideoFrames(sampled.files, sampled.duration, 1 / VIDEO_FPS)
  } finally {
    await sampled.cleanup()
  }
}

/** Process one queued job. Exported for tests. */
export async function processJob(
  job: UnderstandingJob,
): Promise<'done' | 'skipped' | 'retry' | 'failed'> {
  const kind = job.kind as UnderstandingKind
  state.current = {
    platform: job.platform,
    postId: job.postId,
    kind,
    phase: 'loading',
    frames: 0,
    startedAt: new Date().toISOString(),
  }
  try {
    const item = await loadPostItem(job.platform, job.postId)
    if (!item) {
      await completeJob(job) // nobody has this post saved any more
      return 'skipped'
    }
    const doc = buildPostDocument(item)
    // Keywords are cheap and model-free: keep them current on every text job.
    if (kind === 'text') indexPostText(job.platform, job.postId, doc.keywords)
    const hash = await withKeptState(hashFor(doc, kind), kind, doc)
    const existing = await getEmbedding(job.platform, job.postId, kind)
    if (isCurrent(existing, hash)) {
      await completeJob(job)
      return 'skipped'
    }
    if (hash === null) {
      await saveEmbedding({
        platform: job.platform,
        postId: job.postId,
        kind,
        contentHash: null,
        status: 'none',
      })
      await completeJob(job)
      return 'skipped'
    }
    try {
      const vector = await understand(job, doc)
      await saveEmbedding({
        platform: job.platform,
        postId: job.postId,
        kind,
        contentHash: hash,
        status: 'ok',
        vector,
      })
      await completeJob(job)
      return 'done'
    } catch (error) {
      // A photo labelled as a video, or media deleted upstream: nothing to
      // learn, and retrying can't help, so it isn't counted as a failure.
      if (error instanceof NotAVideoError || error instanceof MediaGoneError) {
        await saveEmbedding({
          platform: job.platform,
          postId: job.postId,
          kind,
          contentHash: hash,
          status: 'none',
          error: error instanceof MediaGoneError ? error.message : undefined,
        })
        await completeJob(job)
        return 'skipped'
      }
      const message = error instanceof Error ? error.message : String(error)
      const permanent =
        error instanceof MediaUnavailableError && /not allowed|must be/.test(message)
      const gaveUp = permanent || (await failJob(job, message))
      if (gaveUp) {
        if (permanent) await completeJob(job)
        await saveEmbedding({
          platform: job.platform,
          postId: job.postId,
          kind,
          contentHash: hash,
          status: 'failed',
          error: message,
        })
        return 'failed'
      }
      return 'retry'
    }
  } finally {
    state.current = null
  }
}

/**
 * A picture or video is learned again once ADHX has its own copy: the hash
 * says whether the file was kept, so the switch from proxy to kept file (or
 * from "not downloaded yet") counts as new content.
 */
async function withKeptState(
  hash: string | null,
  kind: string,
  doc: PostDocument,
): Promise<string | null> {
  if (!hash) return hash
  const url = kind === 'video' ? doc.video?.url : kind === 'image' ? doc.image?.url : null
  if (!url) return hash
  const kept = await keptLocalFile(url)
  return kept ? `${hash}:kept` : hash
}

/**
 * Posts understood before the keyword index existed have no keyword row.
 * Fill them in without the model (no re-embedding). Exported for tests.
 */
export async function backfillKeywordIndex(): Promise<number> {
  const rows = db.all<{ platform: string; post_id: string }>(sql`
    SELECT e.platform AS platform, e.post_id AS post_id
    FROM post_embeddings e
    WHERE e.kind = 'text'
      AND NOT EXISTS (
        SELECT 1 FROM post_text_fts f WHERE f.platform = e.platform AND f.post_id = e.post_id
      )
  `)
  let done = 0
  for (const row of rows) {
    const item = await loadPostItem(row.platform, row.post_id)
    if (!item) continue
    indexPostText(row.platform, row.post_id, buildPostDocument(item).keywords)
    done++
    if (done % 50 === 0) await new Promise((resolve) => setImmediate(resolve))
  }
  return done
}

/**
 * Posts understood as words before "no words of its own" became 'none'
 * (`PostDocument.hasWords`): mark them so they stop matching on an author
 * line. Short keyword rows are the only candidates, so this stays cheap.
 * Exported for tests.
 */
export async function clearWordlessText(): Promise<number> {
  const rows = db.all<{ platform: string; post_id: string }>(sql`
    SELECT e.platform AS platform, e.post_id AS post_id
    FROM post_embeddings e
    JOIN post_text_fts f ON f.platform = e.platform AND f.post_id = e.post_id
    WHERE e.kind = 'text' AND e.status = 'ok' AND length(f.body) < 200
  `)
  let cleared = 0
  for (const row of rows) {
    const item = await loadPostItem(row.platform, row.post_id)
    if (!item || buildPostDocument(item).hasWords) continue
    await saveEmbedding({
      platform: row.platform,
      postId: row.post_id,
      kind: 'text',
      contentHash: null,
      status: 'none',
    })
    cleared++
  }
  return cleared
}

async function loop(): Promise<void> {
  try {
    await enqueueBackfill()
    await backfillKeywordIndex()
    await clearWordlessText()
  } catch (error) {
    captureException(error, { endpoint: 'semantic.backfill' })
  }
  // Network work, so after the local passes; the posts it fixes get re-read.
  try {
    const repaired = await repairUnloadedArticles()
    if (repaired.length) await enqueuePosts(repaired, PRIORITY.sync, ['text', 'image'])
  } catch (error) {
    captureException(error, { endpoint: 'semantic.repair-articles' })
  }
  while (state.running) {
    let job: UnderstandingJob | undefined
    try {
      job = await nextJob()
    } catch (error) {
      captureException(error, { endpoint: 'semantic.nextJob' })
    }
    if (!job) {
      await sleep(IDLE_POLL_MS)
      continue
    }
    const started = Date.now()
    try {
      await processJob(job)
    } catch (error) {
      captureException(error, { endpoint: 'semantic.processJob', kind: job.kind })
    }
    state.lastRunMs = Date.now() - started
    if (job.kind !== 'text' && process.env.NODE_ENV !== 'production') {
      // Dev-only timing line; production relies on Sentry for failures.
      // eslint-disable-next-line no-console
      console.info(`[understanding] ${job.kind} ${job.platform}:${job.postId} ${state.lastRunMs}ms`)
    }
    const rest =
      job.kind === 'text' ? 0 : Math.min(REST_MAX_MS, Math.max(REST_MIN_MS, state.lastRunMs * 0.5))
    if (rest) await sleep(rest)
  }
}

/** Start the worker once per process. No-op when the pipeline is turned off. */
export function startUnderstandingWorker(): void {
  if (state.running || !semanticEnabled()) return
  state.running = true
  void loop().finally(() => {
    state.running = false
  })
}

export function stopUnderstandingWorker(): void {
  state.running = false
  state.wake?.()
}
