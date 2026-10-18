import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookmarkMedia, bookmarks, keepJobs, keptFiles } from '@/lib/db/schema'
import { previewPath } from '@/lib/activity/preview-path'
import { isLinkNetwork, networkLabel } from '@/lib/platform/networks'
import { keepEnabled } from '@/lib/keep/config'
import { keepProgress } from '@/lib/keep/progress'
import { keptSrc } from '@/lib/keep/src'

/**
 * What the phone app sees of a saved post and of its kept copy. Addresses
 * may be relative; the app resolves them against the server it's paired with.
 */

type Bookmark = typeof bookmarks.$inferSelect

export interface AppPost {
  platform: string
  network: string
  id: string
  author: string
  authorName: string | null
  text: string
  category: string | null
  posterUrl: string | null
  openPath: string
  alreadySaved: boolean
  savedAt: string
}

export type KeepState = 'waiting' | 'keeping' | 'kept' | 'retrying' | 'unavailable' | 'off'

export interface AppKeepStatus {
  platform: string
  id: string
  status: KeepState
  percent: number | null
  quality: string | null
  kept: { videos: number; photos: number; audio: number }
}

/** The first `http(s)://` link in shared text, without trailing punctuation. */
export function firstLink(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const text = input.slice(0, 4000)
  const found =
    text.match(/https?:\/\/[^\s<>"'“”‘’]+/i)?.[0] ??
    // Some apps share "x.com/…" without the scheme.
    text.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>"'“”‘’]+/i)?.[0]
  if (!found) return null
  const clean = found.replace(/[.,;:!?)\]}>]+$/, '')
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`
}

/** A picture for the post: its kept poster, or the network's own thumbnail. */
function posterFor(row: Bookmark): string | null {
  const { platform, id, author, category } = row
  if (isLinkNetwork(platform)) return category === 'text' ? null : keptSrc(platform, id, 'poster')
  if (platform === 'instagram') return `/api/media/instagram/thumbnail?id=${encodeURIComponent(id)}`
  if (platform === 'tiktok') return keptSrc(platform, id, 'poster', author)
  const [media] = db
    .select({
      type: bookmarkMedia.mediaType,
      preview: bookmarkMedia.previewUrl,
      original: bookmarkMedia.originalUrl,
    })
    .from(bookmarkMedia)
    .where(
      and(
        eq(bookmarkMedia.userId, row.userId),
        eq(bookmarkMedia.platform, platform),
        eq(bookmarkMedia.bookmarkId, id),
      ),
    )
    .limit(1)
    .all()
  if (!media) return null
  return media.preview || (media.type === 'photo' ? media.original : null)
}

export function appPost(row: Bookmark, alreadySaved: boolean): AppPost {
  return {
    platform: row.platform,
    network: networkLabel(row.platform),
    id: row.id,
    author: row.author,
    authorName: row.authorName ?? null,
    text: row.text ?? '',
    category: row.category ?? null,
    posterUrl: posterFor(row),
    openPath: previewPath(row.platform, row.author, row.id, row.category),
    alreadySaved,
    savedAt: row.processedAt,
  }
}

/**
 * "720p", "4K" for a kept video, named by its shorter side so a vertical
 * 720×1280 video reads as 720p, as people expect.
 */
export function qualityLabel(
  width: number | null | undefined,
  height: number | null | undefined,
): string | null {
  const sides = [width, height].filter((n): n is number => !!n && n > 0)
  if (!sides.length) return null
  const short = Math.min(...sides)
  if (short >= 2160) return '4K'
  return `${short}p`
}

/** This account's saved post, or null. */
export function savedPost(userId: string, platform: string, id: string): Bookmark | null {
  const [row] = db
    .select()
    .from(bookmarks)
    .where(
      and(eq(bookmarks.userId, userId), eq(bookmarks.platform, platform), eq(bookmarks.id, id)),
    )
    .limit(1)
    .all()
  return row ?? null
}

/** How the kept copy of a post is coming along (keep jobs are shared by everyone who saved it). */
export function keepStatus(platform: string, id: string): AppKeepStatus {
  const [job] = db
    .select({ status: keepJobs.status })
    .from(keepJobs)
    .where(and(eq(keepJobs.platform, platform), eq(keepJobs.postId, id)))
    .limit(1)
    .all()
  const files = db
    .select({ slot: keptFiles.slot, width: keptFiles.width, height: keptFiles.height })
    .from(keptFiles)
    .where(and(eq(keptFiles.platform, platform), eq(keptFiles.postId, id)))
    .orderBy(sql`${keptFiles.slot}`)
    .all()
  const kept = { videos: 0, photos: 0, audio: 0 }
  let video: { width: number | null; height: number | null } | null = null
  for (const f of files) {
    if (f.slot.startsWith('video-')) {
      kept.videos++
      if (f.slot === 'video-1') video = f
    } else if (f.slot.startsWith('photo-')) kept.photos++
    else if (f.slot.startsWith('audio-')) kept.audio++
  }

  let status: KeepState
  switch (job?.status) {
    case 'running':
      status = 'keeping'
      break
    case 'done':
      status = 'kept'
      break
    case 'failed':
      status = 'retrying'
      break
    case 'unavailable':
      status = 'unavailable'
      break
    case 'pending':
      status = 'waiting'
      break
    default:
      // No job yet: the worker picks new saves up within seconds, when it runs.
      status = keepEnabled() ? 'waiting' : 'off'
  }

  return {
    platform,
    id,
    status,
    percent: status === 'kept' ? 100 : status === 'keeping' ? keepProgress(platform, id) : null,
    quality: video ? qualityLabel(video.width, video.height) : null,
    kept,
  }
}
