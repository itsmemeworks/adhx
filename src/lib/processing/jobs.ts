import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import {
  SEMANTIC_MODEL_VERSION,
  SEMANTIC_DIMS,
  MAX_ATTEMPTS,
  PRIORITY,
  type UnderstandingKind,
} from '@/lib/semantic/config'
import { buildPostDocument, hashFor } from '@/lib/semantic/documents'
import { loadPostItem } from '@/lib/semantic/posts'
import { enqueueBackfill } from '@/lib/semantic/queue'
import { getEmbedding, isCurrent } from '@/lib/semantic/store'
import { normalize, toBlob, fromBlob } from '@/lib/semantic/vectors'
import { indexPostText } from '@/lib/semantic/keywords'
import { absolutePath, keptFile, type KeptFile } from '@/lib/keep/store'
import { readPostModeration } from '@/lib/admin/moderation'
import { indexingLevel, remoteVideoPrefix } from './config'
import { createVideoPlan, segmentBounds, type VideoPlan, type IndexingLevel } from './profiles'
import { PROCESSING_PROTOCOL, type ProcessingJob, type VideoProgress } from './protocol'

const LEASE_MS = 120_000
let lastBackfill = 0
export class ProcessingConflict extends Error {}
export class ProcessingInputError extends Error {}
interface Lease {
  id: string
  platform: string
  post_id: string
  kind: UnderstandingKind
  lease_hash: string
  expires_at: number
  content_hash: string
  model: string
  profile: IndexingLevel
  media_slot: string | null
  generation_hash: string
}
interface VideoState {
  content_hash: string
  model: string
  profile: IndexingLevel
  duration: number
  segments: number
  frames_per_segment: number
  next_segment: number
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

/** Server-only concurrency stamp. Never sent to a worker or used as model input;
 * private tags/preferences are deliberately not read. A fresh source write after
 * asynchronous document loading must not let an old result delete its new job. */
function generation(row: Pick<Lease, 'platform' | 'post_id'>): string {
  const sources = [
    ['bookmarks', 'id'],
    ['bookmark_media', 'bookmark_id'],
    ['bookmark_links', 'bookmark_id'],
    ['kept_files', 'post_id'],
  ].map(([table, id]) =>
    db.all(
      sql`SELECT * FROM ${sql.raw(table)} WHERE platform=${row.platform} AND ${sql.raw(id)}=${row.post_id} ORDER BY rowid`,
    ),
  )
  return digest(JSON.stringify(sources))
}

function resultVector(values: number[]): Float32Array {
  if (
    !Array.isArray(values) ||
    values.length !== SEMANTIC_DIMS ||
    values.some((v) => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e6)
  )
    throw new ProcessingInputError('Invalid embedding')
  try {
    return normalize(values)
  } catch {
    throw new ProcessingInputError('Invalid embedding')
  }
}

function persistVector(row: Lease, vector: Float32Array): void {
  db.run(sql`INSERT INTO post_embeddings(platform,post_id,kind,model,content_hash,dims,vector,status,error,created_at)
    VALUES(${row.platform},${row.post_id},${row.kind},${row.model},${row.content_hash},${SEMANTIC_DIMS},${toBlob(vector)},'ok',NULL,${new Date().toISOString()})
    ON CONFLICT(platform,post_id,kind) DO UPDATE SET model=excluded.model,content_hash=excluded.content_hash,dims=excluded.dims,vector=excluded.vector,status=excluded.status,error=NULL,created_at=excluded.created_at`)
}

function leaseWhere(row: Lease) {
  return sql`platform = ${row.platform} AND post_id = ${row.post_id} AND kind = ${row.kind}`
}
function release(row: Lease): void {
  db.run(sql`DELETE FROM processing_leases WHERE id = ${row.id}`)
}
function stateFor(row: Lease): VideoState | undefined {
  return db.all<VideoState>(
    sql`SELECT * FROM video_index_state WHERE platform=${row.platform} AND post_id=${row.post_id} AND content_hash=${row.content_hash} AND model=${row.model}`,
  )[0]
}
function progress(state: VideoState): VideoProgress {
  return {
    plan: {
      duration: state.duration,
      segments: state.segments,
      framesPerSegment: state.frames_per_segment,
      level: state.profile,
    },
    nextSegment: state.next_segment,
  }
}

/** Media capabilities only refer to retained files, never worker-supplied paths/URLs. */
function mediaFor(platform: string, postId: string, kind: UnderstandingKind): KeptFile | null {
  if (kind === 'video') return keptFile(platform, postId, 'video-1')
  if (kind === 'image')
    return keptFile(platform, postId, 'poster') ?? keptFile(platform, postId, 'photo-1')
  return null
}
async function content(row: Pick<Lease, 'platform' | 'post_id' | 'kind'>) {
  const moderated = readPostModeration(row.platform, row.post_id)
  if (!moderated.ok) throw new Error('Cannot read moderation state')
  if (moderated.value) return null
  const item = await loadPostItem(row.platform, row.post_id)
  if (!item) return null
  const doc = buildPostDocument(item)
  const base = hashFor(doc, row.kind)
  const media = mediaFor(row.platform, row.post_id, row.kind)
  // Retained-file replacement invalidates old work, even when the proxy URL stayed fixed.
  const createdAt = media
    ? db.all<{ created_at: string }>(
        sql`SELECT created_at FROM kept_files WHERE platform=${row.platform} AND post_id=${row.post_id} AND slot=${media.slot}`,
      )[0]?.created_at
    : ''
  const identity = media
    ? `${media.path}|${media.bytes}|${media.durationMs}|${createdAt}`
    : 'not-kept'
  const hash =
    base === null
      ? null
      : row.kind === 'video'
        ? `${remoteVideoPrefix()}${digest(`${base}|${identity}`)}`
        : row.kind === 'image' && media
          ? `${base}:kept:${digest(identity).slice(0, 16)}`
          : base
  return { doc, hash, media }
}

/** Transactional compare-and-swap; stale workers cannot extend or finish another lease. */
export function checkedLease(id: string, token: string, now = Date.now()): Lease {
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new ProcessingConflict('Invalid or expired job lease')
  const row = db.all<Lease>(sql`SELECT * FROM processing_leases WHERE id=${id}`)[0]
  const supplied = digest(token)
  if (
    !row ||
    row.expires_at <= now ||
    row.model !== SEMANTIC_MODEL_VERSION ||
    row.profile !== indexingLevel() ||
    row.lease_hash.length !== supplied.length ||
    !timingSafeEqual(Buffer.from(row.lease_hash), Buffer.from(supplied))
  )
    throw new ProcessingConflict('Invalid or expired job lease')
  const moderation = readPostModeration(row.platform, row.post_id)
  if (!moderation.ok) throw moderation.error
  if (moderation.value || row.generation_hash !== generation(row)) {
    release(row)
    throw new ProcessingConflict('Post changed or was removed')
  }
  return row
}
async function currentLease(id: string, token: string): Promise<Lease> {
  const row = checkedLease(id, token)
  const latest = await content(row)
  if (!latest || latest.hash !== row.content_hash) {
    release(row)
    throw new ProcessingConflict('Post changed or was removed')
  }
  checkedLease(id, token)
  return row
}
function requireSaved(row: Lease): void {
  const exists = db.all(
    sql`SELECT 1 FROM bookmarks WHERE platform=${row.platform} AND id=${row.post_id} LIMIT 1`,
  )
  if (!exists.length) throw new ProcessingConflict('Post was removed')
}

export async function claimProcessingJob(
  workerId: string,
  model: string,
  protocol: number,
): Promise<ProcessingJob | null> {
  if (model !== SEMANTIC_MODEL_VERSION || protocol !== PROCESSING_PROTOCOL)
    throw new ProcessingConflict('Worker model or protocol does not match server')
  if (typeof workerId !== 'string' || !/^[A-Za-z0-9._ -]{1,80}$/.test(workerId))
    throw new ProcessingInputError('Invalid worker name')
  if (Date.now() - lastBackfill > 60_000) {
    await enqueueBackfill()
    lastBackfill = Date.now()
  }
  for (let skipped = 0; skipped < 30; skipped++) {
    const token = randomBytes(32).toString('base64url'),
      id = randomUUID(),
      now = Date.now()
    const row = runInTransaction(() => {
      const [candidate] = db.all<{
        platform: string
        post_id: string
        kind: UnderstandingKind
      }>(sql`
        SELECT q.platform,q.post_id,q.kind FROM understanding_queue q
        WHERE q.next_attempt_at <= ${new Date(now).toISOString()}
          AND NOT EXISTS (SELECT 1 FROM moderated_posts m WHERE m.platform=q.platform AND m.bookmark_id=q.post_id AND m.hidden=1)
          AND (q.kind!='video' OR NOT EXISTS (SELECT 1 FROM media_conversions c WHERE c.platform=q.platform AND c.post_id=q.post_id AND c.status IN ('pending','running')))
          AND NOT EXISTS (SELECT 1 FROM processing_leases l WHERE l.platform=q.platform AND l.post_id=q.post_id AND l.kind=q.kind AND l.expires_at>${now})
        ORDER BY q.priority DESC, CASE q.kind WHEN 'text' THEN 0 WHEN 'image' THEN 1 ELSE 2 END,q.enqueued_at LIMIT 1`)
      if (!candidate) return null
      db.run(
        sql`DELETE FROM processing_leases WHERE platform=${candidate.platform} AND post_id=${candidate.post_id} AND kind=${candidate.kind}`,
      )
      db.run(
        sql`INSERT INTO processing_leases(id,platform,post_id,kind,lease_hash,worker_id,expires_at,model,profile,generation_hash) VALUES(${id},${candidate.platform},${candidate.post_id},${candidate.kind},${digest(token)},${workerId},${now + LEASE_MS},${model},${indexingLevel()},${generation(candidate)})`,
      )
      return { ...candidate, id }
    })
    if (!row) return null
    const values = await content(row)
    if (!values || values.hash === null) {
      runInTransaction(() => {
        const owned = checkedLease(id, token)
        if (values)
          db.run(
            sql`INSERT INTO post_embeddings(platform,post_id,kind,model,content_hash,dims,status,created_at) VALUES(${row.platform},${row.post_id},${row.kind},${model},'',0,'none',${new Date().toISOString()}) ON CONFLICT(platform,post_id,kind) DO UPDATE SET model=excluded.model,content_hash='',dims=0,vector=NULL,status='none',error=NULL,created_at=excluded.created_at`,
          )
        db.run(sql`DELETE FROM understanding_queue WHERE ${leaseWhere(owned)}`)
        release(owned)
      })
      continue
    }
    const existing = await getEmbedding(row.platform, row.post_id, row.kind)
    if (isCurrent(existing, values.hash)) {
      runInTransaction(() => {
        const owned = checkedLease(id, token)
        db.run(sql`DELETE FROM understanding_queue WHERE ${leaseWhere(owned)}`)
        release(owned)
      })
      continue
    }
    if (row.kind !== 'text' && !values.media) {
      const terminal = db.all<{ status: string }>(
        sql`SELECT status FROM keep_jobs WHERE platform=${row.platform} AND post_id=${row.post_id}`,
      )[0]
      runInTransaction(() => {
        const owned = checkedLease(id, token)
        if (terminal?.status === 'done' || terminal?.status === 'unavailable') {
          db.run(
            sql`INSERT INTO post_embeddings(platform,post_id,kind,model,content_hash,dims,status,created_at) VALUES(${row.platform},${row.post_id},${row.kind},${model},${values.hash},0,'none',${new Date().toISOString()}) ON CONFLICT(platform,post_id,kind) DO UPDATE SET model=excluded.model,content_hash=excluded.content_hash,dims=0,vector=NULL,status='none',error=NULL,created_at=excluded.created_at`,
          )
          db.run(sql`DELETE FROM understanding_queue WHERE ${leaseWhere(owned)}`)
        } else
          db.run(
            sql`UPDATE understanding_queue SET next_attempt_at=${new Date(now + 30_000).toISOString()} WHERE ${leaseWhere(owned)}`,
          )
        release(owned)
      })
      continue
    }
    const changed = db.run(
      sql`UPDATE processing_leases SET content_hash=${values.hash},media_slot=${values.media?.slot ?? null} WHERE id=${id} AND expires_at>${Date.now()}`,
    )
    if (!changed.changes) continue
    const lease = checkedLease(id, token)
    if (row.kind === 'text') indexPostText(row.platform, row.post_id, values.doc.keywords)
    const state = stateFor(lease)
    return {
      id,
      lease: token,
      model,
      kind: row.kind,
      contentHash: values.hash,
      profile: lease.profile,
      ...(row.kind === 'text' ? { text: values.doc.text } : {}),
      ...(values.media
        ? {
            media: {
              path: `/api/processing/media?id=${id}`,
              mime: values.media.mime,
              bytes: values.media.bytes,
            },
          }
        : {}),
      ...(state ? { video: progress(state) } : {}),
    }
  }
  return null
}

export async function heartbeat(id: string, token: string): Promise<void> {
  const row = await currentLease(id, token)
  db.run(
    sql`UPDATE processing_leases SET expires_at=${Date.now() + LEASE_MS} WHERE id=${row.id} AND lease_hash=${row.lease_hash}`,
  )
}
export async function planProcessingVideo(
  id: string,
  token: string,
  duration: number,
): Promise<VideoProgress> {
  const row = await currentLease(id, token)
  if (row.kind !== 'video') throw new ProcessingConflict('This job is not a video')
  let plan: VideoPlan
  try {
    plan = createVideoPlan(duration, row.profile)
  } catch {
    throw new ProcessingInputError('Invalid video duration')
  }
  return runInTransaction(() => {
    requireSaved(row)
    checkedLease(id, token)
    const existing = stateFor(row)
    if (existing) {
      if (Math.abs(existing.duration - duration) > 0.01)
        throw new ProcessingConflict('Video duration changed')
      return progress(existing)
    }
    db.run(
      sql`DELETE FROM video_segments WHERE platform=${row.platform} AND post_id=${row.post_id}`,
    )
    db.run(
      sql`DELETE FROM video_index_state WHERE platform=${row.platform} AND post_id=${row.post_id}`,
    )
    db.run(
      sql`INSERT INTO video_index_state(platform,post_id,content_hash,model,profile,duration,segments,frames_per_segment,next_segment,updated_at) VALUES(${row.platform},${row.post_id},${row.content_hash},${row.model},${row.profile},${plan.duration},${plan.segments},${plan.framesPerSegment},0,${new Date().toISOString()})`,
    )
    return { plan, nextSegment: 0 }
  })
}

export async function completeProcessingJob(
  id: string,
  token: string,
  values: number[],
): Promise<void> {
  const vector = resultVector(values)
  const row = await currentLease(id, token)
  if (row.kind === 'video') throw new ProcessingConflict('Videos finish one segment at a time')
  runInTransaction(() => {
    requireSaved(row)
    checkedLease(id, token)
    persistVector(row, vector)
    db.run(sql`DELETE FROM understanding_queue WHERE ${leaseWhere(row)}`)
    release(row)
  })
}

export async function completeVideoSegment(
  id: string,
  token: string,
  index: number,
  values: number[],
): Promise<boolean> {
  const vector = resultVector(values)
  const row = await currentLease(id, token)
  if (row.kind !== 'video') throw new ProcessingConflict('This job is not a video')
  return runInTransaction(() => {
    requireSaved(row)
    checkedLease(id, token)
    const state = stateFor(row)
    if (!state || index !== state.next_segment)
      throw new ProcessingConflict('Video segment is out of order')
    const plan: VideoPlan = progress(state).plan
    const bounds = segmentBounds(plan, index)
    db.run(
      sql`INSERT INTO video_segments(platform,post_id,content_hash,model,segment_index,start_seconds,end_seconds,vector,created_at) VALUES(${row.platform},${row.post_id},${row.content_hash},${row.model},${index},${bounds.start},${bounds.end},${toBlob(vector)},${new Date().toISOString()})`,
    )
    const next = index + 1
    db.run(
      sql`UPDATE video_index_state SET next_segment=${next},updated_at=${new Date().toISOString()} WHERE platform=${row.platform} AND post_id=${row.post_id}`,
    )
    const done = next === state.segments
    if (done) {
      const rows = db.all<{ vector: Buffer }>(
        sql`SELECT vector FROM video_segments WHERE platform=${row.platform} AND post_id=${row.post_id} AND content_hash=${row.content_hash} ORDER BY segment_index`,
      )
      const sum = new Float32Array(vector.length)
      for (const r of rows) {
        const v = fromBlob(r.vector)!
        for (let i = 0; i < sum.length; i++) sum[i] += v[i]
      }
      persistVector(row, normalize(sum))
      db.run(sql`DELETE FROM understanding_queue WHERE ${leaseWhere(row)}`)
    } else {
      // An old urgent video must not monopolise the next claim after every
      // checkpoint. Explicit Up next requests can promote it again.
      db.run(
        sql`UPDATE understanding_queue SET priority=min(priority,${PRIORITY.backfill}),enqueued_at=${new Date().toISOString()} WHERE ${leaseWhere(row)}`,
      )
    }
    // Segment boundaries are natural preemption points for fresh shares.
    release(row)
    return done
  })
}

export async function failProcessingJob(
  id: string,
  token: string,
  code: 'retry' | 'none',
  error: string,
): Promise<void> {
  const row = await currentLease(id, token)
  runInTransaction(() => {
    checkedLease(id, token)
    requireSaved(row)
    const [job] = db.all<{ attempts: number }>(
      sql`SELECT attempts FROM understanding_queue WHERE ${leaseWhere(row)}`,
    )
    if (job) {
      const attempts = job.attempts + 1
      if (code === 'none' || attempts >= MAX_ATTEMPTS) {
        db.run(sql`INSERT INTO post_embeddings(platform,post_id,kind,model,content_hash,dims,status,error,created_at)
          VALUES(${row.platform},${row.post_id},${row.kind},${row.model},${row.content_hash},0,${code === 'none' ? 'none' : 'failed'},${code === 'none' ? null : error.slice(0, 300)},${new Date().toISOString()})
          ON CONFLICT(platform,post_id,kind) DO UPDATE SET model=excluded.model,content_hash=excluded.content_hash,dims=0,vector=NULL,status=excluded.status,error=excluded.error,created_at=excluded.created_at`)
        db.run(sql`DELETE FROM understanding_queue WHERE ${leaseWhere(row)}`)
      } else {
        const backoff = Math.min(60 * 60_000, 30_000 * 2 ** attempts)
        db.run(
          sql`UPDATE understanding_queue SET attempts=${attempts},last_error=${error.slice(0, 300)},next_attempt_at=${new Date(Date.now() + backoff).toISOString()} WHERE ${leaseWhere(row)}`,
        )
      }
    }
    release(row)
  })
}

export async function processingMedia(
  id: string,
  token: string,
): Promise<{ file: string; mime: string; bytes: number }> {
  const row = await currentLease(id, token)
  const media = mediaFor(row.platform, row.post_id, row.kind)
  if (!media || media.slot !== row.media_slot)
    throw new ProcessingConflict('Media is no longer retained')
  return { file: absolutePath(media.path), mime: media.mime, bytes: media.bytes }
}
