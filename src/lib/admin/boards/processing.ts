import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { remoteProcessing } from '@/lib/processing/config'
import { remoteWorkerConnected, workerLastSeen } from '@/lib/processing/presence'
import { keepLinkOnly, keepReason, processingActivity, retryPost } from '@/lib/processing/doing'
import { newWorkPaused, setNewWorkPaused } from '@/lib/processing/pause'
import { writeAudit } from '@/lib/admin/moderation'
import { diskSpace, lastDays, localDay, num, postCards } from '../shared'
import { keptTotals } from './overview'

/**
 * Admin → Processing (board 10.7): the server-wide queue. Posts saved only
 * Just for me are counted, never listed.
 */

export interface QueueRow {
  platform: string
  id: string
  title: string
  thumbnail: string | null
  openPath: string
  step: string
  percent: number | null
  status: 'working' | 'waiting' | 'needs_you'
  reason: string | null
}

export interface ProcessingBoard {
  paused: boolean
  onTheirWay: number
  keeping: number
  converting: number
  learning: { posts: number; kinds: string[] }
  needYou: number
  /** Why the newest one gave up, in plain words ("It's private on Instagram."). */
  needYouFirst: string | null
  failed: { total: number; nextAt: string | null }
  disk: { free: number | null; total: number | null; usedByAdhx: number }
  queue: QueueRow[]
  /** Posts on their way that only have Just for me saves. */
  queuePrivate: number
  helper: {
    mode: 'remote' | 'local'
    connected: boolean
    lastSeenAt: string | null
    name: string | null
  }
  week: { day: string; kept: number; converted: number; understood: number }[]
}

const one = (query: ReturnType<typeof sql>): number => num(db.all<{ n: number }>(query)[0]?.n)

const KIND_WORDS: Record<string, string> = {
  text: 'words',
  image: 'pictures',
  video: 'video frames',
  speech: 'speech',
  screen: 'screen text',
}

export async function processingBoard(
  viewerId: string,
  now = Date.now(),
): Promise<ProcessingBoard> {
  const jobs = db.all<{ status: string; n: number }>(sql`
    SELECT status, COUNT(*) AS n FROM keep_jobs GROUP BY status`)
  const jobCount = (s: string) => num(jobs.find((j) => j.status === s)?.n)
  const convertingPosts = one(sql`
    SELECT COUNT(DISTINCT platform || ':' || post_id) AS n FROM media_conversions
    WHERE status IN ('pending', 'running')`)
  const keeping = jobCount('pending') + jobCount('running')
  const converting = Math.max(jobCount('converting'), convertingPosts)

  const learningRows = db.all<{ kind: string; n: number }>(sql`
    SELECT kind, COUNT(*) AS n FROM understanding_queue GROUP BY kind ORDER BY n DESC`)
  const learningPosts = one(sql`
    SELECT COUNT(*) AS n FROM (SELECT DISTINCT platform, post_id FROM understanding_queue)`)

  const needYou = one(sql`
    SELECT COUNT(*) AS n FROM keep_jobs WHERE status = 'unavailable' AND accepted_at IS NULL`)
  const [firstNeed] = db.all<{ platform: string; last_error: string | null }>(sql`
    SELECT platform, last_error FROM keep_jobs WHERE status = 'unavailable' AND accepted_at IS NULL
    ORDER BY updated_at DESC LIMIT 1`)
  const failedKeep = jobCount('failed')
  const failedConv = one(sql`SELECT COUNT(*) AS n FROM media_conversions WHERE status = 'failed'`)
  const [next] = db.all<{ at: string | null }>(sql`
    SELECT MIN(next_attempt_at) AS at FROM keep_jobs WHERE status = 'failed'`)

  const disk = await diskSpace()

  // The queue: what /doing shows, for every post with a shared save.
  const doing = await processingActivity(viewerId, 'all', now).catch(() => null)
  const items = (doing?.items ?? []).filter((i) => i.status !== 'ready')
  const cards = postCards(items.map((i) => `${i.platform}:${i.id}`))
  const queue: QueueRow[] = []
  for (const i of items) {
    if (!cards.has(`${i.platform}:${i.id}`)) continue
    queue.push({
      platform: i.platform,
      id: i.id,
      title: i.title,
      thumbnail: i.thumbnail,
      openPath: i.openPath,
      step: i.stepLabel,
      percent: i.percent,
      status: i.status as QueueRow['status'],
      reason: i.reason,
    })
  }
  const queuePrivate = one(sql`
    SELECT COUNT(*) AS n FROM keep_jobs j
    WHERE j.status IN ('pending', 'running', 'converting', 'failed')
      AND NOT EXISTS (SELECT 1 FROM bookmarks b WHERE b.platform = j.platform AND b.id = j.post_id
        AND b.is_private = 0 AND COALESCE(b.source, '') != 'quoted')`)

  const weekAgo = new Date(now - 7 * 24 * 60 * 60_000).toISOString()
  const [lease] = db.all<{ worker_id: string }>(sql`
    SELECT worker_id FROM processing_leases WHERE worker_id IS NOT NULL
    ORDER BY expires_at DESC LIMIT 1`)
  const [conversion] = db.all<{ worker_id: string }>(sql`
    SELECT worker_id FROM media_conversions WHERE worker_id IS NOT NULL
    ORDER BY updated_at DESC LIMIT 1`)
  const worker = lease ?? conversion
  const seen = workerLastSeen()

  const days = lastDays(7, now)
  const byDay = (rows: { at: string }[]) => {
    const m = new Map(days.map((d) => [d, 0]))
    for (const r of rows) {
      const d = localDay(r.at)
      if (m.has(d)) m.set(d, (m.get(d) ?? 0) + 1)
    }
    return m
  }
  const kept = byDay(
    db.all<{ at: string }>(sql`
      SELECT updated_at AS at FROM keep_jobs WHERE status = 'done' AND updated_at >= ${weekAgo}`),
  )
  const conv = byDay(
    db.all<{ at: string }>(sql`
      SELECT MAX(updated_at) AS at FROM media_conversions
      WHERE status = 'done' AND updated_at >= ${weekAgo} GROUP BY platform, post_id`),
  )
  const und = byDay(
    db.all<{ at: string }>(sql`
      SELECT MAX(created_at) AS at FROM post_embeddings
      WHERE created_at >= ${weekAgo} GROUP BY platform, post_id`),
  )

  const remote = remoteProcessing()

  return {
    paused: newWorkPaused(),
    onTheirWay: keeping + converting,
    keeping,
    converting,
    learning: {
      posts: learningPosts,
      kinds: learningRows.slice(0, 2).map((r) => KIND_WORDS[r.kind] ?? r.kind),
    },
    needYou,
    needYouFirst: firstNeed ? keepReason(firstNeed.last_error, firstNeed.platform) : null,
    failed: { total: failedKeep + failedConv, nextAt: next?.at ?? null },
    disk: { ...disk, usedByAdhx: keptTotals().bytes },
    queue: queue.slice(0, 12),
    queuePrivate,
    helper: {
      mode: remote ? 'remote' : 'local',
      connected: remote ? remoteWorkerConnected(now) : true,
      lastSeenAt: seen ? new Date(seen).toISOString() : null,
      name: worker?.worker_id ?? null,
    },
    week: days.map((day) => ({
      day,
      kept: kept.get(day) ?? 0,
      converted: conv.get(day) ?? 0,
      understood: und.get(day) ?? 0,
    })),
  }
}

// ——— Actions ———

export function setPaused(actorUserId: string, paused: boolean): boolean {
  setNewWorkPaused(paused)
  writeAudit(actorUserId, paused ? 'pause_work' : 'resume_work', {})
  return paused
}

/**
 * Retry everything that failed, server-wide: downloads that failed or gave
 * up (not ones kept as a link on purpose), conversions, and understanding.
 */
export async function retryAllFailed(actorUserId: string, now = Date.now()): Promise<number> {
  const keys = db.all<{ platform: string; post_id: string }>(sql`
    SELECT platform, post_id FROM keep_jobs
      WHERE status IN ('failed', 'unavailable') AND accepted_at IS NULL
    UNION SELECT platform, post_id FROM media_conversions WHERE status = 'failed'
    UNION SELECT platform, post_id FROM post_embeddings WHERE status = 'failed'
    UNION SELECT platform, post_id FROM post_extracted_text WHERE status = 'failed'
    LIMIT 500`)
  let retried = 0
  for (const k of keys) {
    if ((await retryPost(k.platform, k.post_id, now)) > 0) retried++
  }
  writeAudit(actorUserId, 'retry_failed', { posts: retried })
  return retried
}

/** Retry one post, whoever saved it. */
export async function retryOne(actorUserId: string, platform: string, id: string): Promise<number> {
  const parts = await retryPost(platform, id)
  writeAudit(actorUserId, 'retry_failed', { platform, bookmarkId: id, parts })
  return parts
}

/** Stop trying to download a post that gave up; it stays as a link. */
export function linkOnly(actorUserId: string, platform: string, id: string): boolean {
  const done = keepLinkOnly(platform, id)
  if (done) writeAudit(actorUserId, 'keep_link_only', { platform, bookmarkId: id })
  return done
}
