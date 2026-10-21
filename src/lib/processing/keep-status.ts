import { inArray, sql } from 'drizzle-orm'
import { POST_ID_PATTERN } from '@/lib/platform/networks'
import { db } from '@/lib/db'
import { keepJobs } from '@/lib/db/schema'
import { keepEnabled, keepMinFreeBytes } from '@/lib/keep/config'
import { isKeepConverting, keepProgress } from '@/lib/keep/progress'
import { listMembers } from '@/lib/people/members'
import { seenBy } from '@/lib/people/savers'
import { remoteProcessing } from './config'
import { remoteWorkerConnected } from './presence'
import { RECENT_MS } from './doing'

/**
 * Is this post kept yet? For the theater's "Getting it ready" stage (board
 * j1-4): while a post is still on its way to this ADHX it shows a ring with
 * the real percent and a three-step checklist (Got the link · Keeping a copy ·
 * Making it play everywhere), then plays the moment it's kept.
 *
 * The same reading as `/doing` (`doing.ts`), narrowed to "is there something
 * to wait for a moment": a download queued or running, or a conversion
 * running. A download waiting out a retry, paused by a full disk, or a
 * conversion waiting for an offline Mac helper is `none` (the post plays what
 * it can now), because "It'll be here in a moment" wouldn't be true.
 *
 * Isolation: a post is answered only when the viewer may see one of its saves
 * (`seenBy`), so nobody learns about another member's private save.
 */

export type KeepState = 'waiting' | 'keeping' | 'converting' | 'kept' | 'none'

export interface PostKeepStatus {
  platform: string
  id: string
  /** `waiting`, `keeping` and `converting` are on their way; `kept` and `none` play now. */
  state: KeepState
  /** 1–3 of "Got the link · Keeping a copy · Making it play everywhere"; null when it plays. */
  step: 1 | 2 | 3 | null
  /** Download percent (0–99) while keeping, when known. */
  percent: number | null
  /** When the copy was finished (ISO), for a kept post; else null. */
  keptAt: string | null
}

/** A face for "Shared with your people". */
export interface PeopleFace {
  username: string
  name: string | null
  avatarUrl: string | null
}

/** At most this many posts per question. */
export const MAX_STATUS_POSTS = 20
/** At most this many faces on "Shared with your people". */
export const MAX_PEOPLE_FACES = 4

const PLATFORM = /^[a-z]{1,16}$/
const POST_ID = POST_ID_PATTERN

/** `platform:id,platform:id` → posts (deduplicated, valid only), or null when too many. */
export function parseStatusPosts(raw: string | null): { platform: string; id: string }[] | null {
  const out = new Map<string, { platform: string; id: string }>()
  for (const part of (raw ?? '').split(',')) {
    const at = part.indexOf(':')
    if (at <= 0) continue
    const platform = part.slice(0, at)
    const id = part.slice(at + 1)
    if (!PLATFORM.test(platform) || !POST_ID.test(id)) continue
    out.set(`${platform}:${id}`, { platform, id })
  }
  if (out.size > MAX_STATUS_POSTS) return null
  return [...out.values()]
}

type JobRow = {
  platform: string
  id: string
  status: string
  updatedAt: string
  progress: number | null
}
type ConvRow = { platform: string; post_id: string; status: string }

/**
 * Keep status for each post the viewer may see (others are left out).
 * `diskFull` is passed by the route (it reads the disk once).
 */
export function keepStatusFor(
  viewerId: string,
  posts: { platform: string; id: string }[],
  { now = Date.now(), diskFull = false }: { now?: number; diskFull?: boolean } = {},
): PostKeepStatus[] {
  if (!viewerId || posts.length === 0) return []
  const wanted = new Set(posts.map((p) => `${p.platform}:${p.id}`))
  const ids = [...new Set(posts.map((p) => p.id))]

  // The newest save of each post the viewer may see.
  const newest = new Map<string, string>()
  for (const r of db.all<{ platform: string; id: string; saved_at: string | null }>(
    sql`SELECT platform, id, MAX(processed_at) AS saved_at FROM bookmarks
        WHERE id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )}) AND ${seenBy(viewerId)}
        GROUP BY platform, id`,
  )) {
    const k = `${r.platform}:${r.id}`
    if (wanted.has(k)) newest.set(k, r.saved_at ?? '')
  }
  if (newest.size === 0) return []

  const jobs = new Map<string, JobRow>()
  for (const r of db
    .select({
      platform: keepJobs.platform,
      id: keepJobs.postId,
      status: keepJobs.status,
      updatedAt: keepJobs.updatedAt,
      progress: keepJobs.progress,
    })
    .from(keepJobs)
    .where(inArray(keepJobs.postId, ids))
    .all()) {
    jobs.set(`${r.platform}:${r.id}`, r)
  }
  const conversions = new Map<string, ConvRow[]>()
  for (const r of db.all<ConvRow>(
    sql`SELECT platform, post_id, status FROM media_conversions WHERE post_id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})`,
  )) {
    const k = `${r.platform}:${r.post_id}`
    conversions.set(k, [...(conversions.get(k) ?? []), r])
  }

  const keeping = keepEnabled()
  const remote = remoteProcessing()
  const helperAway = remote && remoteWorkerConnected(now) === false
  const out: PostKeepStatus[] = []
  for (const p of posts) {
    const k = `${p.platform}:${p.id}`
    if (!newest.has(k)) continue
    const job = jobs.get(k)
    const conv = conversions.get(k) ?? []
    const base = { platform: p.platform, id: p.id }
    const savedAt = Date.parse(newest.get(k) ?? '')
    const converting =
      keeping &&
      (job?.status === 'converting' ||
        isKeepConverting(p.platform, p.id) ||
        conv.some((r) => r.status === 'pending' || r.status === 'running'))
    const convRunning =
      conv.some((r) => r.status === 'running') || isKeepConverting(p.platform, p.id)

    if (converting && !(helperAway && !convRunning)) {
      out.push({ ...base, state: 'converting', step: 3, percent: null, keptAt: null })
    } else if (keeping && job?.status === 'running') {
      const percent = keepProgress(p.platform, p.id) ?? job.progress ?? null
      out.push({ ...base, state: 'keeping', step: 2, percent, keptAt: null })
    } else if (keeping && job?.status === 'pending' && !diskFull) {
      out.push({ ...base, state: 'waiting', step: 2, percent: null, keptAt: null })
    } else if (
      keeping &&
      !job &&
      !diskFull &&
      Number.isFinite(savedAt) &&
      savedAt >= now - RECENT_MS
    ) {
      // A fresh save the download worker hasn't picked up yet (it does within seconds).
      out.push({ ...base, state: 'waiting', step: 2, percent: null, keptAt: null })
    } else if (job?.status === 'done' && !converting) {
      out.push({ ...base, state: 'kept', step: null, percent: null, keptAt: job.updatedAt })
    } else {
      out.push({ ...base, state: 'none', step: null, percent: null, keptAt: null })
    }
  }
  return out
}

/** Up to 4 of the viewer's people (not the viewer), most recent saver first. */
export function peopleFaces(viewerId: string): PeopleFace[] {
  return listMembers(viewerId)
    .filter((m) => !m.isYou)
    .slice(0, MAX_PEOPLE_FACES)
    .map((m) => ({ username: m.username, name: m.name, avatarUrl: m.avatarUrl }))
}

/** True when the media disk is too full to keep anything new. */
export function diskIsFull(freeBytes: number | null): boolean {
  return freeBytes !== null && freeBytes < keepMinFreeBytes()
}
