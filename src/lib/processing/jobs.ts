import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import {
  SEMANTIC_MODEL_VERSION,
  SEMANTIC_DIMS,
  MAX_ATTEMPTS,
  PRIORITY,
  EXTRACT_KINDS,
  SCREEN_MAX_IMAGES,
  extractEnabled,
  isExtractKind,
  type ExtractKind,
  type JobKind,
} from '@/lib/semantic/config'
import { hashFor } from '@/lib/semantic/documents'
import { acceptExtracted } from '@/lib/semantic/extract-clean'
import { extractedCurrent, getExtracted, saveExtracted } from '@/lib/semantic/extracted'
import { loadPostDocument } from '@/lib/semantic/posts'
import { enqueueBackfill, kindOrderSql } from '@/lib/semantic/queue'
import { getEmbedding, isCurrent } from '@/lib/semantic/store'
import { normalize, toBlob, fromBlob } from '@/lib/semantic/vectors'
import { indexPostText } from '@/lib/semantic/keywords'
import { absolutePath, keptFile, keptFilesFor, type KeptFile } from '@/lib/keep/store'
import { readPostModeration } from '@/lib/admin/moderation'
import { indexingLevel, remoteVideoPrefix } from './config'
import { createVideoPlan, segmentBounds, type VideoPlan, type IndexingLevel } from './profiles'
import {
  claimableKinds,
  supportedProtocol,
  type ProcessingJob,
  type VideoProgress,
} from './protocol'

const LEASE_MS = 120_000
let lastBackfill = 0
export class ProcessingConflict extends Error {}
export class ProcessingInputError extends Error {}
interface Lease {
  id: string
  platform: string
  post_id: string
  kind: JobKind
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
 * private state and saver-specific bookkeeping are deliberately not read. A fresh source write after
 * asynchronous document loading must not let an old result delete its new job. */
function generation(row: Pick<Lease, 'platform' | 'post_id'>): string {
  const sources = [
    [
      'bookmarks',
      'id',
      'author,author_name,author_profile_image_url,text,tweet_url,created_at,category,is_reply,reply_context,is_quote,quote_context,quoted_tweet_id,is_retweet,retweet_context,summary,raw_json',
    ],
    [
      'bookmark_media',
      'bookmark_id',
      'media_type,original_url,preview_url,width,height,duration_ms,alt_text',
    ],
    [
      'bookmark_links',
      'bookmark_id',
      'expanded_url,link_type,domain,content_json,preview_title,preview_description,preview_image_url',
    ],
    ['kept_files', 'post_id', 'slot,path,mime,bytes,width,height,duration_ms,created_at'],
  ].map(([table, id, columns]) =>
    db.all(
      sql`SELECT DISTINCT ${sql.raw(columns)} FROM ${sql.raw(table)} WHERE platform=${row.platform} AND ${sql.raw(id)}=${row.post_id} ORDER BY ${sql.raw(columns)}`,
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

const slotNumber = (slot: string) => Number(slot.split('-')[1] ?? 0)

/**
 * Media capabilities only refer to retained files, never worker-supplied
 * paths/URLs. Most kinds read one file; text on screen reads the post's
 * pictures (at most `SCREEN_MAX_IMAGES`) and its video's frames.
 */
function mediaListFor(platform: string, postId: string, kind: JobKind): KeptFile[] {
  if (kind === 'video') return [keptFile(platform, postId, 'video-1')].filter((f) => !!f)
  if (kind === 'image')
    return [keptFile(platform, postId, 'poster') ?? keptFile(platform, postId, 'photo-1')].filter(
      (f) => !!f,
    )
  if (kind === 'speech') {
    const sound =
      keptFile(platform, postId, 'video-1') ??
      keptFilesFor(platform, postId)
        .filter((f) => f.slot.startsWith('audio-'))
        .sort((a, b) => slotNumber(a.slot) - slotNumber(b.slot))[0]
    return sound ? [sound] : []
  }
  if (kind === 'screen') {
    const files = keptFilesFor(platform, postId)
    const photos = files
      .filter((f) => f.slot.startsWith('photo-'))
      .sort((a, b) => slotNumber(a.slot) - slotNumber(b.slot))
      .slice(0, SCREEN_MAX_IMAGES)
    const video = files.find((f) => f.slot === 'video-1')
    const list = [...photos, ...(video ? [video] : [])]
    const poster = files.find((f) => f.slot === 'poster')
    return list.length ? list : poster ? [poster] : []
  }
  return []
}
function mediaFor(platform: string, postId: string, kind: JobKind): KeptFile | null {
  return mediaListFor(platform, postId, kind)[0] ?? null
}
async function content(row: Pick<Lease, 'platform' | 'post_id' | 'kind'>) {
  const moderated = readPostModeration(row.platform, row.post_id)
  if (!moderated.ok) throw new Error('Cannot read moderation state')
  if (moderated.value) return null
  const loaded = await loadPostDocument(row.platform, row.post_id)
  if (!loaded) return null
  const { doc } = loaded
  const base = hashFor(doc, row.kind)
  const list = mediaListFor(row.platform, row.post_id, row.kind)
  const media = list[0] ?? null
  // Retained-file replacement invalidates old work, even when the proxy URL stayed fixed.
  const identities = list.map((file) => {
    const createdAt = db.all<{ created_at: string }>(
      sql`SELECT created_at FROM kept_files WHERE platform=${row.platform} AND post_id=${row.post_id} AND slot=${file.slot}`,
    )[0]?.created_at
    return `${file.slot}|${file.path}|${file.bytes}|${file.durationMs}|${createdAt ?? ''}`
  })
  const identity = media
    ? row.kind === 'screen'
      ? identities.join(',')
      : identities[0].slice(identities[0].indexOf('|') + 1)
    : 'not-kept'
  const hash =
    base === null
      ? null
      : row.kind === 'video'
        ? `${remoteVideoPrefix()}${digest(`${base}|${identity}`)}`
        : row.kind !== 'text' && media
          ? `${base}:kept:${digest(identity).slice(0, 16)}`
          : base
  return { doc, hash, media, list }
}

/** Opaque identity of one retained-file generation, independent of learning kind. */
export function mediaCacheKey(platform: string, postId: string, file: KeptFile): string {
  const created = db.all<{ created_at: string }>(
    sql`SELECT created_at FROM kept_files WHERE platform=${platform} AND post_id=${postId} AND slot=${file.slot}`,
  )[0]?.created_at
  return retainedIdentity(platform, postId, file, created)
}

function retainedIdentity(
  platform: string,
  postId: string,
  file: Pick<KeptFile, 'slot' | 'path' | 'bytes'>,
  created?: string,
): string {
  return digest(JSON.stringify([platform, postId, file.slot, file.path, file.bytes, created]))
}

/** A bounded authenticated worker reconciliation. A cache key is only a local
 * reuse hint, never a capability to fetch media. Missing generations or posts
 * with no remaining media consumers are removed over subsequent bounded polls. */
export function validateMediaCacheKeys(keys: unknown): string[] {
  if (keys === undefined) return []
  if (
    !Array.isArray(keys) ||
    keys.length > 512 ||
    keys.some((key) => typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key))
  )
    throw new ProcessingInputError('Invalid worker cache keys')
  return keys
}

export function reconcileMediaCache(keys: unknown): string[] {
  const remove = new Set<string>(validateMediaCacheKeys(keys))
  if (!remove.size) return []
  const files = db.all<{
    platform: string
    post_id: string
    slot: KeptFile['slot']
    path: string
    bytes: number
    created_at: string
  }>(sql`
    SELECT k.platform,k.post_id,k.slot,k.path,k.bytes,k.created_at FROM kept_files k
    WHERE EXISTS(SELECT 1 FROM bookmarks b WHERE b.platform=k.platform AND b.id=k.post_id)
      AND NOT EXISTS(SELECT 1 FROM moderated_posts m WHERE m.platform=k.platform AND m.bookmark_id=k.post_id AND m.hidden=1)
      AND (EXISTS(SELECT 1 FROM understanding_queue q WHERE q.platform=k.platform AND q.post_id=k.post_id AND q.kind IN ('image','video','speech','screen'))
        OR EXISTS(SELECT 1 FROM processing_leases l WHERE l.platform=k.platform AND l.post_id=k.post_id AND l.kind IN ('image','video','speech','screen') AND l.expires_at>${Date.now()})
        OR EXISTS(SELECT 1 FROM media_conversions c WHERE c.platform=k.platform AND c.post_id=k.post_id AND c.slot=k.slot
          AND c.source_path=k.path AND c.source_bytes=k.bytes AND c.source_created_at=k.created_at AND c.status IN ('pending','running')))`)
  for (const file of files)
    remove.delete(retainedIdentity(file.platform, file.post_id, file, file.created_at))
  return [...remove]
}

/** Capture only server-owned capabilities before completing a lease. After the
 * transaction, release originals with no remaining queued/leased consumer.
 * A changed generation is a different key; stale generations expire on the Mac. */
export function cacheReleaseAfter(id: string, token: string): () => string[] {
  const row = checkedLease(id, token)
  const keys = keptFilesFor(row.platform, row.post_id).map((file) =>
    mediaCacheKey(row.platform, row.post_id, file),
  )
  return () => {
    const kinds = db.all<{ kind: JobKind }>(sql`SELECT kind FROM understanding_queue
      WHERE platform=${row.platform} AND post_id=${row.post_id}
      UNION SELECT kind FROM processing_leases WHERE platform=${row.platform}
        AND post_id=${row.post_id} AND expires_at>${Date.now()}`)
    const retain = new Set(
      kinds.flatMap(({ kind }) =>
        mediaListFor(row.platform, row.post_id, kind).map((file) =>
          mediaCacheKey(row.platform, row.post_id, file),
        ),
      ),
    )
    return keys.filter((key) => !retain.has(key))
  }
}

/**
 * The searchable words changed: the post's text vector is queued again in
 * the same transaction (keeping the higher priority), and the keyword row is
 * rewritten by the caller once the transaction commits.
 */
function requeueText(row: Pick<Lease, 'platform' | 'post_id'>, priority: number): void {
  const now = new Date().toISOString()
  db.run(sql`INSERT INTO understanding_queue(platform,post_id,kind,priority,attempts,enqueued_at,next_attempt_at)
    VALUES(${row.platform},${row.post_id},'text',${priority},0,${now},${now})
    ON CONFLICT(platform,post_id,kind) DO UPDATE SET priority=max(priority,excluded.priority),next_attempt_at=excluded.next_attempt_at`)
}
async function reindexWords(row: Pick<Lease, 'platform' | 'post_id'>): Promise<void> {
  const loaded = await loadPostDocument(row.platform, row.post_id)
  if (loaded) indexPostText(row.platform, row.post_id, loaded.doc.keywords)
}
function queuedPriority(row: Lease): number {
  return (
    db.all<{ priority: number }>(
      sql`SELECT priority FROM understanding_queue WHERE ${leaseWhere(row)}`,
    )[0]?.priority ?? PRIORITY.backfill
  )
}
/** Record "nothing of this kind" for an extract job; true when the post's words changed. */
function noneExtracted(row: Lease, contentHash: string | null): boolean {
  const changed = saveExtracted({
    platform: row.platform,
    postId: row.post_id,
    kind: row.kind as ExtractKind,
    contentHash,
    status: 'none',
  })
  if (changed) requeueText(row, queuedPriority(row))
  return changed
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
  advertised?: unknown,
  onRelease?: (keys: string[]) => void,
): Promise<ProcessingJob | null> {
  if (model !== SEMANTIC_MODEL_VERSION || !supportedProtocol(protocol))
    throw new ProcessingConflict('Worker model or protocol does not match server')
  if (typeof workerId !== 'string' || !/^[A-Za-z0-9._ -]{1,80}$/.test(workerId))
    throw new ProcessingInputError('Invalid worker name')
  if (advertised !== undefined && !Array.isArray(advertised))
    throw new ProcessingInputError('Invalid worker kinds')
  reapExpiredLeases()
  if (Date.now() - lastBackfill > 60_000) {
    // Work switched off here (SEMANTIC_SPEECH / SEMANTIC_SCREEN_TEXT) leaves the queue.
    for (const kind of EXTRACT_KINDS)
      if (!extractEnabled(kind)) db.run(sql`DELETE FROM understanding_queue WHERE kind=${kind}`)
    await enqueueBackfill()
    lastBackfill = Date.now()
  }
  const kinds = claimableKinds(protocol, advertised)
  if (kinds.length === 0) return null
  for (let skipped = 0; skipped < 30; skipped++) {
    const token = randomBytes(32).toString('base64url'),
      id = randomUUID(),
      now = Date.now()
    const row = runInTransaction(() => {
      // A conversion replaces retained source metadata and invalidates this
      // post's generation. Do not start expensive video, speech or OCR work
      // that would be thrown away when any pending slot is published.
      const [candidate] = db.all<{
        platform: string
        post_id: string
        kind: JobKind
      }>(sql`
        SELECT q.platform,q.post_id,q.kind FROM understanding_queue q
        WHERE q.next_attempt_at <= ${new Date(now).toISOString()}
          AND q.kind IN ${kinds}
          AND NOT EXISTS (SELECT 1 FROM moderated_posts m WHERE m.platform=q.platform AND m.bookmark_id=q.post_id AND m.hidden=1)
          AND (q.kind NOT IN ('video','speech','screen') OR NOT EXISTS (SELECT 1 FROM media_conversions c WHERE c.platform=q.platform AND c.post_id=q.post_id AND c.status IN ('pending','running')))
          AND NOT EXISTS (SELECT 1 FROM processing_leases l WHERE l.platform=q.platform AND l.post_id=q.post_id AND l.kind=q.kind)
        ORDER BY (q.priority + max(0, CAST((julianday(${new Date(now).toISOString()})-julianday(q.enqueued_at))*1440 AS INTEGER))) DESC,
          CASE WHEN q.enqueued_at < ${new Date(now - 15 * 60_000).toISOString()} THEN q.enqueued_at END,
          ${kindOrderSql(sql.raw('q.kind'))},q.enqueued_at LIMIT 1`)
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
      const freed = cacheReleaseAfter(id, token)
      let changed = false
      runInTransaction(() => {
        const owned = checkedLease(id, token)
        if (values && isExtractKind(row.kind)) changed = noneExtracted(owned, null)
        else if (values)
          db.run(
            sql`INSERT INTO post_embeddings(platform,post_id,kind,model,content_hash,dims,status,created_at) VALUES(${row.platform},${row.post_id},${row.kind},${model},'',0,'none',${new Date().toISOString()}) ON CONFLICT(platform,post_id,kind) DO UPDATE SET model=excluded.model,content_hash='',dims=0,vector=NULL,status='none',error=NULL,created_at=excluded.created_at`,
          )
        db.run(sql`DELETE FROM understanding_queue WHERE ${leaseWhere(owned)}`)
        release(owned)
      })
      if (changed) await reindexWords(row)
      onRelease?.(freed())
      continue
    }
    const current = isExtractKind(row.kind)
      ? extractedCurrent(getExtracted(row.platform, row.post_id, row.kind), row.kind, values.hash)
      : isCurrent(await getEmbedding(row.platform, row.post_id, row.kind), values.hash)
    if (current) {
      const freed = cacheReleaseAfter(id, token)
      runInTransaction(() => {
        const owned = checkedLease(id, token)
        db.run(sql`DELETE FROM understanding_queue WHERE ${leaseWhere(owned)}`)
        release(owned)
      })
      onRelease?.(freed())
      continue
    }
    if (row.kind !== 'text' && !values.media) {
      const terminal = db.all<{ status: string }>(
        sql`SELECT status FROM keep_jobs WHERE platform=${row.platform} AND post_id=${row.post_id}`,
      )[0]
      let changed = false
      runInTransaction(() => {
        const owned = checkedLease(id, token)
        const done = terminal?.status === 'done' || terminal?.status === 'unavailable'
        if (done && isExtractKind(row.kind)) {
          changed = noneExtracted(owned, values.hash)
          db.run(sql`DELETE FROM understanding_queue WHERE ${leaseWhere(owned)}`)
        } else if (done) {
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
      if (changed) await reindexWords(row)
      continue
    }
    const slots = values.list.map((f) => f.slot).join(',')
    const leased = db.run(
      sql`UPDATE processing_leases SET content_hash=${values.hash},media_slot=${slots || null} WHERE id=${id} AND expires_at>${Date.now()}`,
    )
    if (!leased.changes) continue
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
              cacheKey: mediaCacheKey(row.platform, row.post_id, values.media),
            },
          }
        : {}),
      ...(row.kind === 'screen'
        ? {
            files: values.list.map((file) => ({
              path: `/api/processing/media?id=${id}&slot=${file.slot}`,
              mime: file.mime,
              bytes: file.bytes,
              cacheKey: mediaCacheKey(row.platform, row.post_id, file),
              slot: file.slot,
            })),
            videoSeconds: values.list.find((f) => f.slot === 'video-1')?.durationMs
              ? values.list.find((f) => f.slot === 'video-1')!.durationMs! / 1000
              : null,
          }
        : {}),
      ...(state ? { video: progress(state) } : {}),
    }
  }
  return null
}

/**
 * Protocol 2: the words a worker heard or read for a speech or on-screen
 * text job. The server applies the same junk filter before storing them,
 * then re-queues the post's text vector when its words changed.
 */
export async function completeExtractJob(
  id: string,
  token: string,
  text: unknown,
  language: unknown,
): Promise<void> {
  if (text !== null && typeof text !== 'string') throw new ProcessingInputError('Invalid words')
  if (typeof text === 'string' && text.length > 64_000)
    throw new ProcessingInputError('Invalid words')
  const row = await currentLease(id, token)
  if (!isExtractKind(row.kind)) throw new ProcessingConflict('This job takes an embedding')
  const kind = row.kind
  const accepted = acceptExtracted(kind, text)
  const lang =
    kind === 'speech' &&
    typeof language === 'string' &&
    /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(language)
      ? language
      : null
  let changed = false
  runInTransaction(() => {
    requireSaved(row)
    checkedLease(id, token)
    const priority = queuedPriority(row)
    changed = saveExtracted({
      platform: row.platform,
      postId: row.post_id,
      kind,
      contentHash: row.content_hash,
      status: accepted ? 'ok' : 'none',
      text: accepted,
      language: lang,
    })
    db.run(sql`DELETE FROM understanding_queue WHERE ${leaseWhere(row)}`)
    if (changed) requeueText(row, priority)
    release(row)
  })
  if (changed) await reindexWords(row)
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
  if (isExtractKind(row.kind)) throw new ProcessingConflict('This job finishes with its words')
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

/** Shared retry budget for explicit failures and abandoned leases. Caller owns a transaction. */
function recordFailure(
  row: Lease,
  code: 'retry' | 'none',
  error: string,
  now = Date.now(),
): boolean {
  let changed = false
  const [job] = db.all<{ attempts: number }>(
    sql`SELECT attempts FROM understanding_queue WHERE ${leaseWhere(row)}`,
  )
  if (job) {
    const attempts = job.attempts + 1
    if ((code === 'none' || attempts >= MAX_ATTEMPTS) && isExtractKind(row.kind)) {
      if (code === 'none') changed = noneExtracted(row, row.content_hash)
      else
        saveExtracted({
          platform: row.platform,
          postId: row.post_id,
          kind: row.kind,
          contentHash: row.content_hash,
          status: 'failed',
          error: error.slice(0, 300),
        })
      db.run(sql`DELETE FROM understanding_queue WHERE ${leaseWhere(row)}`)
    } else if (code === 'none' || attempts >= MAX_ATTEMPTS) {
      db.run(sql`INSERT INTO post_embeddings(platform,post_id,kind,model,content_hash,dims,status,error,created_at)
          VALUES(${row.platform},${row.post_id},${row.kind},${row.model},${row.content_hash},0,${code === 'none' ? 'none' : 'failed'},${code === 'none' ? null : error.slice(0, 300)},${new Date().toISOString()})
          ON CONFLICT(platform,post_id,kind) DO UPDATE SET model=excluded.model,content_hash=excluded.content_hash,dims=0,vector=NULL,status=excluded.status,error=excluded.error,created_at=excluded.created_at`)
      db.run(sql`DELETE FROM understanding_queue WHERE ${leaseWhere(row)}`)
    } else {
      const backoff = Math.min(60 * 60_000, 30_000 * 2 ** attempts)
      db.run(
        sql`UPDATE understanding_queue SET attempts=${attempts},last_error=${error.slice(0, 300)},next_attempt_at=${new Date(now + backoff).toISOString()} WHERE ${leaseWhere(row)}`,
      )
    }
  }
  return changed
}

/** Charge each expired lease exactly once; source changes are cancellations, not failures. */
function reapExpiredLeases(): void {
  const now = Date.now()
  runInTransaction(() => {
    const expired = db.all<Lease>(
      sql`SELECT * FROM processing_leases WHERE expires_at<=${now} LIMIT 100`,
    )
    for (const row of expired) {
      if (
        row.model === SEMANTIC_MODEL_VERSION &&
        row.profile === indexingLevel() &&
        row.generation_hash === generation(row) &&
        row.content_hash
      ) {
        recordFailure(row, 'retry', 'Worker lease expired before completion', now)
      }
      release(row)
    }
  })
}

export async function failProcessingJob(
  id: string,
  token: string,
  code: 'retry' | 'none',
  error: string,
): Promise<void> {
  const row = await currentLease(id, token)
  let changed = false
  runInTransaction(() => {
    checkedLease(id, token)
    requireSaved(row)
    changed = recordFailure(row, code, error)
    release(row)
  })
  if (changed) await reindexWords(row)
}

export async function processingMedia(
  id: string,
  token: string,
  slot?: string | null,
): Promise<{ file: string; mime: string; bytes: number }> {
  const row = await currentLease(id, token)
  const leased = (row.media_slot ?? '').split(',').filter(Boolean)
  const media = slot
    ? mediaListFor(row.platform, row.post_id, row.kind).find((f) => f.slot === slot)
    : mediaFor(row.platform, row.post_id, row.kind)
  if (!media || !leased.includes(media.slot) || (!slot && media.slot !== leased[0]))
    throw new ProcessingConflict('Media is no longer retained')
  return { file: absolutePath(media.path), mime: media.mime, bytes: media.bytes }
}
