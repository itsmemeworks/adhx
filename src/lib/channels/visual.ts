import { postKeyBatches, postKeyWhere } from '@/lib/db/post-keys'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { visibleSave } from '@/lib/people/savers'
import { absolutePath } from '@/lib/keep/store'
import { mediaDir } from '@/lib/keep/config'
import { newWorkPaused } from '@/lib/processing/pause'
import {
  CHANNEL_IMAGE_MODEL,
  askJevImages,
  channelImagesEnabled,
  type VisualPost,
} from '@/lib/semantic/jev-images'
import { CHANNEL_NAMES } from './names'
import {
  VISUAL_POLICY,
  sampleMembers,
  visualQuestions,
  interpretVisualAnswers,
  applyVisualResult,
  type VisualChannel,
  type VisualSample,
  type VisualResult,
} from './visual-policy'

const WEEK = 7 * 24 * 60 * 60_000
const MAX_JOBS = 256
type Source = {
  key: string
  text: string
  file: string
  bytes: number
  changed: string
  canExclude: boolean
}
type Payload = { channel: VisualChannel }
type Job = {
  scope: string
  slug: string
  user_id: string | null
  revision: string
  payload: string
  result: string | null
  status: string
  attempts: number
  updated_at: number
  lease: string | null
}
const state = globalThis as unknown as {
  __adhxVisualTick?: Promise<void>
  __adhxVisualTimer?: ReturnType<typeof setInterval>
}

function sourcesFor(channel: VisualChannel, userId: string | null): Source[] {
  if (!channel.keys.length || channel.keys.length > 2000) return []
  if (
    userId !== null &&
    !db.get(sql`SELECT id FROM users WHERE id = ${userId}
    AND NOT EXISTS (SELECT 1 FROM user_bans WHERE user_id = ${userId})`)
  )
    return []
  const keys = new Set(channel.keys)
  const rows = postKeyBatches(channel.keys).flatMap((part) =>
    db.all<{ platform: string; id: string; text: string }>(sql`
    SELECT b.platform, b.id, b.text FROM bookmarks b WHERE ${visibleSave('b')}
      AND EXISTS (SELECT 1 FROM users u WHERE u.id = b.user_id)
      AND ${postKeyWhere(sql`b.platform`, sql`b.id`, part)}
      AND NOT EXISTS (SELECT 1 FROM moderated_posts m WHERE m.platform = b.platform AND m.bookmark_id = b.id AND m.hidden = 1)
      ORDER BY b.processed_at DESC`),
  )
  const texts = new Map<string, string>()
  for (const row of rows) {
    const key = `${row.platform}:${row.id}`
    if (keys.has(key) && !texts.has(key)) texts.set(key, row.text)
  }
  const files = postKeyBatches(channel.keys).flatMap((part) =>
    db.all<{
      platform: string
      post_id: string
      path: string
      bytes: number
      created_at: string
      slot: string
      moving: number
    }>(sql`
    SELECT platform, post_id, path, bytes, created_at, slot,
      EXISTS(SELECT 1 FROM kept_files v WHERE v.platform = kept_files.platform AND v.post_id = kept_files.post_id
        AND (v.slot LIKE 'video-%' OR v.slot LIKE 'audio-%')) AS moving
    FROM kept_files
    WHERE ${postKeyWhere(sql`platform`, sql`post_id`, part)}
      AND (slot = 'poster' OR slot LIKE 'photo-%') AND bytes <= ${8 * 1024 * 1024}
    ORDER BY CASE WHEN slot = 'poster' THEN 0 ELSE 1 END, slot`),
  )
  const found = new Map<string, Source>()
  for (const file of files) {
    const key = `${file.platform}:${file.post_id}`
    const text = texts.get(key)
    if (text !== undefined && !found.has(key))
      found.set(key, {
        key,
        text: text.slice(0, 600).toWellFormed(),
        file: file.path,
        bytes: file.bytes,
        changed: file.created_at,
        canExclude: file.slot.startsWith('photo-') && !file.moving,
      })
  }
  return channel.keys.map((key) => found.get(key)).filter((s): s is Source => !!s)
}

function snapshot(channel: VisualChannel, userId: string | null) {
  const sources = sourcesFor(channel, userId)
  const revision = createHash('sha256')
    .update(
      JSON.stringify({
        policy: VISUAL_POLICY,
        model: CHANNEL_IMAGE_MODEL,
        names: CHANNEL_NAMES,
        name: channel.name,
        keys: channel.keys,
        sources,
      }),
    )
    .digest('hex')
  return { sources, revision }
}

/** Request path: local reads + one bounded durable enqueue, never an image/API request. */
export function visualChannel<T extends VisualChannel>(
  channel: T,
  userId: string | null,
  order = channel.keys,
): T {
  const fallback = { ...channel, keys: order, size: order.length }
  if (!channelImagesEnabled()) return fallback
  try {
    const scope = userId === null ? 'everyone' : `user:${userId}`
    const now = Date.now()
    const { sources, revision } = snapshot(channel, userId)
    const old = db.get<Job>(
      sql`SELECT * FROM channel_visual_jobs WHERE scope = ${scope} AND slug = ${channel.slug}`,
    )
    if (sources.length < 2) {
      db.run(sql`DELETE FROM channel_visual_jobs WHERE scope = ${scope} AND slug = ${channel.slug}`)
      return fallback
    }
    if (old?.revision === revision && now - old.updated_at < WEEK) {
      if (old.status === 'ready' && old.result)
        return applyVisualResult(fallback, JSON.parse(old.result) as VisualResult)
      return fallback
    }
    runInTransaction(() => {
      db.run(
        sql`DELETE FROM channel_visual_jobs WHERE updated_at < ${now - WEEK} AND status != 'running'`,
      )
      if (!old) {
        const total =
          db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM channel_visual_jobs`)?.n ?? 0
        if (total >= MAX_JOBS)
          db.run(sql`DELETE FROM channel_visual_jobs WHERE (scope, slug) IN
          (SELECT scope, slug FROM channel_visual_jobs WHERE status != 'running' ORDER BY updated_at LIMIT 1)`)
      }
      db.run(sql`INSERT INTO channel_visual_jobs(scope, slug, user_id, revision, payload, status, available_at, updated_at)
        VALUES (${scope}, ${channel.slug}, ${userId}, ${revision}, ${JSON.stringify({ channel })}, 'pending', ${now}, ${now})
        ON CONFLICT(scope, slug) DO UPDATE SET revision = excluded.revision, payload = excluded.payload,
          result = NULL, status = 'pending', attempts = 0, lease = NULL, available_at = excluded.available_at, updated_at = excluded.updated_at`)
    })
  } catch {
    // A missing optional cache or unavailable local image never breaks channels.
  }
  return fallback
}

/** Display names stay distinct; slugs and saved/tagged channels never change. */
export function visualChannels<T extends VisualChannel>(channels: T[], userId: string | null): T[] {
  const used = new Set<string>()
  return channels.map((channel) => {
    const refined = visualChannel(channel, userId)
    if (
      used.has(refined.name) ||
      channels.some((other) => other.slug !== channel.slug && other.name === refined.name)
    )
      refined.name = channel.name
    used.add(refined.name)
    return refined
  })
}

/** No remote thumbnail fetches and no FFmpeg/model work on the NAS. */
export async function prepareChannelImage(source: {
  file: string
  bytes: number
}): Promise<Uint8Array | null> {
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    const root = await realpath(mediaDir())
    const file = await realpath(absolutePath(source.file))
    if (!file.startsWith(root + path.sep)) return null
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024 || stat.size !== source.bytes) return null
    const bytes = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!read.bytesRead) return null
      offset += read.bytesRead
    }
    if ((await handle.stat()).size !== stat.size) return null
    // Decode raster media only: never render SVG/PDF or their resource references.
    const header = bytes.subarray(0, 16)
    const raster =
      header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
      header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') ||
      ['GIF87a', 'GIF89a'].includes(header.toString('ascii', 0, 6)) ||
      (header.toString('ascii', 4, 8) === 'ftyp' &&
        ['avif', 'avis', 'heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(
          header.toString('ascii', 8, 12),
        ))
    if (!raster) return null
    const image = await sharp(bytes, {
      limitInputPixels: 16_000_000,
      failOn: 'error',
    })
      .rotate()
      .resize(448, 448, { fit: 'contain', background: '#202020' })
      .flatten({ background: '#202020' })
      .jpeg({ quality: 68, progressive: false })
      .timeout({ seconds: 2 })
      .toBuffer()
    return image.length <= 96 * 1024 ? image : null
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}

export interface VisualDeps {
  now?: () => number
  prepare?: typeof prepareChannelImage
  ask?: typeof askJevImages
}

async function tick(deps: VisualDeps) {
  if (!channelImagesEnabled() || newWorkPaused()) return
  const now = (deps.now ?? Date.now)()
  const day = new Date(now).toISOString().slice(0, 10)
  const job = runInTransaction(() => {
    db.run(
      sql`DELETE FROM channel_visual_jobs WHERE updated_at < ${now - WEEK} AND status != 'running'`,
    )
    db.run(
      sql`DELETE FROM channel_visual_budget WHERE day < ${new Date(now - 3 * 86400_000).toISOString().slice(0, 10)}`,
    )
    db.run(sql`UPDATE channel_visual_jobs SET status = CASE WHEN attempts >= 3 THEN 'unavailable' ELSE 'pending' END,
      lease = NULL WHERE status = 'running' AND updated_at < ${now - 60_000}`)
    const next = db.get<Job>(sql`SELECT * FROM channel_visual_jobs WHERE status = 'pending'
      AND available_at <= ${now} AND attempts < 3 ORDER BY available_at, scope, slug LIMIT 1`)
    if (!next) return null
    const last = db.get<{ at: number }>(
      sql`SELECT MAX(last_request_at) AS at FROM channel_visual_budget`,
    )
    if (last?.at && last.at > now - 60_000) return null
    db.run(
      sql`INSERT INTO channel_visual_budget(day, requests, last_request_at) VALUES (${day}, 0, 0) ON CONFLICT DO NOTHING`,
    )
    const budget =
      db.run(sql`UPDATE channel_visual_budget SET requests = requests + 1, last_request_at = ${now}
      WHERE day = ${day} AND requests < 48 AND last_request_at <= ${now - 60_000}`)
    if (!budget.changes) return null
    const lease = randomUUID()
    db.run(sql`UPDATE channel_visual_jobs SET status = 'running', attempts = attempts + 1,
      updated_at = ${now}, lease = ${lease} WHERE scope = ${next.scope} AND slug = ${next.slug}`)
    return { ...next, attempts: next.attempts + 1, lease }
  })
  if (!job) return
  const update = (status: string, result: string | null, delay = 0) =>
    db.run(sql`
    UPDATE channel_visual_jobs SET status = ${status}, result = ${result}, lease = NULL,
      updated_at = ${now}, available_at = ${now + delay}
    WHERE scope = ${job.scope} AND slug = ${job.slug} AND revision = ${job.revision} AND lease = ${job.lease}`)
  try {
    const { channel } = JSON.parse(job.payload) as Payload
    const before = snapshot(channel, job.user_id)
    if (before.revision !== job.revision) {
      update('unavailable', null)
      return
    }
    const sources = new Map(before.sources.map((source) => [source.key, source]))
    const samples: VisualSample[] = [],
      posts: VisualPost[] = []
    for (const sample of sampleMembers(channel.keys)) {
      const source = sources.get(sample.key)
      if (!source) continue
      const jpeg = await (deps.prepare ?? prepareChannelImage)(source)
      if (!jpeg) continue
      samples.push({ ...sample, canExclude: source.canExclude })
      posts.push({ id: sample.id, words: source.text, jpeg })
    }
    if (posts.length < 2) throw new Error('Channel images temporarily unavailable')
    if (!channelImagesEnabled() || snapshot(channel, job.user_id).revision !== job.revision) {
      update('unavailable', null)
      return
    }
    const names = [...CHANNEL_NAMES]
    const answers = await (deps.ask ?? askJevImages)(
      posts,
      visualQuestions(samples, names, channel.name),
    )
    if (!channelImagesEnabled() || snapshot(channel, job.user_id).revision !== job.revision) {
      update('unavailable', null)
      return
    }
    const result = interpretVisualAnswers(samples, names, answers)
    // Store decisions only, never image bytes, request bodies or provider replies.
    update('ready', JSON.stringify(result))
  } catch {
    update(
      job.attempts >= 3 ? 'unavailable' : 'pending',
      null,
      job.attempts === 1 ? 5 * 60_000 : 30 * 60_000,
    )
  }
}

/** One async upload/preparation task process-wide, including manual/test drains. */
export function processVisualChannel(deps: VisualDeps = {}): Promise<void> {
  if (!state.__adhxVisualTick)
    state.__adhxVisualTick = tick(deps).finally(() => {
      state.__adhxVisualTick = undefined
    })
  return state.__adhxVisualTick
}

export function startVisualChannels(): void {
  if (
    !channelImagesEnabled() ||
    process.env.NODE_ENV === 'test' ||
    process.env['VITEST'] ||
    state.__adhxVisualTimer
  )
    return
  state.__adhxVisualTimer = setInterval(() => {
    void processVisualChannel().catch(() => undefined)
  }, 10_000)
  state.__adhxVisualTimer.unref()
}
