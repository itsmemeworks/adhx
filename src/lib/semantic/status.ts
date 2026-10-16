import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarkMedia, bookmarks, postEmbeddings, understandingQueue } from '@/lib/db/schema'
import { SEMANTIC_MODEL_VERSION, semanticEnabled, type UnderstandingKind } from './config'
import { currentActivity } from './worker'

export interface UnderstandingGroup {
  id: 'words' | 'photos' | 'videos'
  done: number
  total: number
  failed: number
}

export interface UnderstandingStatus {
  enabled: boolean
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
        status: postEmbeddings.status,
      })
      .from(postEmbeddings)
      .where(
        and(eq(postEmbeddings.model, SEMANTIC_MODEL_VERSION), inArray(postEmbeddings.postId, part)),
      )
    for (const r of rows) results.set(`${r.platform}:${r.id}:${r.kind}`, r.status)
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
  const photos = all.filter((k) => !hasVideo.has(k) && hasPhoto.has(k))
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

  const activity = currentActivity()
  const current =
    activity && savedKeys.has(`${activity.platform}:${activity.postId}`)
      ? {
          platform: activity.platform,
          postId: activity.postId,
          kind: activity.kind,
          phase: activity.phase,
          frames: activity.frames,
        }
      : null

  return {
    enabled: semanticEnabled(),
    groups,
    ready,
    totalSaves: all.length,
    failed: groups.reduce((n, g) => n + g.failed, 0),
    queued: queuedForUser,
    current,
  }
}
