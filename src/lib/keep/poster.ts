import { execFile } from 'child_process'
import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { keepSettings, keptFiles } from '@/lib/db/schema'
import { ffmpegPath } from '@/lib/media/ffmpeg'
import { probeMedia } from './probe'
import { absolutePath, keptFile, type KeptFile } from './store'

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
    await Promise.all(tried.map((t) => (t === best?.path ? null : fs.rm(t, { force: true }))))
  }
}

const making = new Map<string, Promise<KeptFile | null>>()

/**
 * The poster for a kept video that was downloaded without one (before stills
 * were taken on download): made once, the first time something asks.
 */
export function ensurePoster(platform: string, postId: string): Promise<KeptFile | null> {
  const key = `${platform}:${postId}`
  const pending = making.get(key)
  if (pending) return pending
  const job = (async () => {
    const existing = keptFile(platform, postId, 'poster')
    if (existing) return existing
    const video = keptFile(platform, postId, 'video-1')
    if (!video) return null
    const videoFile = absolutePath(video.path)
    const relative = path.join(path.dirname(video.path), 'poster.jpg')
    const out = await posterFrame(videoFile, video.durationMs, absolutePath(relative))
    if (!out) return null
    const probed = await probeMedia(out)
    const row = {
      platform,
      postId,
      slot: 'poster',
      path: relative,
      mime: 'image/jpeg',
      // A kept file under MEDIA_DIR; don't let the build trace the whole project for it.
      bytes: (await fs.stat(/* turbopackIgnore: true */ out)).size,
      width: probed.width,
      height: probed.height,
      durationMs: null,
      createdAt: new Date().toISOString(),
    }
    db.insert(keptFiles).values(row).onConflictDoNothing().run()
    return keptFile(platform, postId, 'poster')
  })().finally(() => making.delete(key))
  making.set(key, job)
  return job
}

const REPAIR_KEY = 'poster_repair_v1'

/**
 * Once per server: posters that came out black (a network's own thumbnail of
 * a black first frame, or a grab inside a fade) are made again from the kept
 * video, when that finds a brighter frame. A channel made of such posts
 * otherwise shows four black tiles. Runs slowly in the background.
 */
export async function repairDarkPosters({ pauseMs = 150 } = {}): Promise<number> {
  const done = db.select().from(keepSettings).where(eq(keepSettings.key, REPAIR_KEY)).get()
  if (done) return 0
  const posters = db.select().from(keptFiles).where(eq(keptFiles.slot, 'poster')).all()
  let fixed = 0
  for (const poster of posters) {
    const video = keptFile(poster.platform, poster.postId, 'video-1')
    if (!video) continue
    const posterPath = absolutePath(poster.path)
    const light = await brightness(posterPath)
    if (light === null || light >= DARK_POSTER) continue
    const tmp = `${posterPath}.repair.jpg`
    const made = await posterFrame(absolutePath(video.path), video.durationMs, tmp)
    if (!made) continue
    const newLight = (await brightness(tmp)) ?? 0
    if (newLight < light + 12) {
      await fs.rm(tmp, { force: true })
      continue
    }
    await fs.rename(tmp, posterPath)
    const probed = await probeMedia(posterPath).catch(() => null)
    db.update(keptFiles)
      .set({
        bytes: (await fs.stat(/* turbopackIgnore: true */ posterPath)).size,
        width: probed?.width ?? poster.width,
        height: probed?.height ?? poster.height,
        createdAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(keptFiles.platform, poster.platform),
          eq(keptFiles.postId, poster.postId),
          eq(keptFiles.slot, 'poster'),
        ),
      )
      .run()
    fixed++
    if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs))
  }
  db.insert(keepSettings)
    .values({ key: REPAIR_KEY, value: new Date().toISOString() })
    .onConflictDoNothing()
    .run()
  return fixed
}
