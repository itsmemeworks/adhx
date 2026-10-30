import { postKeyWhere } from '@/lib/db/post-keys'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import {
  bookmarks,
  keepJobs,
  keptFiles,
  postEmbeddings,
  postExtractedText,
  understandingQueue,
  type Bookmark,
} from '@/lib/db/schema'
import { appPost, qualityLabel } from '@/lib/app/phone-app'
import { networkLabel } from '@/lib/platform/networks'
import { keepEnabled, keepMinFreeBytes } from '@/lib/keep/config'
import { isKeepConverting, keepProgress } from '@/lib/keep/progress'
import { keepReason } from '@/lib/keep/reason'
import { freeDiskBytes, KEEP_MAX_ATTEMPTS, wakeKeep } from '@/lib/keep/worker'
import { seenBy, saversFor } from '@/lib/people/savers'
import type { Saver } from '@/lib/people/types'
import { MAX_ATTEMPTS, PRIORITY, isExtractKind, type JobKind } from '@/lib/semantic/config'
import { enqueuePosts } from '@/lib/semantic/queue'
import { wakeJobs, jobActivity } from '@/lib/semantic/supervisor'
import { remoteProcessing } from './config'
import { remoteWorkerConnected } from './presence'
import { activityState } from './doing-state'

/**
 * "What your ADHX is doing" (`/doing`, `GET /api/activity/processing`,
 * `GET /api/app/doing`): every post still on its way, stuck, or finished in
 * the last half hour, step by step.
 *
 * Isolation: a post is listed only when the viewer may see one of its saves
 * (`seenBy`: anyone's visible save, or the viewer's own, private or not). A
 * post whose only saves are someone else's private ones never shows, isn't
 * counted and names nobody. Savers are named with `saversFor`, members only.
 */

export const DOING_STEPS = [
  'Got the link',
  'Keeping a copy',
  'Making it play everywhere',
  'Listening to what’s said',
  'Reading text on screen',
  'Learning what it’s about',
  'Ready',
] as const

export type DoingStatus = 'working' | 'waiting' | 'needs_you' | 'ready'
export type DoingScope = 'all' | 'mine' | 'needs'

export function isDoingScope(value: unknown): value is DoingScope {
  return value === 'all' || value === 'mine' || value === 'needs'
}

/** Finished posts stay in the list this long. */
export const RECENT_MS = 30 * 60_000
/** A download that gave up asks for you this long, then drops off the list. */
const NEEDS_YOU_FOR_MS = 7 * 24 * 60 * 60_000
/** Learning that gave up shows this long. */
const LEARN_FAILED_FOR_MS = 24 * 60 * 60_000
/** At most this many rows are hydrated; counts cover the complete visible backlog. */
const MAX_ITEMS = 60

export interface DoingItem {
  platform: string
  id: string
  title: string
  /** "Instagram video" */
  network: string
  thumbnail: string | null
  openPath: string
  savers: Saver[]
  /** Newest save the viewer can see (ISO). */
  savedAt: string
  /** 1–7, an index into `DOING_STEPS` plus one. */
  step: number
  stepLabel: string
  steps: number
  percent: number | null
  status: DoingStatus
  /** It plays already (a copy is kept and plays everywhere), even while it's still being learned. */
  playable: boolean
  /** Plain words for a failure or a wait ("It’s private on Instagram."), else null. */
  reason: string | null
  /** While waiting to try again. */
  retryInfo: { attempt: number; of: number; at: string | null } | null
  /** "4K", "720p" once a video is kept. */
  quality: string | null
  /** What was learned, for a finished post: words, picture, video, speech, on-screen text. */
  learned: string[]
  /** The viewer saved it, so they may press Retry. */
  retry: boolean
  /** The viewer may choose "Keep the link only" (a download that gave up). */
  keepLinkOnly: boolean
  /** When it finished (ISO), for ready posts. */
  finishedAt: string | null
}

export interface DoingSummary {
  /** Posts still on their way (working, waiting or needing you). */
  onTheirWay: number
  keeping: number
  learning: number
  needsYou: number
  ready: number
  /** Free bytes on the media disk, or null when unknown. */
  freeBytes: number | null
  /** `remote`: a Mac (or other) helper does the learning and converting. */
  processing: 'local' | 'remote'
  /** With remote processing: is the helper connected now? */
  remoteConnected: boolean | null
}

export interface DoingView {
  items: DoingItem[]
  summary: DoingSummary
}

type KeepRow = {
  status: string
  attempts: number
  nextAttemptAt: string | null
  lastError: string | null
  updatedAt: string
  acceptedAt: string | null
  progress: number | null
}
type QueueRow = { kind: string; attempts: number; nextAttemptAt: string; lastError: string | null }
type ConversionRow = {
  status: string
  attempts: number
  next_attempt_at: number
  expires_at: number | null
  updated_at: string
}

export { keepReason }

const key = (platform: string, id: string) => `${platform}:${id}`

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

/** Categories with no picture, video or sound to learn from. */
const WORDS_ONLY = new Set(['text', 'tweet', 'article'])

function kindNoun(category: string | null): string {
  if (category === 'video') return 'video'
  if (category === 'photo') return 'photo'
  if (category === 'article') return 'article'
  return 'post'
}

function titleOf(row: Bookmark): string {
  const firstLine = (row.text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean)
  if (firstLine) {
    const chars = Array.from(firstLine)
    return chars.length > 120 ? `${chars.slice(0, 119).join('')}…` : firstLine
  }
  return `${kindNoun(row.category)[0].toUpperCase()}${kindNoun(row.category).slice(1)} by @${row.author}`
}

const LEARNED_WORDS: Record<string, string> = {
  text: 'words',
  image: 'picture',
  video: 'video',
  speech: 'speech',
  screen: 'on-screen text',
}

/** Everything the page shows, for one viewer. Never another member's private save. */
export async function processingActivity(
  viewerId: string,
  scope: DoingScope = 'all',
  now = Date.now(),
  options: { summaryOnly?: boolean } = {},
): Promise<DoingView> {
  const freeBytes = await freeDiskBytes()
  const remote = remoteProcessing()
  const remoteConnected = remote ? remoteWorkerConnected(now) : null
  const diskFull = freeBytes !== null && freeBytes < keepMinFreeBytes()
  const empty: DoingView = {
    items: [],
    summary: {
      onTheirWay: 0,
      keeping: 0,
      learning: 0,
      needsYou: 0,
      ready: 0,
      freeBytes,
      processing: remote ? 'remote' : 'local',
      remoteConnected,
    },
  }
  if (!viewerId) return empty

  const state = activityState(viewerId, scope, {
    now,
    recentMs: RECENT_MS,
    needsMs: NEEDS_YOU_FOR_MS,
    failedMs: LEARN_FAILED_FOR_MS,
    keeping: keepEnabled(),
    diskFull,
    remoteOffline: remote && remoteConnected === false,
    limit: MAX_ITEMS,
    summaryOnly: options.summaryOnly === true,
  })
  const summary: DoingSummary = { ...empty.summary, ...state.summary }
  const cands = state.candidates
  if (cands.length === 0) return { items: [], summary }
  const wanted = new Set(cands.map((c) => key(c.platform, c.id)))

  const keep = new Map<string, KeepRow>()
  for (const r of db
    .select({
      platform: keepJobs.platform,
      id: keepJobs.postId,
      status: keepJobs.status,
      attempts: keepJobs.attempts,
      nextAttemptAt: keepJobs.nextAttemptAt,
      lastError: keepJobs.lastError,
      updatedAt: keepJobs.updatedAt,
      acceptedAt: keepJobs.acceptedAt,
      progress: keepJobs.progress,
    })
    .from(keepJobs)
    .where(postKeyWhere(keepJobs.platform, keepJobs.postId, cands))
    .all()) {
    if (wanted.has(key(r.platform, r.id))) keep.set(key(r.platform, r.id), r)
  }

  const queue = new Map<string, QueueRow[]>()
  for (const r of db
    .select({
      platform: understandingQueue.platform,
      id: understandingQueue.postId,
      kind: understandingQueue.kind,
      attempts: understandingQueue.attempts,
      nextAttemptAt: understandingQueue.nextAttemptAt,
      lastError: understandingQueue.lastError,
    })
    .from(understandingQueue)
    .where(postKeyWhere(understandingQueue.platform, understandingQueue.postId, cands))
    .all()) {
    const k = key(r.platform, r.id)
    if (!wanted.has(k)) continue
    queue.set(k, [...(queue.get(k) ?? []), r])
  }

  const conversions = new Map<string, ConversionRow[]>()
  const convRows = db.all<ConversionRow & { platform: string; post_id: string }>(sql`
    SELECT platform, post_id, status, attempts, next_attempt_at, expires_at, updated_at
    FROM media_conversions WHERE ${postKeyWhere(sql`platform`, sql`post_id`, cands)}`)
  for (const r of convRows) {
    const k = key(r.platform, r.post_id)
    if (!wanted.has(k)) continue
    conversions.set(k, [...(conversions.get(k) ?? []), r])
  }

  const learned = new Map<string, Map<string, { status: string; at: string }>>()
  const addLearned = (platform: string, id: string, kind: string, status: string, at: string) => {
    const k = key(platform, id)
    if (!wanted.has(k)) return
    const m = learned.get(k) ?? new Map()
    m.set(kind, { status, at })
    learned.set(k, m)
  }
  for (const r of db
    .select({
      platform: postEmbeddings.platform,
      id: postEmbeddings.postId,
      kind: postEmbeddings.kind,
      status: postEmbeddings.status,
      at: postEmbeddings.createdAt,
    })
    .from(postEmbeddings)
    .where(postKeyWhere(postEmbeddings.platform, postEmbeddings.postId, cands))
    .all())
    addLearned(r.platform, r.id, r.kind, r.status, r.at)
  for (const r of db
    .select({
      platform: postExtractedText.platform,
      id: postExtractedText.postId,
      kind: postExtractedText.kind,
      status: postExtractedText.status,
      at: postExtractedText.createdAt,
    })
    .from(postExtractedText)
    .where(postKeyWhere(postExtractedText.platform, postExtractedText.postId, cands))
    .all())
    addLearned(r.platform, r.id, r.kind, r.status, r.at)

  const videoFiles = new Map<string, { width: number | null; height: number | null }>()
  for (const r of db
    .select({
      platform: keptFiles.platform,
      id: keptFiles.postId,
      width: keptFiles.width,
      height: keptFiles.height,
    })
    .from(keptFiles)
    .where(
      and(postKeyWhere(keptFiles.platform, keptFiles.postId, cands), eq(keptFiles.slot, 'video-1')),
    )
    .all()) {
    if (wanted.has(key(r.platform, r.id))) videoFiles.set(key(r.platform, r.id), r)
  }

  // Which posts the viewer saved, and one visible copy of each for its words and picture.
  const rows = db
    .select()
    .from(bookmarks)
    .where(and(postKeyWhere(bookmarks.platform, bookmarks.id, cands), seenBy(viewerId)))
    .all()
  const copy = new Map<string, Bookmark>()
  const mine = new Set<string>()
  for (const r of rows) {
    const k = key(r.platform, r.id)
    if (!wanted.has(k)) continue
    if (r.userId === viewerId && r.source !== 'quoted') mine.add(k)
    const current = copy.get(k)
    if (!current || r.userId === viewerId) copy.set(k, r)
  }

  // What is being worked on this second, when it's one of these.
  const live = new Set<string>()
  const activity = remote ? null : jobActivity()
  if (activity) live.add(`${key(activity.platform, activity.postId)}:${activity.kind}`)
  const leases = db.all<{ platform: string; post_id: string; kind: string }>(sql`
    SELECT platform, post_id, kind FROM processing_leases WHERE expires_at > ${now}`)
  for (const l of leases) live.add(`${key(l.platform, l.post_id)}:${l.kind}`)
  const segments = new Map<string, { segments: number; next: number }>()
  for (const v of db.all<{
    platform: string
    post_id: string
    segments: number
    next_segment: number
  }>(
    sql`SELECT platform, post_id, segments, next_segment FROM video_index_state
      WHERE ${postKeyWhere(sql`platform`, sql`post_id`, cands)}`,
  )) {
    if (wanted.has(key(v.platform, v.post_id)))
      segments.set(key(v.platform, v.post_id), { segments: v.segments, next: v.next_segment })
  }

  const keyed = cands.map((c) => ({ ...c, k: key(c.platform, c.id) }))
  const saverMap = saversFor(
    keyed.map((c) => ({ platform: c.platform, id: c.id })),
    viewerId,
  )

  const items: DoingItem[] = []
  for (const c of keyed) {
    const row = copy.get(c.k)
    if (!row) continue
    const job = keep.get(c.k)
    // Every post gets every kind of job; the worker skips speech and text on
    // screen for words-only posts when it reaches them. Until then they mustn't
    // show a text post as "Listening to what's said" or keep it on its way.
    const wordsOnly = WORDS_ONLY.has(row.category ?? 'tweet')
    const q = (queue.get(c.k) ?? []).filter((r) => !(wordsOnly && isExtractKind(r.kind)))
    const conv = conversions.get(c.k) ?? []
    const results = learned.get(c.k) ?? new Map()
    const qKinds = new Set(q.map((r) => r.kind))
    const network = networkLabel(c.platform)

    let step = 7
    let status: DoingStatus = 'ready'
    let percent: number | null = null
    let reason: string | null = null
    let retryInfo: DoingItem['retryInfo'] = null
    let keepLinkOnly = false
    const backoff = (rows: QueueRow[]) =>
      rows.find((r) => r.attempts > 0 && Date.parse(r.nextAttemptAt) > now)

    const keepFailedForGood =
      job?.status === 'unavailable' &&
      !job.acceptedAt &&
      Date.parse(job.updatedAt) >= now - NEEDS_YOU_FOR_MS
    // A fresh save the download worker hasn't picked up yet (it does within seconds).
    const keepQueued = !job && keepEnabled() && Date.parse(c.savedAt) >= now - RECENT_MS
    const keepActive =
      keepQueued ||
      (!!job && ['pending', 'running', 'failed'].includes(job.status) && keepEnabled())
    const converting =
      job?.status === 'converting' ||
      isKeepConverting(c.platform, c.id) ||
      conv.some((r) => r.status === 'pending' || r.status === 'running')
    const failedLearning = [...results.entries()].filter(
      ([, v]) => v.status === 'failed' && Date.parse(v.at) >= now - LEARN_FAILED_FOR_MS,
    )

    // Only the saver can do anything about a post that couldn't be kept.
    if (keepFailedForGood && !mine.has(c.k)) continue
    if (keepFailedForGood) {
      step = 2
      status = 'needs_you'
      reason = keepReason(job!.lastError, c.platform)
      keepLinkOnly = true
    } else if (keepActive) {
      step = 2
      if (job?.status === 'failed') {
        status = 'waiting'
        reason = keepReason(job.lastError, c.platform)
        retryInfo = {
          attempt: Math.min(KEEP_MAX_ATTEMPTS, job.attempts + 1),
          of: KEEP_MAX_ATTEMPTS,
          at: job.nextAttemptAt,
        }
      } else if (job?.status !== 'running' && diskFull) {
        status = 'waiting'
        reason = 'The disk is nearly full, so keeping is paused.'
      } else {
        status = 'working'
        percent =
          job?.status === 'running'
            ? (keepProgress(c.platform, c.id) ??
              (isKeepConverting(c.platform, c.id) ? null : job.progress))
            : null
      }
    } else if (converting) {
      step = 3
      const waitingConv = conv.find(
        (r) => r.status === 'pending' && r.attempts > 0 && r.next_attempt_at > now,
      )
      if (remote && remoteConnected === false && !conv.some((r) => r.status === 'running')) {
        status = 'waiting'
        reason = 'Waiting for the Mac helper to connect.'
      } else if (waitingConv) {
        status = 'waiting'
        reason = 'Converting didn’t work. Trying again.'
        retryInfo = {
          attempt: waitingConv.attempts + 1,
          of: MAX_ATTEMPTS,
          at: iso(waitingConv.next_attempt_at),
        }
      } else status = 'working'
    } else if (qKinds.size > 0) {
      const stepFor = (kinds: string[]) => q.filter((r) => kinds.includes(r.kind))
      const speech = stepFor(['speech'])
      const screen = stepFor(['screen'])
      const learn = stepFor(['text', 'image', 'video'])
      const current = speech.length ? speech : screen.length ? screen : learn
      step = speech.length ? 4 : screen.length ? 5 : 6
      const stuck = backoff(current)
      const running = current.some((r) => live.has(`${c.k}:${r.kind}`))
      if (stuck && !running) {
        status = 'waiting'
        reason = 'That didn’t work the first time. Trying again.'
        retryInfo = { attempt: stuck.attempts + 1, of: MAX_ATTEMPTS, at: stuck.nextAttemptAt }
      } else if (remote && remoteConnected === false && !running) {
        status = 'waiting'
        reason = 'Waiting for the Mac helper to connect.'
      } else {
        status = 'working'
        const seg = segments.get(c.k)
        if (step === 6 && qKinds.has('video') && seg && seg.segments > 0)
          percent = Math.round((seg.next / seg.segments) * 100)
      }
    } else if (failedLearning.length > 0 && mine.has(c.k)) {
      step = failedLearning.some(([k]) => k === 'speech')
        ? 4
        : failedLearning.some(([k]) => k === 'screen')
          ? 5
          : 6
      status = 'needs_you'
      reason = 'Couldn’t learn what’s in it. It still plays.'
    }

    const finishedAt =
      status === 'ready'
        ? ([job?.updatedAt, ...[...results.values()].map((v) => v.at)]
            .filter((v): v is string => !!v)
            .sort()
            .pop() ?? c.savedAt)
        : null
    // Ready long ago (a post saved recently but finished before): still ready, still listed.
    const video = videoFiles.get(c.k)
    const post = appPost(row, false)
    items.push({
      platform: c.platform,
      id: c.id,
      title: titleOf(row),
      // "Instagram Reel", as the theater says it.
      network:
        c.platform === 'instagram' && row.category === 'video'
          ? 'Instagram Reel'
          : `${network} ${kindNoun(row.category)}`,
      thumbnail: post.posterUrl,
      openPath: post.openPath,
      savers: saverMap.get(c.k) ?? [],
      savedAt: c.savedAt,
      step,
      stepLabel: DOING_STEPS[step - 1],
      steps: DOING_STEPS.length,
      percent,
      status,
      playable: step >= 4,
      reason,
      retryInfo,
      quality: video ? qualityLabel(video.width, video.height) : null,
      learned:
        status === 'ready'
          ? ['text', 'image', 'video', 'speech', 'screen']
              .filter((k) => results.get(k)?.status === 'ok')
              .map((k) => LEARNED_WORDS[k])
          : [],
      retry: mine.has(c.k) && (status === 'needs_you' || status === 'waiting'),
      keepLinkOnly: keepLinkOnly && mine.has(c.k),
      finishedAt,
    })
  }

  const RANK: Record<DoingStatus, number> = { needs_you: 0, working: 1, waiting: 2, ready: 3 }
  const shown = (scope === 'needs' ? items.filter((i) => i.status === 'needs_you') : items)
    .sort((a, b) => RANK[a.status] - RANK[b.status] || b.savedAt.localeCompare(a.savedAt))
    .slice(0, MAX_ITEMS)
  return { items: shown, summary }
}

/** The viewer has a save of this post of their own (not a quoted copy). */
export function hasSaved(userId: string, platform: string, id: string): boolean {
  return !!db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.userId, userId),
        eq(bookmarks.platform, platform),
        eq(bookmarks.id, id),
        sql`COALESCE(${bookmarks.source}, '') != 'quoted'`,
      ),
    )
    .get()
}

/**
 * Start over on whatever is stuck for this post: a download that failed or
 * gave up (and "Keep the link only" is undone), a conversion that gave up,
 * learning that failed or is waiting to retry. Returns how many parts were
 * re-queued. Callers check the viewer saved it.
 */
export async function retryPost(platform: string, id: string, now = Date.now()): Promise<number> {
  const at = iso(now)
  let parts = 0
  const kinds: JobKind[] = []
  runInTransaction(() => {
    // A conversion that gave up: back in line, and the download waits for it.
    const conv = db.run(sql`UPDATE media_conversions SET status='pending', attempts=0,
      next_attempt_at=0, last_error=NULL, updated_at=${at}
      WHERE platform=${platform} AND post_id=${id} AND status='failed'`)
    parts += conv.changes
    if (conv.changes > 0) {
      db.update(keepJobs)
        .set({ status: 'converting', lastError: null, acceptedAt: null, updatedAt: at })
        .where(and(eq(keepJobs.platform, platform), eq(keepJobs.postId, id)))
        .run()
    } else {
      parts += db
        .update(keepJobs)
        .set({
          status: 'pending',
          attempts: 0,
          nextAttemptAt: null,
          lastError: null,
          acceptedAt: null,
          updatedAt: at,
        })
        .where(
          and(
            eq(keepJobs.platform, platform),
            eq(keepJobs.postId, id),
            inArray(keepJobs.status, ['failed', 'unavailable']),
          ),
        )
        .run().changes
    }
    // Learning waiting out a backoff: now.
    parts += db
      .update(understandingQueue)
      .set({ nextAttemptAt: at, attempts: 0 })
      .where(
        and(
          eq(understandingQueue.platform, platform),
          eq(understandingQueue.postId, id),
          sql`${understandingQueue.attempts} > 0`,
        ),
      )
      .run().changes
    // Learning that gave up: forget the failure and queue that kind again.
    const failed = db
      .select({ kind: postEmbeddings.kind })
      .from(postEmbeddings)
      .where(
        and(
          eq(postEmbeddings.platform, platform),
          eq(postEmbeddings.postId, id),
          eq(postEmbeddings.status, 'failed'),
        ),
      )
      .all()
    for (const f of failed) {
      db.delete(postEmbeddings)
        .where(
          and(
            eq(postEmbeddings.platform, platform),
            eq(postEmbeddings.postId, id),
            eq(postEmbeddings.kind, f.kind),
          ),
        )
        .run()
      kinds.push(f.kind as JobKind)
    }
    const failedWords = db
      .select({ kind: postExtractedText.kind })
      .from(postExtractedText)
      .where(
        and(
          eq(postExtractedText.platform, platform),
          eq(postExtractedText.postId, id),
          eq(postExtractedText.status, 'failed'),
        ),
      )
      .all()
    for (const f of failedWords) {
      if (!isExtractKind(f.kind)) continue
      // Keeps any earlier words; just stops counting as done.
      db.update(postExtractedText)
        .set({ model: '' })
        .where(
          and(
            eq(postExtractedText.platform, platform),
            eq(postExtractedText.postId, id),
            eq(postExtractedText.kind, f.kind),
          ),
        )
        .run()
      kinds.push(f.kind)
    }
  })
  if (kinds.length) {
    await enqueuePosts([{ platform, postId: id }], PRIORITY.urgent, kinds)
    parts += kinds.length
  }
  if (parts) {
    wakeKeep()
    wakeJobs()
  }
  return parts
}

/**
 * "Keep the link only": a download that gave up stops asking. The post stays
 * saved and plays from the network where it can. False when there was no
 * such failure.
 */
export function keepLinkOnly(platform: string, id: string, now = Date.now()): boolean {
  return (
    db
      .update(keepJobs)
      .set({ acceptedAt: iso(now) })
      .where(
        and(
          eq(keepJobs.platform, platform),
          eq(keepJobs.postId, id),
          eq(keepJobs.status, 'unavailable'),
          sql`${keepJobs.acceptedAt} IS NULL`,
        ),
      )
      .run().changes === 1
  )
}
