import { execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { keptFiles } from '@/lib/db/schema'
import { ffmpegPath } from '@/lib/media/ffmpeg'
import { probeMedia } from './probe'
import { absolutePath, keptFile, type KeptFile } from './store'

/**
 * A still from a video, for networks that don't give one (Reddit, Bluesky …):
 * the frame a second in, or the middle of a shorter clip. Null when ffmpeg
 * can't make one; the player then shows the video's first frame itself.
 */
export async function posterFrame(
  file: string,
  durationMs: number | null,
  out: string,
): Promise<string | null> {
  const at = durationMs && durationMs < 2000 ? durationMs / 2000 : 1
  const bin = await ffmpegPath()
  try {
    await new Promise<void>((resolve, reject) => {
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
        (error) => (error ? reject(error) : resolve()),
      )
    })
    await fs.access(out)
    return out
  } catch {
    return null
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
