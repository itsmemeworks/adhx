import { randomUUID } from 'node:crypto'
import { execFile } from 'child_process'
import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'
import { and, eq } from 'drizzle-orm'
import { db, runInTransaction } from '@/lib/db'
import { bookmarks, keepSettings, keptFiles } from '@/lib/db/schema'
import { ffmpegPath } from '@/lib/media/ffmpeg'
import { probeMedia } from './probe'
import { absolutePath, keptFile, type KeptFile } from './store'

import { remoteProcessing } from '@/lib/processing/config'
import { newWorkPaused } from '@/lib/processing/pause'
import { readPostModeration } from '@/lib/admin/moderation'

/** How bright a picture is, 0 (black) to 255 (white); null when it can't be read. */
export async function brightness(file: string): Promise<number | null> {
  try {
    const { channels } = await sharp(file).greyscale().stats()
    return channels[0]?.mean ?? null
  } catch {
    return null
  }
}

/** A frame this dark reads as a black tile in a channel's covers. */
export const DARK_POSTER = 30
/** Bright enough to stop looking at more frames. */
const GOOD_POSTER = 45

function grabFrame(bin: string, file: string, at: number, out: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      bin,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-ss',
        at.toFixed(2),
        '-i',
        file,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        out,
      ],
      { timeout: 60_000 },
      (error) => resolve(!error),
    )
  })
}

/** Where to look for a poster: a little way in (past fades and black intros), then further. */
export function posterTimes(durationMs: number | null): number[] {
  if (!durationMs || durationMs < 2000) return [durationMs ? durationMs / 2000 : 1]
  const d = durationMs / 1000
  const times = [Math.min(Math.max(1, d * 0.1), 20), d * 0.25, d * 0.5, 1]
  return [...new Set(times.map((t) => Math.round(Math.min(t, d - 0.1) * 100) / 100))]
}

/**
 * A still from a video, for networks that don't give one (Reddit, Bluesky …),
 * and for a network's own poster that turned out black. Tries a few moments
 * (past fades and black intros) and keeps the first that isn't dark, else the
 * brightest. Null when ffmpeg can't make one; the player then shows the
 * video's first frame itself.
 */
export async function posterFrame(
  file: string,
  durationMs: number | null,
  out: string,
): Promise<string | null> {
  const bin = await ffmpegPath()
  let best: { path: string; light: number } | null = null
  const tried: string[] = []
  try {
    for (const [i, at] of posterTimes(durationMs).entries()) {
      const candidate = `${out}.${i}.jpg`
      tried.push(candidate)
      if (!(await grabFrame(bin, file, at, candidate))) continue
      const light = (await brightness(candidate)) ?? 0
      if (!best || light > best.light) best = { path: candidate, light }
      if (light >= GOOD_POSTER) break
    }
    if (!best) return null
    await fs.rename(best.path, out)
    return out
  } catch {
    return null
  } finally {
    await Promise.all(tried.map((t) => fs.rm(t, { force: true })))
  }
}

type Snapshot = typeof keptFiles.$inferSelect
function snapshot(platform: string, postId: string, slot: string): Snapshot | undefined {
  return db
    .select()
    .from(keptFiles)
    .where(
      and(eq(keptFiles.platform, platform), eq(keptFiles.postId, postId), eq(keptFiles.slot, slot)),
    )
    .get()
}

function allowed(): boolean {
  return !remoteProcessing() && !newWorkPaused()
}

/** Publish a unique file only if both retained generations still match. */
async function publishPoster(
  video: Snapshot,
  poster: Snapshot | undefined,
  relative: string,
): Promise<boolean> {
  const out = absolutePath(relative)
  let published = false
  try {
    const probed = await probeMedia(out)
    const bytes = (await fs.stat(/* turbopackIgnore: true */ out)).size
    published = runInTransaction(() => {
      const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
      const moderation = readPostModeration(video.platform, video.postId)
      if (
        !allowed() ||
        !moderation.ok ||
        moderation.value ||
        !same(snapshot(video.platform, video.postId, 'video-1'), video) ||
        !same(snapshot(video.platform, video.postId, 'poster'), poster) ||
        !db
          .select({ id: bookmarks.id })
          .from(bookmarks)
          .where(and(eq(bookmarks.platform, video.platform), eq(bookmarks.id, video.postId)))
          .get()
      )
        return false
      db.insert(keptFiles)
        .values({
          platform: video.platform,
          postId: video.postId,
          slot: 'poster',
          path: relative,
          mime: 'image/jpeg',
          bytes,
          width: probed.width,
          height: probed.height,
          durationMs: null,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: [keptFiles.platform, keptFiles.postId, keptFiles.slot],
          set: {
            path: relative,
            mime: 'image/jpeg',
            bytes,
            width: probed.width,
            height: probed.height,
            durationMs: null,
            createdAt: new Date().toISOString(),
          },
        })
        .run()
      return true
    })
    if (
      published &&
      poster &&
      // Only our immutable repair names are safe to delete here. Downloads can
      // reuse legacy canonical paths before recording their replacement row.
      /^poster-[a-f0-9-]{36}\.jpg$/.test(path.basename(poster.path)) &&
      !db.select().from(keptFiles).where(eq(keptFiles.path, poster.path)).get()
    ) {
      await fs.rm(absolutePath(poster.path), { force: true }).catch(() => {})
    }
    return published
  } finally {
    if (!published) await fs.rm(out, { force: true })
  }
}

const making = new Map<string, Promise<KeptFile | null>>()

/** Missing posters are generated only on local, unpaused processing hosts. */
export function ensurePoster(platform: string, postId: string): Promise<KeptFile | null> {
  const key = `${platform}:${postId}`
  const pending = making.get(key)
  if (pending) return pending
  const job = (async () => {
    const existing = keptFile(platform, postId, 'poster')
    if (existing) return existing
    if (!allowed()) return null
    const video = snapshot(platform, postId, 'video-1')
    if (!video) return null
    const relative = path.join(path.dirname(video.path), `poster-${randomUUID()}.jpg`)
    const out = absolutePath(relative)
    let published = false
    try {
      if (!(await posterFrame(absolutePath(video.path), video.durationMs, out))) return null
      published = await publishPoster(video, undefined, relative)
      return keptFile(platform, postId, 'poster')
    } finally {
      if (!published) await fs.rm(out, { force: true })
    }
  })().finally(() => making.delete(key))
  making.set(key, job)
  return job
}

const REPAIR_KEY = 'poster_repair_v1'
let repairing: Promise<number> | null = null

/** Resumable, single-flight maintenance; remote servers never launch local decoding. */
export function repairDarkPosters({ pauseMs = 150 } = {}): Promise<number> {
  if (repairing) return repairing
  const job = repair(pauseMs).finally(() => {
    repairing = null
  })
  repairing = job
  return job
}

async function repair(pauseMs: number): Promise<number> {
  if (!allowed()) return 0
  const done = db.select().from(keepSettings).where(eq(keepSettings.key, REPAIR_KEY)).get()
  if (done) return 0
  const posters = db.select().from(keptFiles).where(eq(keptFiles.slot, 'poster')).all()
  let fixed = 0
  let complete = true
  for (const poster of posters) {
    if (!allowed()) return fixed // Do not mark an interrupted pass complete.
    const video = snapshot(poster.platform, poster.postId, 'video-1')
    if (!video) continue
    const light = await brightness(absolutePath(poster.path))
    if (light === null || light >= DARK_POSTER) continue
    if (!allowed()) return fixed
    const relative = path.join(path.dirname(poster.path), `poster-${randomUUID()}.jpg`)
    const tmp = absolutePath(relative)
    let published = false
    try {
      if (!(await posterFrame(absolutePath(video.path), video.durationMs, tmp))) {
        complete = false
        continue
      }
      const newLight = (await brightness(tmp)) ?? 0
      if (newLight < light + 12) continue
      published = await publishPoster(video, poster, relative)
      if (published) fixed++
      else complete = false
    } finally {
      if (!published) await fs.rm(tmp, { force: true })
    }
    if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs))
  }
  if (complete && allowed())
    db.insert(keepSettings)
      .values({ key: REPAIR_KEY, value: new Date().toISOString() })
      .onConflictDoNothing()
      .run()
  return fixed
}
