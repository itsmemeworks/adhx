import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ffmpegPath } from '../media/ffmpeg'
import {
  SCREEN_FRAME_WIDTH,
  SCREEN_VIDEO_FRAMES,
  SCREEN_VIDEO_SECONDS,
  SPEECH_MAX_SECONDS,
  SPEECH_SAMPLE_RATE,
} from './config'
import { cleanScreenText, cleanTranscript } from './extract-clean'
import type { RunExtract } from './extractor'

/**
 * Getting media ready for the extract process, and turning its raw output
 * into words worth keeping. ffmpeg (the bundled `ffmpeg-static`) runs here,
 * asynchronously; only the model runs in the extract process. No database
 * access: the native Mac worker uses this too.
 */

const AUDIO_TIMEOUT_MS = 5 * 60_000
const FRAME_TIMEOUT_MS = 60_000

/** The file has no stream of the kind asked for (no sound, or no picture). */
export class NoStreamError extends Error {}

function run(binary: string, args: string[], timeout: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    execFile(binary, args, { timeout, maxBuffer: 1024 * 1024, signal }, (error, _out, stderr) => {
      if (!error) return resolve()
      const message = String(stderr || error.message)
      if (/matches no streams|does not contain any stream|Output file is empty/i.test(message))
        reject(new NoStreamError('No such stream'))
      else reject(new Error(`ffmpeg failed: ${message.slice(0, 300)}`))
    })
  })
}

/**
 * The first ten minutes of sound as mono 16 kHz float samples (what the
 * speech model reads), written to `dir/audio.f32`. `localOnly` refuses
 * anything but local files (the Mac worker's downloads).
 */
export async function extractAudio(
  source: string,
  dir: string,
  options: { localOnly?: boolean; signal?: AbortSignal } = {},
): Promise<{ file: string; seconds: number }> {
  const file = path.join(dir, 'audio.f32')
  await run(
    await ffmpegPath(),
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      ...(options.localOnly ? ['-protocol_whitelist', 'file,pipe'] : []),
      '-t',
      String(SPEECH_MAX_SECONDS),
      '-i',
      source,
      '-map',
      '0:a:0',
      '-vn',
      '-sn',
      '-dn',
      '-ac',
      '1',
      '-ar',
      String(SPEECH_SAMPLE_RATE),
      '-f',
      'f32le',
      file,
    ],
    AUDIO_TIMEOUT_MS,
    options.signal,
  )
  const bytes = (await stat(file)).size
  if (!bytes) throw new NoStreamError('No sound to listen to')
  return { file, seconds: bytes / 4 / SPEECH_SAMPLE_RATE }
}

/** Frame times for reading text on screen: spread over the first minute (cell midpoints). */
export function screenFrameTimes(duration: number | null): number[] {
  const span = Math.min(
    duration && duration > 0 ? duration : SCREEN_VIDEO_SECONDS,
    SCREEN_VIDEO_SECONDS,
  )
  const count = duration && duration < 4 ? 1 : SCREEN_VIDEO_FRAMES
  return Array.from({ length: count }, (_, i) => ((i + 0.5) * span) / count)
}

/** A few frames of a video, at most 768 px wide, for the text reader. Missing frames are skipped. */
export async function sampleScreenFrames(
  source: string,
  dir: string,
  duration: number | null,
  options: { localOnly?: boolean; signal?: AbortSignal } = {},
): Promise<string[]> {
  const binary = await ffmpegPath()
  const files: string[] = []
  for (const [i, time] of screenFrameTimes(duration).entries()) {
    const output = path.join(dir, `frame-${i}.jpg`)
    try {
      await run(
        binary,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-y',
          ...(options.localOnly ? ['-protocol_whitelist', 'file,pipe'] : []),
          '-ss',
          time.toFixed(3),
          '-i',
          source,
          '-map',
          '0:v:0',
          '-an',
          '-sn',
          '-frames:v',
          '1',
          '-vf',
          `scale='min(${SCREEN_FRAME_WIDTH},iw)':-2`,
          '-q:v',
          '3',
          output,
        ],
        FRAME_TIMEOUT_MS,
        options.signal,
      )
      if ((await stat(output)).size > 0) files.push(output)
    } catch (error) {
      options.signal?.throwIfAborted()
      if (files.length === 0 && i === 0 && !(error instanceof NoStreamError)) throw error
    }
  }
  return files
}

export async function scratchDir(prefix: string, parent = os.tmpdir()): Promise<string> {
  return mkdtemp(path.join(parent, `adhx-${prefix}-`))
}

/** What is said in a video or sound, cleaned; null for silence, music or no sound. */
export async function transcribeSource(
  source: string,
  extract: RunExtract,
  options: { localOnly?: boolean; signal?: AbortSignal; scratch?: string } = {},
): Promise<{ text: string; language: string | null } | null> {
  const dir = await scratchDir('speech', options.scratch)
  try {
    let audio: { file: string; seconds: number }
    try {
      audio = await extractAudio(source, dir, options)
    } catch (error) {
      if (error instanceof NoStreamError) return null
      throw error
    }
    if (audio.seconds < 0.5) return null
    const result = await extract({ kind: 'speech', file: audio.file }, options.signal)
    return cleanTranscript(result.windows ?? [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Text on screen across a post's pictures (local files) and a few frames of
 * its video, cleaned and de-duplicated; null when nothing readable is there.
 */
export async function readScreenText(
  images: string[],
  video: { source: string; duration: number | null } | null,
  extract: RunExtract,
  options: { localOnly?: boolean; signal?: AbortSignal; scratch?: string } = {},
): Promise<string | null> {
  const dir = await scratchDir('screen', options.scratch)
  try {
    const frames = video ? await sampleScreenFrames(video.source, dir, video.duration, options) : []
    const files = [...images, ...frames]
    if (files.length === 0) return null
    const result = await extract({ kind: 'screen', files }, options.signal)
    return cleanScreenText(result.reads ?? [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Remove scratch left by a crash (older than an hour). */
export async function sweepScratch(parent = os.tmpdir()): Promise<void> {
  try {
    for (const name of await readdir(parent)) {
      if (!/^adhx-(speech|screen)-/.test(name)) continue
      const file = path.join(parent, name)
      const info = await stat(file)
      if (Date.now() - info.mtimeMs > 60 * 60_000) await rm(file, { recursive: true, force: true })
    }
  } catch {
    // best effort
  }
}
