/** Native macOS companion. The polling process never loads the blocking model. */
import { execFile, fork, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, realpathSync } from 'node:fs'
import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  stat,
  lstat,
  readFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { ffmpegPath } from '../media/ffmpeg'
import { probeMedia } from '../keep/probe'
import {
  EXTRACT_KINDS,
  KINDS,
  SEMANTIC_MODEL_VERSION,
  VIDEO_FRAME_WIDTH,
  extractEnabled,
  type JobKind,
} from '../semantic/config'
import { readScreenText, transcribeSource } from '../semantic/extract-media'
import { ExtractorProcess, type RunExtract } from '../semantic/extractor'
import { segmentBounds, segmentSampleTimes, validateVideoPlan, type VideoPlan } from './profiles'
import { PROCESSING_PROTOCOL, type ProcessingJob, type ProcessingMedia } from './protocol'

const GIB = 1024 ** 3
const MAX_IMAGE_BYTES = 32 * 1024 ** 2
const REQUEST_TIMEOUT = 30_000
const PROCESS_TIMEOUT = 10 * 60_000
const HEARTBEAT_MS = 20_000
const MAX_FRAME_BYTES = 4 * 1024 ** 2
const FRAME_SCRATCH_BYTES = 16 * MAX_FRAME_BYTES
const CONVERT_TIMEOUT = 2 * 60 * 60_000
/** Ten minutes of 16 kHz float samples (~38 MiB) plus a few text-reading frames. */
const EXTRACT_SCRATCH_BYTES = 64 * 1024 ** 2
class ScratchBudgetError extends Error {}

/**
 * What this worker offers to do (protocol 2 `kinds`). `SEMANTIC_SPEECH=off`
 * or `SEMANTIC_SCREEN_TEXT=off` on the Mac leaves that work for another
 * worker (or for later).
 */
export function workerKinds(): JobKind[] {
  return [...KINDS, ...EXTRACT_KINDS.filter(extractEnabled)]
}

function defaultModelCache(): string {
  return (
    process.env['SEMANTIC_CACHE_DIR'] ||
    path.join(os.homedir(), 'Library/Caches/ADHX-worker/models')
  )
}

export interface ConversionDetails {
  width: number
  height: number
  duration: number
  hasAudio: boolean
}
export interface ConvertedVideo {
  file: string
  cleanup: () => Promise<void>
}

export interface MacRunnerConfig {
  serverUrl: string
  token: string
  workerId: string
  cacheDir: string
  maxFileBytes: number
  maxCacheBytes: number
  pollMs: number
}

export type ModelTask =
  | { kind: 'text'; text: string }
  | { kind: 'image'; file: string }
  | { kind: 'video'; files: string[]; duration: number; secondsPerFrame: number }

export interface MacProcessor {
  run(task: ModelTask, signal: AbortSignal): Promise<number[]>
  close(): void
}

export interface RunnerDependencies {
  fetch?: typeof fetch
  processor?: MacProcessor
  probe?: (file: string) => Promise<number>
  sample?: (
    file: string,
    plan: VideoPlan,
    index: number,
    signal: AbortSignal,
  ) => Promise<{
    files: string[]
    cleanup: () => Promise<void>
  }>
  transcode?: (
    file: string,
    details: ConversionDetails,
    signal: AbortSignal,
    cacheDir: string,
    maxBytes: number,
  ) => Promise<ConvertedVideo>
  log?: (message: string) => void
  /** Runs the speech / on-screen text model (defaults to a separate extract process). */
  extract?: RunExtract
}

/** Browser-compatible copy, retaining source resolution and any audio. */
export async function convertNativeVideo(
  source: string,
  details: ConversionDetails,
  signal: AbortSignal,
  cacheDir: string,
  maxBytes: number,
): Promise<ConvertedVideo> {
  if (
    !Number.isInteger(details.width) ||
    !Number.isInteger(details.height) ||
    details.width < 2 ||
    details.height < 2 ||
    !Number.isFinite(details.duration) ||
    details.duration <= 0 ||
    details.duration > 24 * 60 * 60 ||
    typeof details.hasAudio !== 'boolean' ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 1024 * 1024 ||
    maxBytes > 4 * GIB
  )
    throw new Error('Invalid native conversion bounds')
  await mkdir(cacheDir, { recursive: true, mode: 0o700 })
  const dir = await mkdtemp(path.join(cacheDir, 'transcode-'))
  await chmod(dir, 0o700)
  const output = path.join(dir, 'video.mp4')
  const cleanup = () => rm(dir, { recursive: true, force: true })
  const binary = await ffmpegPath()
  const encodeSignal = AbortSignal.any([signal, AbortSignal.timeout(CONVERT_TIMEOUT)])
  const encode = (hardware: boolean) =>
    new Promise<void>((resolve, reject) => {
      execFile(
        binary,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-y',
          ...(hardware ? ['-hwaccel', 'videotoolbox'] : []),
          '-threads',
          '1',
          '-i',
          source,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-c:v',
          hardware ? 'h264_videotoolbox' : 'libx264',
          ...(hardware
            ? ['-allow_sw', '0', '-q:v', '65']
            : ['-preset', 'veryfast', '-crf', '20', '-threads', '2']),
          '-pix_fmt',
          'yuv420p',
          '-tag:v',
          'avc1',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-movflags',
          '+faststart',
          '-fs',
          String(maxBytes - 1024 * 1024),
          output,
        ],
        { timeout: CONVERT_TIMEOUT, maxBuffer: 64 * 1024, signal: encodeSignal },
        (error) => {
          if (error) reject(new Error('Native H.264 conversion failed'))
          else resolve()
        },
      )
    })
  try {
    const valid = async () => {
      const bytes = (await stat(output)).size
      const actual = await probeMedia(output)
      const dimensions =
        (actual.width === details.width && actual.height === details.height) ||
        (actual.width === details.height && actual.height === details.width)
      const tolerance = Math.max(0.1, Math.min(0.5, details.duration * 0.001))
      if (
        !bytes ||
        bytes > maxBytes ||
        !actual.hasVideo ||
        actual.videoCodec !== 'h264' ||
        !dimensions ||
        !actual.durationMs ||
        Math.abs(actual.durationMs / 1000 - details.duration) > tolerance ||
        actual.pixelFormat !== 'yuv420p' ||
        (details.hasAudio && (!actual.hasAudio || actual.audioCodec !== 'aac'))
      )
        throw new Error('Converted video failed integrity checks')
    }
    try {
      await encode(true)
      await valid()
    } catch {
      encodeSignal.throwIfAborted()
      await rm(output, { force: true })
      await encode(false)
      await valid()
    }
    return { file: output, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}

function positiveNumber(value: string | undefined, fallback: number, max: number): number {
  const parsed = value ? Number(value) : fallback
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) {
    throw new Error('Invalid native runner resource setting')
  }
  return parsed
}

export function runnerConfig(
  env: Record<string, string | undefined> = process.env,
): MacRunnerConfig {
  const url = new URL(env['ADHX_SERVER_URL'] || '')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
  ) {
    throw new Error(
      'ADHX_SERVER_URL must be an HTTPS origin (HTTP localhost is allowed for development)',
    )
  }
  const token = env['ADHX_WORKER_TOKEN'] || ''
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token))
    throw new Error('ADHX_WORKER_TOKEN must contain 32 to 256 URL-safe characters')
  const maxFileBytes = positiveNumber(env['ADHX_WORKER_MAX_FILE_BYTES'], 4 * GIB, 16 * GIB)
  const maxCacheBytes = positiveNumber(env['ADHX_WORKER_CACHE_BYTES'], 8 * GIB, 64 * GIB)
  if (maxCacheBytes < maxFileBytes) throw new Error('Worker cache must fit its maximum file size')
  return {
    serverUrl: url.origin,
    token,
    workerId: env['ADHX_WORKER_ID'] || `mac-${os.hostname()}`,
    cacheDir: path.resolve(
      env['ADHX_WORKER_CACHE_DIR'] || path.join(os.homedir(), 'Library/Caches/ADHX-worker'),
    ),
    maxFileBytes,
    maxCacheBytes,
    pollMs: positiveNumber(env['ADHX_WORKER_POLL_MS'], 5_000, 60_000),
  }
}

/** One seek and decoder process at a time; hardware decode falls back once. */
export async function sampleNativeFrames(
  file: string,
  plan: VideoPlan,
  index: number,
  signal: AbortSignal,
  cacheDir = path.join(os.homedir(), 'Library/Caches/ADHX-worker'),
): Promise<{ files: string[]; cleanup: () => Promise<void> }> {
  const times = segmentSampleTimes(plan, index)
  await mkdir(cacheDir, { recursive: true, mode: 0o700 })
  const dir = await mkdtemp(path.join(cacheDir, 'frames-'))
  await chmod(dir, 0o700)
  const cleanup = () => rm(dir, { recursive: true, force: true })
  const binary = await ffmpegPath()
  const files: string[] = []
  try {
    for (const [frame, timestamp] of times.entries()) {
      const output = path.join(dir, `${frame}.jpg`)
      const extract = (hardware: boolean, lastFrame = false) =>
        new Promise<void>((resolve, reject) => {
          execFile(
            binary,
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-nostdin',
              '-y',
              '-ss',
              timestamp.toFixed(6),
              ...(lastFrame ? ['-noaccurate_seek'] : []),
              ...(hardware ? ['-hwaccel', 'videotoolbox'] : []),
              '-threads',
              '1',
              '-i',
              file,
              '-map',
              '0:v:0',
              '-an',
              '-sn',
              ...(lastFrame ? ['-fps_mode', 'passthrough', '-update', '1'] : ['-frames:v', '1']),
              '-vf',
              `scale=${VIDEO_FRAME_WIDTH}:-2`,
              '-q:v',
              '4',
              output,
            ],
            { timeout: 30_000, maxBuffer: 64 * 1024, signal },
            (error) => {
              if (error) reject(new Error('Video frame extraction failed'))
              else resolve()
            },
          )
        })
      try {
        await extract(true)
      } catch {
        signal.throwIfAborted()
        await extract(false)
      }
      const hasFrame = await stat(output)
        .then((info) => info.size > 0)
        .catch((error) => {
          if (error.code === 'ENOENT') return false
          throw error
        })
      if (!hasFrame) {
        // An accurate seek can discard the only frame of a short clip or the
        // last displayed frame of a low-FPS video, then exit successfully with
        // no output. Decode the final GOP without discarding earlier timestamps
        // and overwrite one JPEG until its last frame, keeping memory bounded.
        try {
          await extract(true, true)
        } catch {
          signal.throwIfAborted()
          await extract(false, true)
        }
      }
      const bytes = (await stat(output)).size
      if (!bytes || bytes > MAX_FRAME_BYTES) throw new Error('Video frame exceeded its size budget')
      files.push(output)
    }
    return { files, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}

/** Child IPC keeps heartbeat/network timers responsive during native ONNX calls. */
export class NativeModelProcessor implements MacProcessor {
  private child: ChildProcess | null = null
  private active = false

  async run(task: ModelTask, signal: AbortSignal): Promise<number[]> {
    signal.throwIfAborted()
    if (this.active) throw new Error('Only one native inference may run at a time')
    this.active = true
    try {
      if (!this.child) {
        const modelEnv = { ...process.env }
        delete modelEnv['ADHX_WORKER_TOKEN']
        this.child = fork(fileURLToPath(import.meta.url), [], {
          execArgv: ['--import', 'tsx'],
          env: {
            ...modelEnv,
            ADHX_MAC_MODEL_CHILD: '1',
            SEMANTIC_TEXT_ONLY: '0',
            SEMANTIC_DEVICE: process.env['SEMANTIC_DEVICE'] || 'cpu',
            SEMANTIC_CACHE_DIR: defaultModelCache(),
          },
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        })
        const child = this.child
        child.on('exit', () => {
          if (this.child === child) this.child = null
        })
        try {
          if (child.pid) os.setPriority(child.pid, 10)
        } catch {
          /* best effort */
        }
      }
      const child = this.child
      return await new Promise<number[]>((resolve, reject) => {
        const id = randomUUID()
        const finish = (error?: Error, vector?: number[]) => {
          clearTimeout(timer)
          signal.removeEventListener('abort', abort)
          child.off('message', message)
          child.off('exit', exit)
          child.off('error', failed)
          if (error) reject(error)
          else resolve(vector!)
        }
        const abort = () => {
          this.close()
          finish(new Error('Native inference cancelled'))
        }
        const exit = () => finish(new Error('Native model process exited'))
        const failed = () => finish(new Error('Native model process failed'))
        const message = (value: unknown) => {
          const response = value as { id?: string; vector?: number[]; error?: string }
          if (response?.id !== id) return
          if (response.error) finish(new Error('Native model inference failed'))
          else if (Array.isArray(response.vector)) finish(undefined, response.vector)
          else finish(new Error('Invalid native model response'))
        }
        const timer = setTimeout(() => {
          this.close()
          finish(new Error('Native inference timed out'))
        }, PROCESS_TIMEOUT)
        signal.addEventListener('abort', abort, { once: true })
        child.on('message', message)
        child.once('exit', exit)
        child.once('error', failed)
        child.send({ id, task }, (error) => {
          if (error) failed()
        })
      })
    } finally {
      this.active = false
    }
  }

  close(): void {
    this.child?.kill('SIGTERM')
    this.child = null
  }
}

export function createMacRunner(config: MacRunnerConfig, dependencies: RunnerDependencies = {}) {
  const request = dependencies.fetch ?? fetch
  const processor = dependencies.processor ?? new NativeModelProcessor()
  const sample =
    dependencies.sample ??
    ((file, plan, index, signal) => sampleNativeFrames(file, plan, index, signal, config.cacheDir))
  const transcode = dependencies.transcode ?? convertNativeVideo
  const extractor = dependencies.extract
    ? null
    : new ExtractorProcess({ SEMANTIC_CACHE_DIR: defaultModelCache(), SEMANTIC_DEVICE: 'cpu' })
  const extract: RunExtract =
    dependencies.extract ?? ((task, signal) => extractor!.run(task, signal))
  const log = dependencies.log ?? ((message: string) => process.stdout.write(`${message}\n`))
  const probe =
    dependencies.probe ??
    (async (file: string) => {
      const media = await probeMedia(file)
      if (!media.hasVideo || !media.durationMs) throw new Error('No video duration')
      return media.durationMs / 1_000
    })
  const shutdown = new AbortController()
  let running = false
  let lastCleanup = 0

  async function post<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const response = await request(`${config.serverUrl}/api/processing/jobs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      redirect: 'error',
      body: JSON.stringify(body),
      signal: AbortSignal.any([
        shutdown.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT),
        ...(signal ? [signal] : []),
      ]),
    })
    if (!response.ok) throw new Error(`Worker request failed (${response.status})`)
    return response.json() as Promise<T>
  }

  async function pruneCache(incoming: number, keep?: string): Promise<void> {
    const files: Array<{ file: string; bytes: number; age: number; scratch: boolean }> = []
    const treeBytes = async (file: string): Promise<number> => {
      const info = await lstat(file)
      // Do not follow symlinks into model weights or unrelated directories.
      if (!info.isDirectory()) return info.size
      let bytes = 0
      for (const child of await readdir(file)) bytes += await treeBytes(path.join(file, child))
      return bytes
    }
    for (const name of await readdir(config.cacheDir)) {
      const scratch =
        /^(?:frames|transcode)-[a-zA-Z0-9]+$/.test(name) ||
        /^adhx-(?:speech|screen)-[a-zA-Z0-9]+$/.test(name) ||
        /^[a-f0-9]{64}\.[a-f0-9-]+\.partial$/.test(name)
      if (!scratch && !/^[a-f0-9]{64}\.media$/.test(name)) continue
      const file = path.join(config.cacheDir, name)
      const info = await lstat(file)
      const expired = Date.now() - info.mtimeMs > (scratch ? 60 * 60_000 : 24 * 60 * 60_000)
      if (expired && file !== keep) {
        await rm(file, { recursive: true, force: true })
        continue
      }
      files.push({ file, bytes: await treeBytes(file), age: info.mtimeMs, scratch })
    }
    // Pruning only runs between jobs or before extraction, so these scratch
    // files are abandoned. Prefer evicting them over unfinished-video originals.
    files.sort((a, b) => Number(b.scratch) - Number(a.scratch) || a.age - b.age)
    let used = files.reduce((total, file) => total + file.bytes, 0)
    for (const file of files) {
      if (file.file === keep) continue
      if (used + incoming <= config.maxCacheBytes) break
      await rm(file.file, { recursive: true, force: true })
      used -= file.bytes
    }
    if (used + incoming > config.maxCacheBytes)
      throw new ScratchBudgetError('Native media cache budget exceeded')
  }

  async function cachedMedia(
    job: ProcessingJob,
    signal: AbortSignal,
    media: ProcessingMedia | undefined = job.media,
    slot = '',
  ): Promise<string> {
    if (
      !media ||
      !Number.isSafeInteger(media.bytes) ||
      media.bytes <= 0 ||
      media.bytes > config.maxFileBytes
    ) {
      throw new Error('Media exceeds the native worker file budget')
    }
    await mkdir(config.cacheDir, { recursive: true, mode: 0o700 })
    await chmod(config.cacheDir, 0o700)
    // Lease URLs change on each claim. Cache by the stable source hash/kind so
    // long videos are downloaded once across resumable segment leases.
    const key = createHash('sha256')
      .update(`${job.kind}|${job.contentHash}${slot ? `|${slot}` : ''}`)
      .digest('hex')
    const target = path.join(config.cacheDir, `${key}.media`)
    try {
      if ((await stat(target)).size === media.bytes) {
        await pruneCache(0, target)
        return target
      }
    } catch {
      /* missing or stale cached original */
    }
    await rm(target, { force: true })
    await pruneCache(media.bytes)
    const temporary = path.join(config.cacheDir, `${key}.${randomUUID()}.partial`)
    const file = await open(temporary, 'wx', 0o600)
    try {
      const url = new URL('/api/processing/media', config.serverUrl)
      url.searchParams.set('id', String(job.id))
      if (slot) url.searchParams.set('slot', slot)
      const response = await request(url, {
        headers: { Authorization: `Bearer ${config.token}`, 'X-ADHX-Lease': job.lease },
        redirect: 'error',
        signal: AbortSignal.any([signal, shutdown.signal, AbortSignal.timeout(PROCESS_TIMEOUT)]),
      })
      if (!response.ok || !response.body) throw new Error('Retained media download failed')
      const reader = response.body.getReader()
      let bytes = 0
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.byteLength
          if (bytes > media.bytes || bytes > config.maxFileBytes)
            throw new Error('Retained media exceeded its declared size')
          await file.writeFile(chunk.value)
        }
      } finally {
        await reader.cancel().catch(() => undefined)
      }
      if (bytes !== media.bytes) throw new Error('Retained media was incomplete')
      await file.close()
      await rename(temporary, target)
      return target
    } catch (error) {
      await file.close().catch(() => undefined)
      await rm(temporary, { force: true })
      throw error
    }
  }

  async function runOnce(): Promise<boolean> {
    if (running) throw new Error('Native worker already has a running job')
    running = true
    try {
      if (!lastCleanup || Date.now() - lastCleanup > 60_000) {
        await mkdir(config.cacheDir, { recursive: true, mode: 0o700 })
        await chmod(config.cacheDir, 0o700)
        await pruneCache(0)
        lastCleanup = Date.now()
      }
      const { job } = await post<{ job: ProcessingJob | null }>({
        action: 'claim',
        workerId: config.workerId,
        model: SEMANTIC_MODEL_VERSION,
        protocol: PROCESSING_PROTOCOL,
        kinds: workerKinds(),
      })
      if (!job) return false
      if (job.model !== SEMANTIC_MODEL_VERSION)
        throw new Error('Server and native worker model versions differ')
      const controller = new AbortController()
      const signal = AbortSignal.any([shutdown.signal, controller.signal])
      let heartbeatPending = false
      const heartbeat = setInterval(() => {
        if (heartbeatPending || signal.aborted) return
        heartbeatPending = true
        post({ action: 'heartbeat', id: job.id, lease: job.lease }, signal)
          .catch(() => controller.abort())
          .finally(() => {
            heartbeatPending = false
          })
      }, HEARTBEAT_MS)
      const base = { id: job.id, lease: job.lease }
      try {
        if (job.kind === 'convert') {
          if (!job.conversion) throw new Error('Conversion metadata is missing')
          const source = await cachedMedia(job, signal)
          const maxOutput = Math.min(config.maxFileBytes, 4 * GIB)
          await pruneCache(maxOutput, source)
          const converted = await transcode(
            source,
            job.conversion,
            signal,
            config.cacheDir,
            maxOutput,
          )
          try {
            const bytes = (await stat(converted.file)).size
            if (!bytes || bytes > maxOutput)
              throw new Error('Converted upload exceeds the worker budget')
            const url = new URL('/api/processing/result', config.serverUrl)
            url.searchParams.set('id', job.id)
            const stream = createReadStream(converted.file)
            try {
              const options: RequestInit & { duplex: 'half' } = {
                method: 'PUT',
                redirect: 'error',
                duplex: 'half',
                headers: {
                  Authorization: `Bearer ${config.token}`,
                  'X-ADHX-Lease': job.lease,
                  'Content-Type': 'video/mp4',
                  'Content-Length': String(bytes),
                },
                body: Readable.toWeb(stream) as ReadableStream,
                signal: AbortSignal.any([
                  signal,
                  shutdown.signal,
                  AbortSignal.timeout(PROCESS_TIMEOUT),
                ]),
              }
              const response = await request(url, options)
              if (!response.ok) {
                if (response.status === 409) await rm(source, { force: true })
                throw new Error('Converted upload was rejected')
              }
              const result = (await response.json()) as { done?: boolean }
              if (result.done !== true) throw new Error('Converted upload was not acknowledged')
              await rm(source, { force: true })
            } finally {
              stream.destroy()
            }
          } finally {
            await converted.cleanup()
          }
        } else if (job.kind === 'speech') {
          const file = await cachedMedia(job, signal)
          await pruneCache(EXTRACT_SCRATCH_BYTES, file)
          const heard = await transcribeSource(file, extract, {
            localOnly: true,
            signal,
            scratch: config.cacheDir,
          })
          const result = await post<{ done: boolean }>(
            {
              action: 'extracted',
              ...base,
              text: heard?.text ?? null,
              language: heard?.language ?? null,
            },
            signal,
          )
          if (result.done) await rm(file, { force: true })
        } else if (job.kind === 'screen') {
          const listed = job.files ?? (job.media ? [{ ...job.media, slot: 'photo-1' }] : [])
          if (listed.length === 0 || listed.length > 8) throw new Error('Invalid screen job')
          const downloaded: { file: string; slot: string }[] = []
          for (const media of listed) {
            if (!/^(?:(?:video|photo)-[1-9]\d?|poster)$/.test(media.slot))
              throw new Error('Invalid screen job')
            if (media.slot !== 'video-1' && media.bytes > MAX_IMAGE_BYTES)
              throw new Error('Image exceeds the native worker budget')
            downloaded.push({
              file: await cachedMedia(job, signal, media, media.slot),
              slot: media.slot,
            })
          }
          const video = downloaded.find((d) => d.slot === 'video-1')
          await pruneCache(EXTRACT_SCRATCH_BYTES, video?.file)
          const text = await readScreenText(
            downloaded.filter((d) => d !== video).map((d) => d.file),
            video ? { source: video.file, duration: job.videoSeconds ?? null } : null,
            extract,
            { localOnly: true, signal, scratch: config.cacheDir },
          )
          const result = await post<{ done: boolean }>(
            { action: 'extracted', ...base, text },
            signal,
          )
          if (result.done) for (const d of downloaded) await rm(d.file, { force: true })
        } else if (job.kind === 'text') {
          if (typeof job.text !== 'string' || job.text.length > 32_000)
            throw new Error('Invalid text job')
          const vector = await processor.run({ kind: 'text', text: job.text }, signal)
          await post({ action: 'complete', ...base, vector }, signal)
        } else if (job.kind === 'image' || job.kind === 'video') {
          if (job.kind === 'image' && (job.media?.bytes ?? Infinity) > MAX_IMAGE_BYTES)
            throw new Error('Image exceeds the native worker budget')
          const file = await cachedMedia(job, signal)
          if (job.kind === 'image') {
            const vector = await processor.run({ kind: 'image', file }, signal)
            const result = await post<{ done: boolean }>(
              { action: 'complete', ...base, vector },
              signal,
            )
            if (result.done) await rm(file, { force: true })
          } else {
            const progress =
              job.video ??
              (
                await post<{ video: NonNullable<ProcessingJob['video']> }>(
                  {
                    action: 'plan',
                    ...base,
                    duration: await probe(file),
                  },
                  signal,
                )
              ).video
            validateVideoPlan(progress.plan)
            if (progress.plan.level !== job.profile)
              throw new Error('Video plan profile differs from the claimed job')
            const index = progress.nextSegment
            const { start, end } = segmentBounds(progress.plan, index)
            // Bound peak scratch use too, including the current original. Unit
            // test samplers own their synthetic IO and need no real JPEG reserve.
            if (!dependencies.sample) await pruneCache(FRAME_SCRATCH_BYTES, file)
            const frames = await sample(file, progress.plan, index, signal)
            try {
              const vector = await processor.run(
                {
                  kind: 'video',
                  files: frames.files,
                  duration: end - start,
                  secondsPerFrame: (end - start) / progress.plan.framesPerSegment,
                },
                signal,
              )
              const result = await post<{ done: boolean }>(
                { action: 'segment', ...base, index, vector },
                signal,
              )
              if (result.done) await rm(file, { force: true })
            } finally {
              await frames.cleanup()
            }
          }
        } else {
          // A newer server could offer a kind this worker doesn't know.
          throw new Error(`Unknown job kind: ${String(job.kind).slice(0, 20)}`)
        }
        log(`[worker] completed ${job.kind === 'video' ? 'video segment' : job.kind}`)
      } catch (error) {
        const reason =
          error instanceof ScratchBudgetError
            ? job.kind === 'convert'
              ? 'Native scratch cache budget is too small for the original plus the maximum conversion output'
              : 'Native scratch cache budget is too small; allow room for the original plus 64 MiB of video frames'
            : 'Native processing failed; inspect the worker configuration and retained media'
        if (!signal.aborted) {
          await post({
            action: 'fail',
            ...base,
            code: 'retry',
            error: reason,
          }).catch(() => undefined)
        }
        log(
          error instanceof ScratchBudgetError
            ? `[worker] ${reason}`
            : '[worker] processing deferred; job will retry',
        )
      } finally {
        clearInterval(heartbeat)
        controller.abort()
      }
      return true
    } finally {
      running = false
    }
  }

  return {
    runOnce,
    async run(): Promise<void> {
      while (!shutdown.signal.aborted) {
        let worked = false
        try {
          worked = await runOnce()
        } catch {
          log('[worker] server unavailable or configuration mismatch; retrying')
        }
        if (!worked && !shutdown.signal.aborted) {
          await new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(timer)
              shutdown.signal.removeEventListener('abort', done)
              resolve()
            }
            const timer = setTimeout(done, config.pollMs)
            shutdown.signal.addEventListener('abort', done, { once: true })
          })
        }
      }
    },
    close(): void {
      shutdown.abort()
      processor.close()
      extractor?.close()
    },
  }
}

async function modelChild(): Promise<void> {
  const { embedTexts, embedImageBytes, embedVideoFrames } = await import('../semantic/model')
  process.on('disconnect', () => process.exit(0))
  process.on('message', (message: { id: string; task: ModelTask }) => {
    const { id, task } = message
    const work = async () => {
      if (task.kind === 'text') return Array.from((await embedTexts([task.text]))[0])
      if (task.kind === 'image')
        return Array.from(await embedImageBytes(new Uint8Array(await readFile(task.file))))
      return Array.from(await embedVideoFrames(task.files, task.duration, task.secondsPerFrame))
    }
    work()
      .then((vector) => process.send?.({ id, vector }))
      .catch(() => process.send?.({ id, error: 'inference failed' }))
  })
}

const directlyInvoked =
  process.argv[1] &&
  pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href === import.meta.url
if (directlyInvoked) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') {
    console.error('[worker] this runner requires native Apple Silicon macOS')
    process.exitCode = 1
  } else if (process.env['ADHX_MAC_MODEL_CHILD'] === '1') {
    modelChild().catch(() => {
      console.error('[worker] model process failed')
      process.exitCode = 1
    })
  } else {
    try {
      const runner = createMacRunner(runnerConfig())
      process.once('SIGINT', () => runner.close())
      process.once('SIGTERM', () => runner.close())
      runner.run().catch(() => {
        runner.close()
        console.error('[worker] native worker stopped')
        process.exitCode = 1
      })
    } catch {
      console.error('[worker] invalid configuration; check the private environment file')
      process.exitCode = 1
    }
  }
}
