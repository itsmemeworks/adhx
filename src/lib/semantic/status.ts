import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarkMedia, bookmarks, postEmbeddings, understandingQueue } from '@/lib/db/schema'
import { SEMANTIC_MODEL_VERSION, semanticEnabled, type UnderstandingKind } from './config'
import { jobActivity } from './supervisor'
import { remoteActivity } from '@/lib/processing/activity'
import { remoteProcessing, indexingLevel, videoResultCurrent } from '@/lib/processing/config'

export interface UnderstandingGroup {
  id: 'words' | 'photos' | 'videos'
  done: number
  total: number
  failed: number
}

export interface UnderstandingStatus {
  enabled: boolean
  processingMode: 'local' | 'remote'
  indexingLevel: 'light' | 'normal' | 'deep'
  groups: UnderstandingGroup[]
  /** Saves with every part understood. */
  ready: number
  totalSaves: number
  failed: number
  queued: number
  /** Only ever one of THIS user's saves — another user's post is never exposed. */
  current: {
    platform: string
    postId: string
    kind: UnderstandingKind
    phase: string
    frames: number
    segments?: number
    completedSegments?: number
  } | null
}

const CHUNK = 400

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK))
  return out
}

export async function getUnderstandingStatus(userId: string): Promise<UnderstandingStatus> {
  const saved = await db
    .select({ platform: bookmarks.platform, id: bookmarks.id })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
  const media = await db
    .select({
      platform: bookmarkMedia.platform,
      id: bookmarkMedia.bookmarkId,
      type: bookmarkMedia.mediaType,
    })
    .from(bookmarkMedia)
    .where(eq(bookmarkMedia.userId, userId))
  const hasVideo = new Set<string>()
  const hasPhoto = new Set<string>()
  for (const m of media) {
    const key = `${m.platform}:${m.id}`
    if (m.type === 'video' || m.type === 'animated_gif') hasVideo.add(key)
    else if (m.type === 'photo') hasPhoto.add(key)
  }

  const results = new Map<string, string>() // `${platform}:${id}:${kind}` -> status
  const queued = new Set<string>()
  const ids = [...new Set(saved.map((s) => s.id))]
  for (const part of chunks(ids)) {
    const rows = await db
      .select({
        platform: postEmbeddings.platform,
        id: postEmbeddings.postId,
        kind: postEmbeddings.kind,
        contentHash: postEmbeddings.contentHash,
        status: postEmbeddings.status,
      })
      .from(postEmbeddings)
      .where(
        and(eq(postEmbeddings.model, SEMANTIC_MODEL_VERSION), inArray(postEmbeddings.postId, part)),
      )
    for (const r of rows) {
      if (r.kind === 'video' && !videoResultCurrent(r.contentHash)) continue
      results.set(`${r.platform}:${r.id}:${r.kind}`, r.status)
    }
    const q = await db
      .select({
        platform: understandingQueue.platform,
        id: understandingQueue.postId,
        kind: understandingQueue.kind,
      })
      .from(understandingQueue)
      .where(inArray(understandingQueue.postId, part))
    for (const r of q) queued.add(`${r.platform}:${r.id}:${r.kind}`)
  }
  const savedKeys = new Set(saved.map((s) => `${s.platform}:${s.id}`))

  const tally = (
    id: UnderstandingGroup['id'],
    kind: UnderstandingKind,
    members: string[],
  ): UnderstandingGroup => {
    let done = 0
    let failed = 0
    for (const key of members) {
      const status = results.get(`${key}:${kind}`)
      if (status) done++
      if (status === 'failed') failed++
    }
    return { id, done, total: members.length, failed }
  }
  const all = [...savedKeys]
  const videos = all.filter((k) => hasVideo.has(k))
  // Pictures include video stills: every visual save gets a quick picture pass
  // (searchable within seconds) before the slower full-video pass.
  const photos = all.filter((k) => hasVideo.has(k) || hasPhoto.has(k))
  const groups = [
    tally('words', 'text', all),
    tally('photos', 'image', photos),
    tally('videos', 'video', videos),
  ]

  const ready = all.filter((k) => {
    const needs: UnderstandingKind[] = [
      'text',
      ...(hasVideo.has(k)
        ? (['image', 'video'] as const)
        : hasPhoto.has(k)
          ? (['image'] as const)
          : []),
    ]
    return needs.every((kind) => results.has(`${k}:${kind}`))
  }).length

  let queuedForUser = 0
  for (const q of queued) if (savedKeys.has(q.slice(0, q.lastIndexOf(':')))) queuedForUser++

  const activity = remoteProcessing() ? remoteActivity(userId) : jobActivity()
  const current =
    activity && savedKeys.has(`${activity.platform}:${activity.postId}`)
      ? {
          platform: activity.platform,
          postId: activity.postId,
          kind: activity.kind,
          phase: activity.phase,
          frames: activity.frames,
          ...(activity.segments
            ? { segments: activity.segments, completedSegments: activity.completedSegments ?? 0 }
            : {}),
        }
      : null

  return {
    enabled: semanticEnabled(),
    processingMode: remoteProcessing() ? 'remote' : 'local',
    indexingLevel: indexingLevel(),
    groups,
    ready,
    totalSaves: all.length,
    failed: groups.reduce((n, g) => n + g.failed, 0),
    queued: queuedForUser,
    current,
  }
}

/**
 * Of these posts (`platform:id`), the ones with a picture or video that
 * isn't understood yet: search can only have matched them on their words.
 * Content is the same for every saver, so any copy's media decides.
 */
export async function stillLearning(keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set()
  const ids = [...new Set(keys.map((k) => k.slice(k.indexOf(':') + 1)))]
  const wanted = new Set(keys)
  const needs = new Map<string, Set<UnderstandingKind>>()
  const have = new Set<string>()
  for (const part of chunks(ids)) {
    const media = await db
      .selectDistinct({
        platform: bookmarkMedia.platform,
        id: bookmarkMedia.bookmarkId,
        type: bookmarkMedia.mediaType,
      })
      .from(bookmarkMedia)
      .where(inArray(bookmarkMedia.bookmarkId, part))
    for (const m of media) {
      const key = `${m.platform}:${m.id}`
      if (!wanted.has(key)) continue
      const kinds = needs.get(key) ?? new Set<UnderstandingKind>()
      kinds.add('image')
      if (m.type === 'video' || m.type === 'animated_gif') kinds.add('video')
      needs.set(key, kinds)
    }
    const rows = await db
      .select({
        platform: postEmbeddings.platform,
        id: postEmbeddings.postId,
        kind: postEmbeddings.kind,
        contentHash: postEmbeddings.contentHash,
      })
      .from(postEmbeddings)
      .where(
        and(eq(postEmbeddings.model, SEMANTIC_MODEL_VERSION), inArray(postEmbeddings.postId, part)),
      )
    for (const r of rows) {
      if (r.kind === 'video' && !videoResultCurrent(r.contentHash)) continue
      have.add(`${r.platform}:${r.id}:${r.kind}`)
    }
  }
  const out = new Set<string>()
  for (const [key, kinds] of needs) {
    if ([...kinds].some((kind) => !have.has(`${key}:${kind}`))) out.add(key)
  }
  return out
}
