import { execFile } from 'child_process'
import { mkdtemp, readdir, rm } from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  fetchWithAllowlistedRedirects,
  readResponseBodyWithLimit,
  TWITTER_MEDIA_HOSTS,
} from '@/lib/media/proxy'
import {
  internalOrigin,
  VIDEO_FPS,
  VIDEO_FRAME_WIDTH,
  VIDEO_MAX_FRAMES,
  VIDEO_MAX_SECONDS,
} from './config'

/** Hosts the worker may fetch pictures from directly. Everything else is skipped (SSRF). */
const IMAGE_HOSTS = ['d.fixupx.com', ...TWITTER_MEDIA_HOSTS, 'i.ytimg.com']
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
  if (url.startsWith('/api/media/')) {
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

/** Download one picture's bytes (bounded size and time). */
export async function fetchImageBytes(url: string): Promise<Uint8Array> {
  const target = resolveMediaUrl(url)
  if (!target) throw new MediaUnavailableError(`Image host not allowed: ${url}`)
  const response = target.loopback
    ? await fetch(target.url, { redirect: 'error', signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) })
    : await fetchWithAllowlistedRedirects(target.url, {
        hosts: target.hosts,
        timeoutMs: IMAGE_TIMEOUT_MS,
      })
  if (!response.ok) throw new MediaUnavailableError(`Image fetch failed: ${response.status}`)
  return readResponseBodyWithLimit(response, MAX_IMAGE_BYTES)
}

export async function ffmpegPath(): Promise<string> {
  const fromEnv = process.env['FFMPEG_PATH']
  if (fromEnv) return fromEnv
  try {
    const bundled = (await import('ffmpeg-static')).default as unknown as string | null
    if (bundled) return bundled
  } catch {
    // fall back to ffmpeg on PATH
  }
  return 'ffmpeg'
}

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
  if (!videoPath.startsWith('/api/media/')) {
    throw new MediaUnavailableError('Video must be a same-origin media proxy path')
  }
  const source = internalOrigin() + videoPath
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
    })
    const files = (await readdir(dir))
      .filter((f) => f.endsWith('.jpg'))
      .sort()
      .map((f) => path.join(dir, f))
    if (files.length === 0) throw new MediaUnavailableError('ffmpeg produced no frames')
    return { dir, files, duration: files.length / VIDEO_FPS, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
