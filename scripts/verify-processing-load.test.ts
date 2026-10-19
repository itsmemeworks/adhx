import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createServer, type Server } from 'node:http'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import {
  cp,
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { NextRequest } from 'next/server'
import * as schema from '../src/lib/db/schema'
import { FULL_SCHEMA_SQL, USER_A, USER_B, type TestDbInstance } from '../src/__tests__/api/setup'
import { UNDERSTANDING_DDL } from '../src/lib/semantic/schema-sql'

let instance: TestDbInstance
let root = ''
let origin = ''
let server: Server
let killedWorker: ChildProcess | undefined
let nativeModel: NativeModelProcessor | undefined
let activeRunner: ReturnType<typeof createMacRunner> | undefined
const rehearsalAbort = new AbortController()
const viewer = USER_A
const report: Record<string, unknown> = {}
const processingTrace: Array<Record<string, unknown>> = []
const workerLogs: string[] = []
report.processingTrace = processingTrace
report.workerLogs = workerLogs
const token = 'p'.repeat(43)
const vector = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0))
const exec = promisify(execFile)
const count = Number(process.env['ADHX_LOAD_POSTS'] || 10_000)

// Only infrastructure boundaries are replaced: authentication is fixture-only,
// the real route handlers/SQL/scheduler/runner/media functions remain intact.
vi.mock('@/lib/db', () => ({
  get db() {
    return instance.db
  },
  get rawDb() {
    return instance.sqlite
  },
  runInTransaction: <T>(fn: () => T): T => instance.sqlite.transaction(fn)(),
}))
vi.mock('@/lib/auth/session', () => ({ getCurrentUserId: async () => viewer }))
vi.mock('@/lib/sentry', () => ({
  metrics: new Proxy({}, { get: () => () => {} }),
  captureException() {},
}))
vi.mock('@/lib/semantic/supervisor', () => ({
  wakeJobs() {},
  jobActivity: () => null,
  startSemanticProcesses() {},
}))
vi.mock('@/lib/keep/worker', async (original) => ({
  ...(await original<typeof import('../src/lib/keep/worker')>()),
  wakeKeep() {},
}))

import { POST as jobs } from '../src/app/api/processing/jobs/route'
import { GET as media } from '../src/app/api/processing/media/route'
import { GET as doing } from '../src/app/api/activity/processing/route'
import { GET as health } from '../src/app/api/health/route'
import {
  createMacRunner,
  convertNativeVideo,
  NativeModelProcessor,
  type MacRunnerConfig,
  type ModelTask,
} from '../src/lib/processing/mac-runner'
import { createVideoPlan, segmentSampleTimes } from '../src/lib/processing/profiles'
import {
  SEMANTIC_MODEL_VERSION,
  SEMANTIC_MODEL_ID,
  SEMANTIC_MODEL_REVISION,
} from '../src/lib/semantic/config'
import { ffmpegPath } from '../src/lib/media/ffmpeg'
import { probeMedia } from '../src/lib/keep/probe'
import sharp from 'sharp'
import { enqueueBackfill } from '../src/lib/semantic/queue'

async function post(body: unknown) {
  const response = await fetch(`${origin}/api/processing/jobs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  return { status: response.status, body: await response.json() }
}
const claim = () =>
  post({
    action: 'claim',
    workerId: 'recovery-check',
    model: SEMANTIC_MODEL_VERSION,
    protocol: 2,
    kinds: ['text'],
  })
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function saveReport() {
  const output =
    process.env['ADHX_LOAD_REPORT_PATH'] ||
    path.join(os.tmpdir(), 'adhx-processing-load-report.json')
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`Processing load report: ${output}\n`)
}

function expectConvertedDuration(actual: number | null, expected: number) {
  expect(actual).not.toBeNull()
  // Match the production integrity check: encoder/AAC packet padding may
  // legitimately add a few milliseconds, while truncation still fails.
  const toleranceMs = Math.max(100, Math.min(500, expected * 0.001))
  expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(toleranceMs)
}

function seed() {
  const db = instance.sqlite
  const bookmark =
    db.prepare(`INSERT INTO bookmarks(id,user_id,platform,author,text,tweet_url,processed_at,is_private)
    VALUES(?,?,'twitter','fixture',?,'https://example.com/fixture',?,?)`)
  const queue =
    db.prepare(`INSERT INTO understanding_queue(platform,post_id,kind,priority,attempts,enqueued_at,next_attempt_at)
    VALUES('twitter',?,'text',?,0,?,?)`)
  const keep = db.prepare(
    `INSERT INTO keep_jobs(platform,post_id,status,updated_at) VALUES('twitter',?,'done',?)`,
  )
  const now = new Date().toISOString()
  const old = new Date(Date.now() - 120 * 60_000).toISOString()
  db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const id = `load-${i.toString().padStart(6, '0')}`
      bookmark.run(id, USER_A, `Useful fixture content ${i}`, now, 0)
      queue.run(id, i ? 100 : 10, i ? now : old, now)
      keep.run(id, old)
    }
    bookmark.run('old-failure', USER_A, 'An old failed download', old, 0)
    db.prepare(
      `INSERT INTO keep_jobs(platform,post_id,status,attempts,last_error,updated_at)
      VALUES('twitter','old-failure','unavailable',6,'Private video',?)`,
    ).run(old)
    bookmark.run('private-failure', USER_B, 'Never visible to viewer', old, 1)
    db.prepare(
      `INSERT INTO keep_jobs(platform,post_id,status,attempts,last_error,updated_at)
      VALUES('twitter','private-failure','unavailable',6,'Private video',?)`,
    ).run(old)
  })()
}

type Timing = { n: number; p50Ms: number; p95Ms: number; maxMs: number }
function timing(values: number[]): Timing {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    n: sorted.length,
    p50Ms: +sorted[Math.floor(sorted.length * 0.5)].toFixed(1),
    p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
    maxMs: +sorted.at(-1)!.toFixed(1),
  }
}
async function responseBurst(samples = 24, active?: () => boolean) {
  const summary: number[] = [],
    details: number[] = [],
    healthy: number[] = []
  await Promise.all(
    Array.from({ length: 3 }, async (_, client) => {
      for (let i = 0; i < samples || active?.(); i++) {
        const route =
          client === 0
            ? '/api/activity/processing?summary=1'
            : client === 1
              ? '/api/activity/processing?scope=needs'
              : '/api/health'
        const start = performance.now()
        const response = await fetch(`${origin}${route}`, { signal: AbortSignal.timeout(5000) })
        expect(response.status).toBe(200)
        const body = await response.json()
        if (client === 0) {
          expect(body.summary.onTheirWay).toBeGreaterThanOrEqual(count - 1)
          expect(body.summary.needsYou).toBe(1)
        }
        if (client === 1) {
          expect(body.items.some((item: { id: string }) => item.id === 'old-failure')).toBe(true)
          expect(body.items.some((item: { id: string }) => item.id === 'private-failure')).toBe(
            false,
          )
        }
        ;(client === 0 ? summary : client === 1 ? details : healthy).push(performance.now() - start)
        if (active) await new Promise((resolve) => setTimeout(resolve, 20))
      }
    }),
  )
  const result = { summary: timing(summary), needsPage: timing(details), health: timing(healthy) }
  // Generous regression guard, not a promised production SLO. This is one
  // event loop, local HTTP and an isolated disk-backed WAL database.
  try {
    expect(result.summary.p95Ms).toBeLessThan(1000)
    expect(result.needsPage.p95Ms).toBeLessThan(1000)
    expect(result.health.maxMs).toBeLessThan(2000)
  } catch (error) {
    report.failedResponseBurst = result
    throw error
  }
  return result
}

async function measureDuring<T>(work: () => Promise<T>) {
  const start = performance.now()
  let active = true
  let workMs = 0
  const result = work().finally(() => {
    workMs = performance.now() - start
    active = false
  })
  const measurements = responseBurst(24, () => active)
  const [value, timings] = await Promise.all([result, measurements])
  return {
    value,
    timings,
    workMs: +workMs.toFixed(1),
    phaseMs: +(performance.now() - start).toFixed(1),
  }
}

beforeAll(async () => {
  if (!Number.isInteger(count) || count < 1000 || count > 100_000)
    throw new Error('ADHX_LOAD_POSTS must be 1000..100000')
  root = await mkdtemp(path.join(os.tmpdir(), 'adhx-isolated-load-'))
  const sqlite = new Database(path.join(root, 'fixture.sqlite'))
  sqlite.pragma('journal_mode=WAL')
  sqlite.pragma('foreign_keys=ON')
  sqlite.exec(FULL_SCHEMA_SQL)
  sqlite.exec(UNDERSTANDING_DDL)
  instance = { sqlite, db: drizzle(sqlite, { schema }), close: () => sqlite.close() }
  instance.db
    .insert(schema.users)
    .values([
      { id: USER_A, username: 'loadviewer' },
      { id: USER_B, username: 'privatefixture' },
    ])
    .run()
  for (const [key, value] of Object.entries({
    PROCESSING_MODE: 'remote',
    SEMANTIC_SEARCH: 'on',
    SEMANTIC_SPEECH: 'off',
    SEMANTIC_SCREEN_TEXT: 'off',
    SEMANTIC_THREADS: '1',
    PROCESSING_WORKER_TOKEN: token,
    INDEXING_LEVEL: 'normal',
    KEEP_MEDIA: 'off',
    KEEP_BACKFILL: 'off',
    MEDIA_DIR: path.join(root, 'retained'),
    DATABASE_PATH: path.join(root, 'fixture.sqlite'),
  }))
    vi.stubEnv(key, value)
  await mkdir(path.join(root, 'retained'))
  server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const request = new NextRequest(`${origin}${req.url}`, {
        method: req.method,
        headers: new Headers(req.headers as Record<string, string>),
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      })
      const route = new URL(request.url).pathname
      const action =
        route === '/api/processing/jobs' && chunks.length
          ? (JSON.parse(Buffer.concat(chunks).toString()) as {
              action: string
              code?: string
              error?: string
            })
          : null
      const response =
        route === '/api/processing/jobs'
          ? await jobs(request)
          : route === '/api/processing/media'
            ? await media(request)
            : route === '/api/activity/processing'
              ? await doing(request)
              : await health()
      if (action) {
        const trace: Record<string, unknown> = { action: action.action, status: response.status }
        if (action.action === 'claim') {
          const payload = (await response.clone().json()) as {
            job?: { id: string; kind: string } | null
          }
          trace.kind = payload.job?.kind ?? null
          if (payload.job)
            trace.post = (
              instance.sqlite
                .prepare('SELECT post_id FROM processing_leases WHERE id=?')
                .get(payload.job.id) as { post_id: string } | undefined
            )?.post_id
        }
        if (action.action === 'fail') {
          trace.code = action.code
          trace.error = action.error
        }
        processingTrace.push(trace)
      }
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      res.writeHead(500).end(String(error))
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No fixture server address')
  origin = `http://127.0.0.1:${address.port}`
  seed()
  report.environment = {
    date: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpus: os.availableParallelism(),
    totalMemoryGiB: +(os.totalmem() / 1024 ** 3).toFixed(1),
    fixturePosts: count,
    sqlite: instance.sqlite.prepare('select sqlite_version() as version').get(),
    transport: 'local HTTP to actual route handlers, fixture session auth, disk-backed SQLite WAL',
    inference:
      'synthetic queue vectors except optional realTextInference/realFinalSegmentInference measurements below',
  }
})

afterAll(async () => {
  rehearsalAbort.abort()
  activeRunner?.close()
  nativeModel?.close()
  killedWorker?.kill('SIGKILL')
  server?.closeAllConnections()
  if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
  if (instance) instance.close()
  vi.unstubAllEnvs()
  if (root) await rm(root, { recursive: true, force: true })
  report.fixtureRemoved = true
  // Preserve diagnostics even when a coverage/latency assertion fails before
  // the happy-path save. No tokens, local source paths or personal data appear.
  await saveReport()
})

it('keeps a large queue responsive, recovers a killed runner, bounds scratch and learns through a long video ending', async () => {
  report.baseline = await responseBurst()
  const worker = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/verify-processing-load-worker.ts',
      origin,
      path.join(root, 'fixture.sqlite'),
      path.join(root, 'killed-worker'),
    ],
    {
      cwd: process.cwd(),
      env: { NODE_ENV: 'test', PATH: process.env.PATH, HOME: os.homedir(), TMPDIR: os.tmpdir() },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  killedWorker = worker
  let workerOutput = ''
  const started = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Disposable worker did not start: ${workerOutput}`)),
      30_000,
    )
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    worker.stdout!.on('data', (chunk) => {
      workerOutput += String(chunk)
      if (workerOutput.includes('MODEL_STARTED')) done()
    })
    worker.stderr!.on('data', (chunk) => {
      workerOutput += String(chunk)
    })
    worker.once('exit', () => {
      if (!workerOutput.includes('MODEL_STARTED')) {
        clearTimeout(timer)
        reject(new Error(`Disposable worker exited: ${workerOutput}`))
      }
    })
  })
  await started
  const originalReceipt = JSON.parse(
    workerOutput
      .split('\n')
      .find((line) => line.startsWith('CLAIM '))!
      .slice(6),
  ) as { id: string; lease: string }
  const first = instance.sqlite
    .prepare("SELECT id,post_id FROM processing_leases WHERE worker_id='disposable-kill-test'")
    .get() as { id: string; post_id: string }
  expect(first.post_id).toBe('load-000000') // 120-minute backfill outranks new urgent work.
  const exited = once(worker, 'exit')
  worker.kill('SIGKILL')
  const [, signal] = await exited
  expect(signal).toBe('SIGKILL')
  killedWorker = undefined
  expect(
    instance.sqlite.prepare('SELECT 1 FROM processing_leases WHERE id=?').get(first.id),
  ).toBeDefined()
  // Advance only the fixture's lease deadline: equivalent to the production
  // 120-second expiry without idling the test, not a real-time timeout claim.
  instance.sqlite
    .prepare('UPDATE processing_leases SET expires_at=? WHERE id=?')
    .run(Date.now() - 1, first.id)
  const reclaimed = await claim()
  expect(reclaimed.status).toBe(200)
  expect(reclaimed.body.job.id).not.toBe(first.id)
  const owner = instance.sqlite
    .prepare('SELECT post_id FROM processing_leases WHERE id=?')
    .get(reclaimed.body.job.id) as { post_id: string }
  expect(owner.post_id).toBe(first.post_id)
  expect((await post({ action: 'complete', ...originalReceipt, vector })).status).toBe(409)
  expect(
    (
      await post({
        action: 'complete',
        id: reclaimed.body.job.id,
        lease: reclaimed.body.job.lease,
        vector,
      })
    ).status,
  ).toBe(200)
  expect(
    instance.sqlite
      .prepare("SELECT 1 FROM understanding_queue WHERE post_id='load-000000' AND kind='text'")
      .get(),
  ).toBeUndefined()
  report.terminationRecovery = {
    signal,
    oldBackfillSelected: true,
    freshLease: true,
    oldLeaseRejected: true,
    checkpointCompleted: true,
    expiry: 'fixture deadline moved past the real 120-second lease; no wall-clock timeout claim',
  }

  // Keep the full backlog visible, but make only the video due for worker claims.
  instance.sqlite
    .prepare('UPDATE understanding_queue SET next_attempt_at=?')
    .run(new Date(Date.now() + 86_400_000).toISOString())
  const modelCache = process.env['ADHX_VERIFY_MODEL_CACHE']
  if (modelCache) {
    const pinned = path.join(modelCache, SEMANTIC_MODEL_ID, SEMANTIC_MODEL_REVISION)
    const required = [
      'config.json',
      'preprocessor_config.json',
      'processor_config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'chat_template.jinja',
      'onnx/model_q4.onnx',
      'onnx/model_q4.onnx_data',
      'onnx/vision_encoder_quantized.onnx',
      'onnx/vision_encoder_quantized.onnx_data',
    ]
    for (const file of required)
      expect((await stat(path.join(pinned, file))).size).toBeGreaterThan(0)
    const isolatedCache = path.join(root, 'isolated-models')
    const isolatedRevision = path.join(isolatedCache, SEMANTIC_MODEL_ID, SEMANTIC_MODEL_REVISION)
    await mkdir(path.dirname(isolatedRevision), { recursive: true })
    if (process.platform === 'darwin') await exec('/bin/cp', ['-c', '-R', pinned, isolatedRevision])
    else await cp(pinned, isolatedRevision, { recursive: true, dereference: true })
    vi.stubEnv('SEMANTIC_CACHE_DIR', isolatedCache)
    vi.stubEnv('SEMANTIC_DEVICE', 'cpu')
    nativeModel = new NativeModelProcessor()
    const inference = await measureDuring(() =>
      nativeModel!.run(
        {
          kind: 'text',
          text: 'A blue ending to an eight-minute film about learning from saved videos.',
        },
        AbortSignal.any([rehearsalAbort.signal, AbortSignal.timeout(120_000)]),
      ),
    )
    expect(inference.value).toHaveLength(768)
    expect(inference.value.every(Number.isFinite)).toBe(true)
    expect(Math.hypot(...inference.value)).toBeCloseTo(1, 3)
    report.realTextInference = {
      milliseconds: inference.workMs,
      combinedLoadPhaseMs: inference.phaseMs,
      dimensions: inference.value.length,
      finiteNormalized: true,
      device: 'native CPU',
      threads: 1,
      cache: 'isolated clone of existing pinned model; no downloads',
      model: SEMANTIC_MODEL_VERSION,
      routeTimings: inference.timings,
    }
  }
  const binary = await ffmpegPath()
  report.ffmpeg = (await exec(binary, ['-version'])).stdout.split('\n')[0]
  const original = path.join(root, 'retained', 'long-video.mp4')
  const duration = 480
  const phase = performance.now()
  // Eight minutes at one frame/second, blue only in the final minute. This
  // proves ending coverage with cheap deterministic data, not 1080p throughput.
  await exec(
    binary,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-filter_threads',
      '1',
      '-f',
      'lavfi',
      '-i',
      `color=red:size=320x180:rate=1:duration=${duration - 60}`,
      '-f',
      'lavfi',
      '-i',
      'color=blue:size=320x180:rate=1:duration=60',
      '-filter_complex_threads',
      '1',
      '-filter_complex',
      '[0:v][1:v]concat=n=2:v=1:a=0[out]',
      '-map',
      '[out]',
      '-c:v',
      'mpeg4',
      '-q:v',
      '4',
      '-threads',
      '1',
      original,
    ],
    { timeout: 60_000 },
  )
  const bytes = (await stat(original)).size
  const originalHash = sha(await readFile(original))
  instance.db
    .insert(schema.bookmarks)
    .values({
      id: 'long-video',
      userId: USER_A,
      author: 'fixture',
      text: 'Eight-minute fixture with a blue ending',
      tweetUrl: 'https://example.com/video',
      processedAt: new Date().toISOString(),
    })
    .run()
  instance.db
    .insert(schema.bookmarkMedia)
    .values({
      id: 'long-video-media',
      userId: USER_A,
      platform: 'twitter',
      bookmarkId: 'long-video',
      mediaType: 'video',
      originalUrl: 'https://video.twimg.com/fixture.mp4',
      previewUrl: 'https://pbs.twimg.com/fixture.jpg',
    })
    .run()
  instance.db
    .insert(schema.keptFiles)
    .values({
      platform: 'twitter',
      postId: 'long-video',
      slot: 'video-1',
      path: 'long-video.mp4',
      mime: 'video/mp4',
      bytes,
      durationMs: duration * 1000,
      createdAt: new Date().toISOString(),
    })
    .run()
  instance.db
    .insert(schema.understandingQueue)
    .values({
      platform: 'twitter',
      postId: 'long-video',
      kind: 'video',
      priority: 100,
      attempts: 0,
      enqueuedAt: new Date().toISOString(),
      nextAttemptAt: new Date().toISOString(),
    })
    .run()
  const cacheDir = path.join(root, 'media-cache')
  const config: MacRunnerConfig = {
    serverUrl: origin,
    token,
    workerId: 'load-video',
    cacheDir,
    maxFileBytes: 8 * 1024 ** 2,
    maxCacheBytes: bytes + 64 * 1024 ** 2 - 1,
    pollMs: 1000,
  }
  let frames = 0,
    endingFrames = 0
  let completedSegments = 0
  const processor = {
    async run(task: ModelTask) {
      for (const file of task.kind === 'video' ? task.files : []) {
        const { data } = await sharp(file)
          .resize(1, 1)
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })
        frames++
        if (data[2] > data[0] + 50) endingFrames++
      }
      if (task.kind === 'video') completedSegments++
      if (nativeModel && task.kind === 'video' && completedSegments === plan.segments) {
        const started = performance.now()
        const inferred = await nativeModel.run(
          task,
          AbortSignal.any([rehearsalAbort.signal, AbortSignal.timeout(180_000)]),
        )
        expect(inferred).toHaveLength(768)
        expect(inferred.every(Number.isFinite)).toBe(true)
        expect(Math.hypot(...inferred)).toBeCloseTo(1, 3)
        report.realFinalSegmentInference = {
          milliseconds: +(performance.now() - started).toFixed(1),
          dimensions: inferred.length,
          finiteNormalized: true,
          frames: task.files.length,
          seconds: task.duration,
          device: 'native CPU',
          threads: 1,
        }
        return inferred
      }
      return vector
    },
    close() {},
  }
  const low = createMacRunner(config, { processor, log() {} })
  expect(await low.runOnce()).toBe(true)
  low.close()
  const deferred = instance.sqlite
    .prepare(
      "SELECT attempts,last_error FROM understanding_queue WHERE post_id='long-video' AND kind='video'",
    )
    .get() as { attempts: number; last_error: string }
  expect(deferred.attempts).toBe(1)
  expect(deferred.last_error).toContain('scratch cache budget is too small')
  expect(frames).toBe(0)
  expect(sha(await readFile(original))).toBe(originalHash)
  instance.sqlite
    .prepare("UPDATE understanding_queue SET next_attempt_at=? WHERE post_id='long-video'")
    .run(new Date().toISOString())
  // A killed process leaves partial/scratch entries. Old private scratch is
  // swept by the next actual runner, while model directories stay untouched.
  const orphan = path.join(cacheDir, 'frames-abandoned')
  await mkdir(orphan)
  await writeFile(path.join(orphan, 'partial.jpg'), 'abandoned-frame')
  const oldTime = new Date(Date.now() - 2 * 60 * 60_000)
  await utimes(orphan, oldTime, oldTime)
  const models = path.join(cacheDir, 'models')
  await mkdir(models)
  await writeFile(path.join(models, 'sentinel'), 'not media scratch')
  const runner = createMacRunner(
    { ...config, maxCacheBytes: 128 * 1024 ** 2 },
    {
      processor,
      log(message) {
        workerLogs.push(message)
      },
    },
  )
  activeRunner = runner
  const plan = createVideoPlan(duration, 'normal')
  let claimCalls = 0
  let seededBackfill = false
  const videoCheckpoint = () =>
    (
      instance.sqlite
        .prepare(
          "SELECT next_segment FROM video_index_state WHERE post_id='long-video' AND platform='twitter'",
        )
        .get() as { next_segment: number } | undefined
    )?.next_segment ?? 0
  const sampling = await measureDuring(async () => {
    while (videoCheckpoint() < plan.segments) {
      expect(
        ++claimCalls,
        'Video checkpoints must finish without unbounded claims/retries',
      ).toBeLessThanOrEqual(plan.segments + 8)
      expect(await runner.runOnce()).toBe(true)
      const retry = instance.sqlite
        .prepare(
          "SELECT attempts,last_error FROM understanding_queue WHERE post_id='long-video' AND kind='video'",
        )
        .get() as { attempts: number; last_error: string | null } | undefined
      expect(
        retry?.attempts ?? 1,
        `Unexpected video deferral: ${retry?.last_error ?? workerLogs.at(-1)}`,
      ).toBe(1)
      if (!seededBackfill && videoCheckpoint() >= 1) {
        // Slow machines cross the periodic backfill interval mid-video. Force
        // the same real path everywhere: text may correctly preempt a demoted
        // video checkpoint. One worker claim is not necessarily one segment.
        await enqueueBackfill()
        seededBackfill = true
      }
    }
  })
  report.duringFrameSamplingAndFinalInference = sampling.timings
  runner.close()
  expect(
    processingTrace.some(
      (entry) => entry.action === 'claim' && entry.kind === 'text' && entry.post === 'long-video',
    ),
  ).toBe(true)
  expect(frames).toBe(plan.segments * plan.framesPerSegment)
  expect(endingFrames).toBeGreaterThanOrEqual(plan.framesPerSegment)
  expect(
    instance.sqlite
      .prepare("SELECT 1 FROM understanding_queue WHERE post_id='long-video' AND kind='video'")
      .get(),
  ).toBeUndefined()
  const remaining = await readdir(cacheDir)
  expect(remaining).toEqual(['models'])
  expect(await readFile(path.join(models, 'sentinel'), 'utf8')).toBe('not media scratch')
  expect(sha(await readFile(original))).toBe(originalHash)
  report.longVideo = {
    durationSeconds: duration,
    width: 320,
    height: 180,
    sourceFps: 1,
    profile: 'normal',
    segments: plan.segments,
    frames,
    endingFrames,
    finalSampleSeconds: segmentSampleTimes(plan, plan.segments - 1).at(-1),
    processingAndFixtureMs: +(performance.now() - phase).toFixed(1),
    originalPreserved: true,
    cacheAfterAcknowledgement: remaining,
    abandonedScratchRemoved: true,
    modelDirectoryPreserved: true,
    scratchBudgetRejectionRetryable: true,
    claimCalls,
    backfillInterleavingExercised: processingTrace.some(
      (entry) => entry.action === 'claim' && entry.kind === 'text' && entry.post === 'long-video',
    ),
  }

  nativeModel?.close()
  nativeModel = undefined
  const conversion = await measureDuring(() =>
    convertNativeVideo(
      original,
      { width: 320, height: 180, duration, hasAudio: false },
      rehearsalAbort.signal,
      cacheDir,
      16 * 1024 ** 2,
    ),
  )
  const converted = conversion.value
  const convertedProbe = await probeMedia(converted.file)
  expect(convertedProbe.videoCodec).toBe('h264')
  expectConvertedDuration(convertedProbe.durationMs, duration * 1000)
  report.duringConversion = conversion.timings
  report.conversion = {
    milliseconds: conversion.workMs,
    combinedLoadPhaseMs: conversion.phaseMs,
    probe: convertedProbe,
    bytes: (await stat(converted.file)).size,
    originalPreserved: sha(await readFile(original)) === originalHash,
  }
  await converted.cleanup()
  expect(await readdir(cacheDir)).toEqual(['models'])
  report.peakTestProcessRssMiB = +(process.resourceUsage().maxRSS / 1024).toFixed(1)
  report.limits = [
    'Synthetic 320×180/1fps source is a coverage/recovery fixture, not a 1080p throughput benchmark.',
    modelCache
      ? 'Text and the final 15-frame video segment use real pinned Gemma inference; preceding segments use synthetic vectors, so this is not whole-video model throughput.'
      : 'Constant vectors exercise real queue completion but do not measure Gemma inference; set ADHX_VERIFY_MODEL_CACHE for isolated real text and final-segment inference.',
    'Actual route handlers are served by a tiny fixture HTTP adapter; authentication is fixture-only. No Next rendering, remote/Tailscale latency or physical phone behavior is measured.',
    'No live databases, workers or retained media are opened or changed. Optional source model files are only read to create an isolated temporary clone.',
  ]
  await saveReport()
})

it('converts a realistic 1080p moving video with audio while the large queue remains responsive', async () => {
  const binary = await ffmpegPath()
  const source = path.join(root, 'retained', 'moving-1080p.mp4')
  const cacheDir = path.join(root, 'realistic-conversion-cache')
  const duration = 60
  const generationStart = performance.now()
  await exec(
    binary,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-filter_threads',
      '1',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=1920x1080:rate=24:duration=${duration}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:sample_rate=48000:duration=${duration}`,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c:v',
      'mpeg4',
      '-b:v',
      '4M',
      '-maxrate',
      '4M',
      '-bufsize',
      '8M',
      '-threads',
      '1',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      '-t',
      String(duration),
      '-fs',
      String(96 * 1024 ** 2),
      source,
    ],
    { timeout: 180_000, signal: rehearsalAbort.signal },
  )
  const sourceGenerationMs = +(performance.now() - generationStart).toFixed(1)
  const sourceProbe = await probeMedia(source)
  expect(sourceProbe).toMatchObject({
    width: 1920,
    height: 1080,
    durationMs: duration * 1000,
    hasVideo: true,
    hasAudio: true,
  })
  const sourceBytes = (await stat(source)).size
  expect(sourceBytes).toBeLessThanOrEqual(96 * 1024 ** 2)
  const originalHash = sha(await readFile(source))
  let converted: Awaited<ReturnType<typeof convertNativeVideo>> | undefined
  try {
    const measured = await measureDuring(async () => {
      converted = await convertNativeVideo(
        source,
        { width: 1920, height: 1080, duration, hasAudio: true },
        rehearsalAbort.signal,
        cacheDir,
        256 * 1024 ** 2,
      )
      return converted
    })
    const outputProbe = await probeMedia(measured.value.file)
    expect(outputProbe).toMatchObject({
      videoCodec: 'h264',
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      width: 1920,
      height: 1080,
      hasVideo: true,
      hasAudio: true,
    })
    expectConvertedDuration(outputProbe.durationMs, duration * 1000)
    expect(sha(await readFile(source))).toBe(originalHash)
    report.realistic1080pConversion = {
      source: {
        width: 1920,
        height: 1080,
        fps: 24,
        seconds: duration,
        videoCodec: sourceProbe.videoCodec,
        audioCodec: sourceProbe.audioCodec,
        audioChannels: 2,
        bytes: sourceBytes,
        generationMs: sourceGenerationMs,
        encodingThreads: 1,
        fixture: 'moving testsrc2 pattern with stereo 48kHz sine audio',
      },
      conversionMs: measured.workMs,
      combinedLoadPhaseMs: measured.phaseMs,
      output: { ...outputProbe, bytes: (await stat(measured.value.file)).size },
      routeTimings: measured.timings,
      originalPreserved: true,
      limits: [
        'Synthetic 1080p moving pattern and audio exercise realistic resolution/frame rate, not camera footage or a representative social-media codec mix.',
        'This invokes the actual native converter while route handlers serve the queue; it does not upload a production conversion or measure a remote NAS network.',
      ],
    }
  } finally {
    await converted?.cleanup()
  }
  expect(await readdir(cacheDir)).toEqual([])
  await saveReport()
})
