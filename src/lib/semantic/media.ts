import { execFile } from 'child_process'
import { mkdtemp, readdir, readFile, rm, stat } from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  fetchWithAllowlistedRedirects,
  readResponseBodyWithLimit,
  TWITTER_MEDIA_HOSTS,
} from '@/lib/media/proxy'
import { ffmpegPath } from '@/lib/media/ffmpeg'
import {
  internalOrigin,
  VIDEO_FPS,
  VIDEO_FRAME_WIDTH,
  VIDEO_MAX_FRAMES,
  VIDEO_MAX_SECONDS,
} from './config'

/** Hosts the worker may fetch pictures from directly. Everything else is skipped (SSRF). */
const IMAGE_HOSTS = ['d.fixupx.com', ...TWITTER_MEDIA_HOSTS]
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const IMAGE_TIMEOUT_MS = 20_000
const VIDEO_TIMEOUT_MS = 120_000

/**
 * Same-origin proxy paths are fetched over loopback (they apply their own
 * upstream allowlists); external URLs must be https on an allowlisted host.
 */
export function resolveMediaUrl(
  url: string,
): { url: string; hosts: string[]; loopback: boolean } | null {
  if (url.startsWith('/api/media/') || url.startsWith('/api/files/')) {
    return { url: internalOrigin() + url, hosts: [], loopback: true }
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  const host = parsed.hostname
  const allowed = IMAGE_HOSTS.some((h) => (h.startsWith('.') ? host.endsWith(h) : host === h))
  return allowed ? { url: parsed.toString(), hosts: IMAGE_HOSTS, loopback: false } : null
}

export class MediaUnavailableError extends Error {}

/** The post's "video" turned out not to be one (e.g. a legacy save mislabeled as a Reel). */
export class NotAVideoError extends MediaUnavailableError {}

/** The media was removed upstream (404/410): there is nothing left to understand. */
export class MediaGoneError extends MediaUnavailableError {}

const GONE = new Set([404, 410])

/**
 * After ffmpeg fails, ask the proxy why: it answers 409 for posts that are
 * really photos and 404/410 for deleted ones. Only runs on failure so
 * working videos cost no extra upstream lookup.
 */
async function proxyStatus(source: string): Promise<number | null> {
  try {
    const response = await fetch(source, {
      headers: { Range: 'bytes=0-0' },
      redirect: 'manual',
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    })
    await response.body?.cancel()
    return response.status
  } catch {
    return null
  }
}

/**
 * The kept file behind an `/api/files/…` path, when it's on disk. Reading it
 * directly skips the HTTP round trip and gives the original quality.
 */
export async function keptLocalFile(url: string): Promise<string | null> {
  const m = url.match(/^\/api\/files\/([a-z]{1,16})\/([^/?]+)\/([a-z0-9-]+)/)
  if (!m) return null
  const { keptFile, absolutePath, isSlot } = await import('@/lib/keep/store')
  const slot = m[3]
  if (!isSlot(slot)) return null
  const id = decodeURIComponent(m[2])
  const kept =
    keptFile(m[1], id, slot) ?? (slot === 'poster' ? keptFile(m[1], id, 'photo-1') : null)
  return kept ? absolutePath(kept.path) : null
}

/**
 * Why there's no video to sample at a kept-files path, when the download is
 * over: it kept a sound or pictures instead (nothing to watch), or it gave up.
 * Null while there's still a video to wait for.
 */
async function noVideoToSample(videoPath: string): Promise<Error | null> {
  const m = videoPath.match(/^\/api\/files\/([a-z]{1,16})\/([^/?]+)\/(video-\d+)/)
  if (!m) return null
  const [, platform, rawId, slot] = m
  const id = decodeURIComponent(rawId)
  const { keptFile, keptFilesFor } = await import('@/lib/keep/store')
  if (keptFile(platform, id, slot as `video-${number}`)) return null
  const files = keptFilesFor(platform, id)
  if (files.some((f) => f.slot.startsWith('audio-')))
    return new NotAVideoError('A sound, not a video')
  const { db } = await import('@/lib/db')
  const { keepJobs } = await import('@/lib/db/schema')
  const { and, eq } = await import('drizzle-orm')
  const [job] = db
    .select({ status: keepJobs.status })
    .from(keepJobs)
    .where(and(eq(keepJobs.platform, platform), eq(keepJobs.postId, id)))
    .limit(1)
    .all()
  if (job?.status === 'unavailable') return new MediaGoneError('Its video couldn’t be downloaded')
  if (job?.status === 'done' && files.length)
    return new NotAVideoError('Kept as pictures, not a video')
  return null
}

async function proxyStatusFollowing(source: string): Promise<number | null> {
  try {
    const response = await fetch(source, {
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    })
    await response.body?.cancel()
    return response.status
  } catch {
    return null
  }
}

/** Download one picture's bytes (bounded size and time). */
export async function fetchImageBytes(url: string): Promise<Uint8Array> {
  const local = await keptLocalFile(url)
  if (local) {
    if ((await stat(local)).size > MAX_IMAGE_BYTES * 4) {
      throw new MediaUnavailableError('Kept image is too large to read')
    }
    return new Uint8Array(await readFile(local))
  }
  const target = resolveMediaUrl(url)
  if (!target) throw new MediaUnavailableError(`Image host not allowed: ${url}`)
  const response = target.loopback
    ? await fetch(target.url, {
        // /api/files hands off to a same-origin proxy (or X's CDN) until the
        // file is kept.
        redirect: url.startsWith('/api/files/') ? 'follow' : 'error',
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      })
    : await fetchWithAllowlistedRedirects(target.url, {
        hosts: target.hosts,
        timeoutMs: IMAGE_TIMEOUT_MS,
      })
  if (!response.ok) {
    // Not downloaded yet, and no proxy for this network: try again later.
    if (url.startsWith('/api/files/') && response.status === 404) {
      throw new MediaUnavailableError('Not downloaded yet')
    }
    const Failure = GONE.has(response.status) ? MediaGoneError : MediaUnavailableError
    throw new Failure(`Image fetch failed: ${response.status}`)
  }
  return readResponseBodyWithLimit(response, MAX_IMAGE_BYTES)
}

export { ffmpegPath }

export interface SampledFrames {
  dir: string
  /** JPEG frame files in time order. */
  files: string[]
  /** Seconds covered. */
  duration: number
  cleanup: () => Promise<void>
}

/**
 * Sample a video's first 32 seconds at one frame every 2s (at most 16),
 * downscaled. ffmpeg reads the stream over HTTP with Range requests, so
 * only the sampled window (plus the index) is transferred.
 */
export async function sampleVideoFrames(videoPath: string): Promise<SampledFrames> {
  if (!videoPath.startsWith('/api/media/') && !videoPath.startsWith('/api/files/')) {
    throw new MediaUnavailableError('Video must be a same-origin media proxy path')
  }
  const local = await keptLocalFile(videoPath)
  if (!local) {
    const none = await noVideoToSample(videoPath)
    if (none) throw none
  }
  const source = local ?? internalOrigin() + videoPath
  const dir = await mkdtemp(path.join(os.tmpdir(), 'adhx-frames-'))
  const cleanup = () => rm(dir, { recursive: true, force: true })
  try {
    const binary = await ffmpegPath()
    await new Promise<void>((resolve, reject) => {
      execFile(
        binary,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-t',
          String(VIDEO_MAX_SECONDS),
          '-i',
          source,
          '-vf',
          `fps=${VIDEO_FPS},scale=${VIDEO_FRAME_WIDTH}:-2`,
          '-frames:v',
          String(VIDEO_MAX_FRAMES),
          '-q:v',
          '4',
          path.join(dir, 'f%03d.jpg'),
        ],
        { timeout: VIDEO_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
        (error, _stdout, stderr) => {
          if (error)
            reject(
              new MediaUnavailableError(
                `ffmpeg failed: ${String(stderr || error.message).slice(0, 300)}`,
              ),
            )
          else resolve()
        },
      )
    }).catch(async (error) => {
      if (local) throw error
      const status = await proxyStatus(source)
      if (videoPath.startsWith('/api/files/') && status === 404) {
        throw new MediaUnavailableError('Not downloaded yet')
      }
      if (status === 307 || status === 302) {
        // Handed off to a proxy: ask the proxy itself.
        const followed = await proxyStatusFollowing(source)
        if (followed === 409) throw new NotAVideoError('Post is a photo, not a video')
        if (followed !== null && GONE.has(followed)) {
          throw new MediaGoneError(`Video is gone: ${followed}`)
        }
        throw error
      }
      if (status === 409) throw new NotAVideoError('Post is a photo, not a video')
      if (status !== null && GONE.has(status)) throw new MediaGoneError(`Video is gone: ${status}`)
      throw error
    })
    const files = (await readdir(dir))
      .filter((f) => f.endsWith('.jpg'))
      .sort()
      .map((f) => path.join(dir, f))
    // ffmpeg read the file fine but found no picture track (a sound-only post).
    if (files.length === 0) throw new NotAVideoError('No picture track to sample')
    return { dir, files, duration: files.length / VIDEO_FPS, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
