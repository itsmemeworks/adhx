import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { and, eq, sql } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { keepJobs, keptFiles } from '@/lib/db/schema'
import { mediaDir } from './config'

export type KeptKind = 'video' | 'photo' | 'audio'
export type Slot = `${KeptKind}-${number}` | 'poster'

const SLOT = /^(?:(video|photo|audio)-([1-9]\d?)|poster)$/
const PLATFORM = /^[a-z]{1,16}$/

export function isSlot(value: string): value is Slot {
  return SLOT.test(value)
}

export function slotFor(kind: KeptKind, index: number): Slot {
  return `${kind}-${index}` as Slot
}

export function parseSlot(slot: Slot): { kind: KeptKind | 'poster'; index: number } {
  const m = slot.match(SLOT)!
  return m[1] ? { kind: m[1] as KeptKind, index: Number(m[2]) } : { kind: 'poster', index: 1 }
}

/**
 * A post's folder under MEDIA_DIR: `{platform}/{safe id}-{hash}`. Ids are
 * sanitised for the filesystem, and the short hash keeps two ids that
 * sanitise alike apart.
 */
export function postDir(platform: string, postId: string): string {
  if (!PLATFORM.test(platform)) throw new Error('Invalid platform')
  const safe = postId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'post'
  const hash = crypto.createHash('sha1').update(postId).digest('hex').slice(0, 8)
  return path.join(platform, `${safe}-${hash}`)
}

/** Absolute path for a stored relative path, refusing anything outside MEDIA_DIR. */
export function absolutePath(relative: string): string {
  const root = mediaDir()
  const full = path.resolve(root, relative)
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error('Path outside media')
  return full
}

export interface KeptFile {
  slot: Slot
  path: string
  mime: string
  bytes: number
  width: number | null
  height: number | null
  durationMs: number | null
}

export function keptFile(platform: string, postId: string, slot: Slot): KeptFile | null {
  const [row] = db
    .select()
    .from(keptFiles)
    .where(
      and(eq(keptFiles.platform, platform), eq(keptFiles.postId, postId), eq(keptFiles.slot, slot)),
    )
    .limit(1)
    .all()
  return row ? { ...row, slot: row.slot as Slot } : null
}

export function keptFilesFor(platform: string, postId: string): KeptFile[] {
  return db
    .select()
    .from(keptFiles)
    .where(and(eq(keptFiles.platform, platform), eq(keptFiles.postId, postId)))
    .all()
    .map((row) => ({ ...row, slot: row.slot as Slot }))
}

/** What's kept for many posts at once, keyed `platform:id`. */
export function keptSummary(
  keys: Array<{ platform: string; postId: string }>,
): Map<string, { videos: number; photos: number; audio: number; poster: boolean }> {
  const out = new Map<string, { videos: number; photos: number; audio: number; poster: boolean }>()
  if (keys.length === 0) return out
  const ids = [...new Set(keys.map((k) => k.postId))]
  const rows = db
    .select({ platform: keptFiles.platform, postId: keptFiles.postId, slot: keptFiles.slot })
    .from(keptFiles)
    .where(
      sql`${keptFiles.postId} IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .all()
  for (const r of rows) {
    const key = `${r.platform}:${r.postId}`
    const s = out.get(key) ?? { videos: 0, photos: 0, audio: 0, poster: false }
    if (r.slot === 'poster') s.poster = true
    else if (r.slot.startsWith('video-')) s.videos++
    else if (r.slot.startsWith('photo-')) s.photos++
    else if (r.slot.startsWith('audio-')) s.audio++
    out.set(key, s)
  }
  return out
}

export interface NewKeptFile {
  slot: Slot
  /** Absolute path of the finished file inside the post's folder. */
  file: string
  mime: string
  width?: number | null
  height?: number | null
  durationMs?: number | null
}

/** Record a post's files (replacing any earlier set) and mark its job done. */
export async function recordKept(
  platform: string,
  postId: string,
  files: NewKeptFile[],
): Promise<number> {
  const now = new Date().toISOString()
  const rows = await Promise.all(
    files.map(async (f) => ({
      platform,
      postId,
      slot: f.slot,
      path: path.relative(mediaDir(), f.file),
      mime: f.mime,
      bytes: (await fs.stat(f.file)).size,
      width: f.width ?? null,
      height: f.height ?? null,
      durationMs: f.durationMs ?? null,
      createdAt: now,
    })),
  )
  const total = rows.reduce((n, r) => n + r.bytes, 0)
  runInTransaction(() => {
    db.delete(keptFiles)
      .where(and(eq(keptFiles.platform, platform), eq(keptFiles.postId, postId)))
      .run()
    if (rows.length) db.insert(keptFiles).values(rows).run()
    db.update(keepJobs)
      .set({ status: 'done', lastError: null, bytes: total, updatedAt: now, nextAttemptAt: null })
      .where(and(eq(keepJobs.platform, platform), eq(keepJobs.postId, postId)))
      .run()
  })
  return total
}

/** Remove a post's files and rows (nobody has it saved any more). */
export async function forgetPost(platform: string, postId: string): Promise<void> {
  await fs.rm(absolutePath(postDir(platform, postId)), { recursive: true, force: true })
  runInTransaction(() => {
    db.delete(keptFiles)
      .where(and(eq(keptFiles.platform, platform), eq(keptFiles.postId, postId)))
      .run()
    db.delete(keepJobs)
      .where(and(eq(keepJobs.platform, platform), eq(keepJobs.postId, postId)))
      .run()
  })
}

export const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  opus: 'audio/ogg',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
}

export function mimeFor(file: string): string {
  return MIME_BY_EXT[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream'
}
