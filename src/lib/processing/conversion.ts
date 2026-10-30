import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs/promises'
import { unlinkSync } from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { readPostModeration } from '@/lib/admin/moderation'
import { absolutePath, keptFilesFor, type Slot } from '@/lib/keep/store'
import { keepH264, mediaDir } from '@/lib/keep/config'
import { settingOff } from '@/lib/settings/value'
import { reconcileKeptMedia } from '@/lib/keep/metadata'
import { probeMedia } from '@/lib/keep/probe'
import { MAX_ATTEMPTS, PRIORITY, SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'
import { enqueuePosts } from '@/lib/semantic/queue'
import { captureException } from '@/lib/sentry'
import { indexingLevel, remoteProcessing } from './config'
import { mediaCacheKey, ProcessingConflict, ProcessingInputError } from './jobs'
import { supportedProtocol, type ProcessingJob } from './protocol'

const LEASE_MS = 120_000
const MAX_OUTPUT_BYTES = 4 * 1024 ** 3
let lastRecovery = 0
let sweepOffset = 0
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

interface Conversion {
  platform: string
  post_id: string
  slot: Slot
  source_path: string
  source_bytes: number
  source_created_at: string
  source_hash: string
  width: number
  height: number
  duration_ms: number
  has_audio: number
  status: string
  attempts: number
  lease_id: string | null
  lease_hash: string | null
  expires_at: number | null
  model: string | null
}

function key(row: Conversion) {
  return sql`platform=${row.platform} AND post_id=${row.post_id} AND slot=${row.slot}`
}

/** Shared media is eligible only while somebody still saves the unhidden post. */
function sourceCurrent(row: Conversion): boolean {
  const moderation = readPostModeration(row.platform, row.post_id)
  if (!moderation.ok) throw moderation.error
  if (moderation.value) return false
  return (
    db.all(sql`SELECT 1 FROM kept_files k WHERE k.platform=${row.platform}
    AND k.post_id=${row.post_id} AND k.slot=${row.slot} AND k.path=${row.source_path}
    AND k.bytes=${row.source_bytes} AND k.created_at=${row.source_created_at}
    AND EXISTS(SELECT 1 FROM bookmarks b WHERE b.platform=k.platform AND b.id=k.post_id)
    LIMIT 1`).length > 0
  )
}

function currentLease(id: string, token: string): Conversion | null {
  const row = db.all<Conversion>(sql`SELECT * FROM media_conversions WHERE lease_id=${id}`)[0]
  if (!row) return null
  const supplied = digest(token)
  if (
    !/^[a-f0-9-]{36}$/.test(id) ||
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    row.status !== 'running' ||
    !row.expires_at ||
    row.expires_at <= Date.now() ||
    row.model !== SEMANTIC_MODEL_VERSION ||
    !row.lease_hash ||
    row.lease_hash.length !== supplied.length ||
    !timingSafeEqual(Buffer.from(row.lease_hash), Buffer.from(supplied)) ||
    !sourceCurrent(row)
  ) {
    throw new ProcessingConflict('Invalid, expired or changed conversion lease')
  }
  return row
}

/** Never place a failed conversion back on the source download queue. */
function updateKeepState(row: Pick<Conversion, 'platform' | 'post_id'>): void {
  const rows = db.all<{ status: string }>(sql`SELECT status FROM media_conversions
    WHERE platform=${row.platform} AND post_id=${row.post_id}`)
  const waiting = rows.some((r) => r.status === 'pending' || r.status === 'running')
  const failed = rows.some((r) => r.status === 'failed')
  db.run(sql`UPDATE keep_jobs SET status=${waiting ? 'converting' : failed ? 'unavailable' : 'done'},
    last_error=${!waiting && failed ? 'Browser video conversion failed; retained originals are preserved' : null},
    bytes=(SELECT coalesce(sum(bytes),0) FROM kept_files WHERE platform=${row.platform} AND post_id=${row.post_id}),
    next_attempt_at=NULL, updated_at=${new Date().toISOString()}
    WHERE platform=${row.platform} AND post_id=${row.post_id}`)
}

/** Called under a DB transaction: another writer cannot reference a removed file. */
function unlinkUnreferenced(relative: string): boolean {
  if (
    db.all(sql`SELECT 1 FROM kept_files WHERE path=${relative} LIMIT 1`).length ||
    db.all(
      sql`SELECT 1 FROM media_conversions WHERE source_path=${relative} AND status IN ('pending','running') LIMIT 1`,
    ).length
  )
    return false
  try {
    unlinkSync(absolutePath(relative))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return true
}

/** Recover crash windows without scanning the entire media disk on every poll. */
async function recoverConversionFiles(): Promise<void> {
  if (Date.now() - lastRecovery < 60_000) return
  lastRecovery = Date.now()
  // Keep successful receipts until the superseded source has really gone.
  const receipts = db.all<Conversion>(
    sql`SELECT * FROM media_conversions WHERE status='done' LIMIT 30`,
  )
  for (const receipt of receipts) {
    try {
      runInTransaction(() => {
        const current = db.all<Conversion>(
          sql`SELECT * FROM media_conversions WHERE ${key(receipt)} AND status='done' AND source_hash=${receipt.source_hash}`,
        )[0]
        if (current && unlinkUnreferenced(current.source_path))
          db.run(
            sql`DELETE FROM media_conversions WHERE ${key(receipt)} AND status='done' AND source_hash=${receipt.source_hash}`,
          )
      })
    } catch (error) {
      captureException(error, { endpoint: 'processing.conversion.recoverSource' })
    }
  }
  // A crash between rename and DB commit leaves a unique conversion output.
  // Visit at most 30 retained-video folders per minute, rotating across saves.
  const known = db.all<{ path: string }>(
    sql`SELECT path FROM kept_files WHERE slot LIKE 'video-%' ORDER BY platform,post_id,slot LIMIT 30 OFFSET ${sweepOffset}`,
  )
  sweepOffset = known.length < 30 ? 0 : sweepOffset + known.length
  for (const folder of new Set(known.map((row) => path.dirname(row.path)))) {
    try {
      const entries = await fs.opendir(absolutePath(folder))
      let inspected = 0
      for await (const entry of entries) {
        if (++inspected > 1000) break
        if (!entry.isFile() || !/^video-[1-9]\d?\.converted-[a-f0-9-]{36}\.mp4$/.test(entry.name))
          continue
        const relative = path.join(folder, entry.name)
        const info = await fs.lstat(absolutePath(relative))
        if (!info.isFile() || info.mtimeMs > Date.now() - 60 * 60_000) continue
        runInTransaction(() => unlinkUnreferenced(relative))
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        captureException(error, { endpoint: 'processing.conversion.recoverOutput' })
    }
  }
}

export async function claimConversionJob(
  workerId: string,
  model: string,
  protocol: number,
): Promise<ProcessingJob | null> {
  if (model !== SEMANTIC_MODEL_VERSION || !supportedProtocol(protocol))
    throw new ProcessingConflict('Worker model or protocol does not match server')
  if (typeof workerId !== 'string' || !/^[A-Za-z0-9._ -]{1,80}$/.test(workerId))
    throw new ProcessingInputError('Invalid worker name')
  if (!remoteProcessing()) return null
  // The switches as Admin → System has them: a saved value wins over the env.
  if (!keepH264()) {
    runInTransaction(() => {
      const rows = db.all<Conversion>(
        sql`SELECT * FROM media_conversions WHERE status IN ('pending','running','failed')`,
      )
      db.run(sql`UPDATE media_conversions SET status='cancelled',lease_id=NULL,lease_hash=NULL,expires_at=NULL,
        last_error=NULL,updated_at=${new Date().toISOString()} WHERE status IN ('pending','running','failed')`)
      for (const row of rows) updateKeepState(row)
    })
    return null
  }
  if (settingOff('KEEP_MEDIA')) return null
  await recoverConversionFiles()
  return runInTransaction(() => {
    // A deleted/replaced generation is never revived by a late worker result.
    const stale =
      db.all<Conversion>(sql`DELETE FROM media_conversions WHERE status!='done' AND (NOT EXISTS (
      SELECT 1 FROM kept_files k WHERE k.platform=media_conversions.platform
      AND k.post_id=media_conversions.post_id AND k.slot=media_conversions.slot
      AND k.path=media_conversions.source_path AND k.bytes=media_conversions.source_bytes
      AND k.created_at=media_conversions.source_created_at
    ) OR NOT EXISTS(SELECT 1 FROM bookmarks b WHERE b.platform=media_conversions.platform AND b.id=media_conversions.post_id)) RETURNING *`)
    for (const row of stale) updateKeepState(row)
    const now = Date.now()
    // Lease expiry consumes an attempt too; repeated worker crashes are bounded.
    const expired = db.all<Conversion>(sql`UPDATE media_conversions SET attempts=attempts+1,
      status=CASE WHEN attempts+1>=${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END,
      next_attempt_at=${now},expires_at=NULL,lease_hash=NULL,updated_at=${new Date(now).toISOString()},
      last_error='Conversion worker lease expired' WHERE status='running' AND expires_at<=${now} RETURNING *`)
    for (const row of expired) updateKeepState(row)
    const oldestNext =
      db.all<{ value: string }>(
        sql`SELECT value FROM server_settings WHERE key='processing.lastConversionOrder'`,
      )[0]?.value === 'newest'
    const row = db.all<Conversion>(sql`SELECT c.* FROM media_conversions c
      WHERE c.status='pending' AND c.next_attempt_at<=${now}
      AND NOT EXISTS(SELECT 1 FROM moderated_posts m WHERE m.platform=c.platform AND m.bookmark_id=c.post_id AND m.hidden=1)
      ORDER BY
        CASE WHEN ${oldestNext ? 1 : 0}=1 THEN c.source_created_at END ASC,
        CASE WHEN ${oldestNext ? 1 : 0}=0 THEN (SELECT max(b.processed_at) FROM bookmarks b WHERE b.platform=c.platform AND b.id=c.post_id) END DESC,
        c.source_created_at,c.platform,c.post_id,c.slot LIMIT 1`)[0]
    if (!row || !sourceCurrent(row)) return null
    db.run(sql`INSERT INTO server_settings(key,value,updated_at) VALUES('processing.lastConversionOrder',${oldestNext ? 'oldest' : 'newest'},${new Date(now).toISOString()})
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    const id = randomUUID(),
      token = randomBytes(32).toString('base64url')
    db.run(sql`UPDATE media_conversions SET status='running',lease_id=${id},lease_hash=${digest(token)},worker_id=${workerId},
      expires_at=${now + LEASE_MS},model=${model},updated_at=${new Date(now).toISOString()} WHERE ${key(row)}`)
    return {
      id,
      lease: token,
      model,
      kind: 'convert',
      contentHash: row.source_hash,
      profile: indexingLevel(),
      media: {
        path: `/api/processing/media?id=${id}`,
        mime: row.source_path.endsWith('.webm') ? 'video/webm' : 'video/mp4',
        bytes: row.source_bytes,
        cacheKey: mediaCacheKey(
          row.platform,
          row.post_id,
          keptFilesFor(row.platform, row.post_id).find((file) => file.slot === row.slot)!,
        ),
      },
      conversion: {
        width: row.width,
        height: row.height,
        duration: row.duration_ms / 1000,
        hasAudio: !!row.has_audio,
      },
    }
  })
}

export async function conversionHeartbeat(id: string, token: string): Promise<boolean> {
  return runInTransaction(() => {
    const row = currentLease(id, token)
    if (!row) return false
    db.run(
      sql`UPDATE media_conversions SET expires_at=${Date.now() + LEASE_MS} WHERE ${key(row)} AND lease_id=${id}`,
    )
    return true
  })
}

export async function conversionFailure(
  id: string,
  token: string,
  error: string,
): Promise<boolean> {
  return runInTransaction(() => {
    const row = currentLease(id, token)
    if (!row) return false
    const attempts = row.attempts + 1
    db.run(sql`UPDATE media_conversions SET attempts=${attempts},status=${attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'},
      next_attempt_at=${Date.now() + 30_000 * 2 ** attempts},last_error=${error.slice(0, 300)},expires_at=NULL,lease_hash=NULL,
      updated_at=${new Date().toISOString()} WHERE ${key(row)} AND lease_id=${id}`)
    updateKeepState(row)
    return true
  })
}

export async function conversionMedia(
  id: string,
  token: string,
): Promise<{ file: string; mime: string; bytes: number } | null> {
  const row = currentLease(id, token)
  if (!row) return null
  const [file] = db.all<{ mime: string }>(sql`SELECT mime FROM kept_files WHERE ${key(row)}`)
  return { file: absolutePath(row.source_path), mime: file.mime, bytes: row.source_bytes }
}

/** Verify an upload cheaply, then publish one immutable file with a guarded DB swap. */
export async function completeConversionUpload(
  id: string,
  token: string,
  tempFile: string,
): Promise<void> {
  const row = currentLease(id, token)
  if (!row) throw new ProcessingConflict('Conversion lease is unavailable')
  const info = await fs.lstat(tempFile)
  const root = await fs.realpath(mediaDir())
  const incoming = await fs.realpath(tempFile)
  const relative = path.relative(root, incoming)
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size <= 0 ||
    info.size > MAX_OUTPUT_BYTES ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    db.all(sql`SELECT 1 FROM kept_files WHERE path=${relative}`).length
  ) {
    throw new ProcessingInputError('Invalid converted upload')
  }
  const probed = await probeMedia(tempFile, { format: 'mov', localOnly: true })
  const tolerance = Math.max(250, Math.min(1000, row.duration_ms * 0.001))
  // FFmpeg normalizes camera display rotation, which can swap the two axes
  // while preserving every source pixel and the intended portrait display.
  const sameResolution =
    (probed.width === row.width && probed.height === row.height) ||
    (probed.width === row.height && probed.height === row.width)
  if (
    !probed.hasVideo ||
    probed.videoCodec !== 'h264' ||
    probed.pixelFormat !== 'yuv420p' ||
    !sameResolution ||
    !probed.durationMs ||
    Math.abs(probed.durationMs - row.duration_ms) > tolerance ||
    (row.has_audio && (!probed.hasAudio || probed.audioCodec !== 'aac'))
  ) {
    throw new ProcessingInputError(
      'Converted video must preserve the full duration, resolution and audio',
    )
  }
  const afterProbe = currentLease(id, token)
  if (!afterProbe || afterProbe.source_hash !== row.source_hash)
    throw new ProcessingConflict('Conversion generation changed')
  const source = absolutePath(row.source_path)
  const destination = path.join(path.dirname(source), `${row.slot}.converted-${randomUUID()}.mp4`)
  // Keep the source untouched until the unique output and DB transaction succeed.
  // Parent upload routes use a separate private scratch directory, not keep/.tmp.
  await fs.rename(tempFile, destination)
  let committed = false
  try {
    runInTransaction(() => {
      const current = currentLease(id, token)
      if (!current || current.source_hash !== row.source_hash)
        throw new ProcessingConflict('Conversion generation changed')
      const updated =
        db.run(sql`UPDATE kept_files SET path=${path.relative(mediaDir(), destination)},mime='video/mp4',bytes=${info.size},
        width=${probed.width},height=${probed.height},duration_ms=${probed.durationMs},created_at=${new Date().toISOString()}
        WHERE ${key(row)} AND path=${row.source_path} AND bytes=${row.source_bytes} AND created_at=${row.source_created_at}`)
      if (updated.changes !== 1) throw new ProcessingConflict('Retained source changed')
      db.run(sql`UPDATE media_conversions SET status='done',lease_id=NULL,lease_hash=NULL,expires_at=NULL,last_error=NULL,
        updated_at=${new Date().toISOString()} WHERE ${key(row)}`)
      reconcileKeptMedia(row.platform, row.post_id, keptFilesFor(row.platform, row.post_id))
      updateKeepState(row)
    })
    committed = true
  } finally {
    if (!committed) await fs.rm(destination, { force: true })
  }
  // A cleanup failure must not turn an acknowledged valid conversion into a
  // retry against a committed/deleted lease. Orphan originals remain removable.
  try {
    runInTransaction(() => unlinkUnreferenced(row.source_path))
  } catch (error) {
    captureException(error, { endpoint: 'processing.conversion.cleanup' })
  }
  await enqueuePosts([{ platform: row.platform, postId: row.post_id }], PRIORITY.sync, [
    'video',
  ]).catch((error) => captureException(error, { endpoint: 'processing.conversion.queue' }))
}
