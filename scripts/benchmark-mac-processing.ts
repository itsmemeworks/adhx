/** Isolated synthetic benchmark. Never loads a worker env file or contacts a server. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile, fork } from 'node:child_process'
import { mkdir, mkdtemp, rm, statfs, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { SEMANTIC_MODEL_ID, SEMANTIC_MODEL_REVISION } from '../src/lib/semantic/config'

const exec = promisify(execFile)
const gib = 1024 ** 3
type Variant = { device: 'cpu' | 'coreml'; memory: 'standard' | 'compact' }
type Result = Record<string, unknown> & { vectors?: number[][] }

async function child() {
  os.setPriority(10)
  const root = process.env['ADHX_BENCH_ROOT']!
  const tf = await import('@huggingface/transformers')
  tf.env.allowRemoteModels = false
  const { embedTexts, embedVideoFrames } = await import('../src/lib/semantic/model')
  const vectors: number[][] = []
  const times: Record<string, number> = {}
  const run = async (name: string, work: () => Promise<Float32Array>) => {
    const start = performance.now()
    const vector = await work()
    assert.equal(vector.length, 768)
    assert([...vector].every(Number.isFinite))
    assert(Math.abs(Math.hypot(...vector) - 1) < 0.001)
    vectors.push(Array.from(vector))
    times[name] = performance.now() - start
    process.send?.({ phase: name, milliseconds: times[name], rss: process.memoryUsage().rss })
  }
  await run(
    'coldText',
    async () => (await embedTexts(['task: search result | query: a blue square']))[0],
  )
  const frames = Array.from({ length: 15 }, (_, i) => path.join(root, 'frames', `${i + 1}.jpg`))
  for (let i = 0; i < 3; i++) await run(`video${i}`, () => embedVideoFrames(frames, 60, 4))
  const adaptive: Record<string, unknown>[] = []
  const prefetch: Record<string, unknown>[] = []
  if (process.env['ADHX_BENCH_PREFETCH'] === '1') {
    const { sampleBatchedFrames } = await import('./experiments/batched-frames')
    const { createVideoPlan } = await import('../src/lib/processing/profiles')
    const plan = createVideoPlan(60, 'normal')
    for (const ahead of [false, true]) {
      const started = performance.now()
      const prepare = () =>
        sampleBatchedFrames(
          path.join(root, 'pipeline.mp4'),
          plan,
          0,
          AbortSignal.timeout(60_000),
          root,
          process.env['FFMPEG_PATH']!,
        )
      let current = await prepare()
      let pending: ReturnType<typeof prepare> | undefined
      try {
        if (ahead) {
          pending = prepare()
          // Install a rejection handler immediately while native inference runs.
          void pending.catch(() => undefined)
        }
        await run(`pipeline-${ahead}-0`, () => embedVideoFrames(current.files, 60, 4))
        await current.cleanup()
        current = await (pending || prepare())
        pending = undefined
        await run(`pipeline-${ahead}-1`, () => embedVideoFrames(current.files, 60, 4))
        prefetch.push({ ahead, milliseconds: performance.now() - started })
      } finally {
        await current.cleanup()
        if (pending)
          await pending.then(
            (sample) => sample.cleanup(),
            () => undefined,
          )
      }
    }
  }
  if (process.env['ADHX_BENCH_ADAPTIVE'] === '1') {
    const { default: sharp } = await import('sharp')
    const { representativeFrames } = await import('./experiments/representative-frames')
    const sceneFiles = Array.from({ length: 15 }, (_, i) =>
      path.join(root, 'frames', `${['red', 'green', 'blue'][Math.floor(i / 5)]}.jpg`),
    )
    for (const [name, inputs] of [
      ['static', Array<string>(15).fill(frames[0])],
      ['scenes', sceneFiles],
      ['motion', frames],
    ] as const) {
      const signatures = await Promise.all(
        inputs.map((file) =>
          sharp(file).resize(8, 8, { fit: 'fill' }).removeAlpha().raw().toBuffer(),
        ),
      )
      const selected = representativeFrames(signatures)
      const startIndex = vectors.length
      await run(`${name}Full`, () => embedVideoFrames(inputs, 60, 4))
      await run(`${name}Adaptive`, () =>
        embedVideoFrames(
          selected.map((i) => inputs[i]),
          60,
          4,
          selected.map((i) => i * 4),
        ),
      )
      adaptive.push({
        fixture: name,
        inputFrames: 15,
        keptFrames: selected.length,
        selected,
        cosineToFull: vectors[startIndex].reduce(
          (sum, x, i) => sum + x * vectors[startIndex + 1][i],
          0,
        ),
      })
    }
  }
  process.send?.(
    {
      result: {
        times,
        vectors,
        vectorHashes: vectors.map((vector) =>
          createHash('sha256')
            .update(Buffer.from(new Float32Array(vector).buffer))
            .digest('hex'),
        ),
        adaptive,
        prefetch,
        rss: process.memoryUsage().rss,
        maxRss: process.resourceUsage().maxRSS * 1024,
      },
    },
    () => process.exit(0),
  )
}

function bytes(value: string, unit: string) {
  return Number(value) * ({ K: 1024, M: 1024 ** 2, G: gib }[unit] || 1)
}

async function main() {
  assert.equal(process.platform, 'darwin', 'This benchmark measures the native Mac runtime')
  const source = process.env['ADHX_VERIFY_MODEL_CACHE']
  assert(
    source && path.isAbsolute(source),
    'Set ADHX_VERIFY_MODEL_CACHE to an existing pinned cache',
  )
  const output =
    process.env['ADHX_BENCH_REPORT'] || path.join(os.tmpdir(), 'adhx-mac-benchmark.json')
  const report: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    model: `${SEMANTIC_MODEL_ID}@${SEMANTIC_MODEL_REVISION}`,
    fixture: '15 synthetic motion frames, 60-second video section; three repeated runs',
  }
  const defaults: Variant[] = [
    { device: 'cpu', memory: 'standard' },
    { device: 'cpu', memory: 'compact' },
    { device: 'coreml', memory: 'compact' },
  ]
  const order = process.env['ADHX_BENCH_ORDER']?.split(',')
  const variants = order
    ? order.map((value) => {
        const found = defaults.find((v) => `${v.device}-${v.memory}` === value)
        assert(found, 'Unknown benchmark variant')
        return found
      })
    : defaults
  const root = await mkdtemp(path.join(os.tmpdir(), 'adhx-mac-benchmark-'))
  const results: Result[] = []
  report.results = results
  let active: ReturnType<typeof fork> | undefined
  let interrupted = false
  const stop = () => {
    interrupted = true
    active?.kill('SIGKILL')
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
  try {
    const disk = await statfs(root)
    assert(disk.bavail * disk.bsize > 3 * gib, 'At least 3 GiB free disk required')
    const cache = path.join(root, 'models')
    const modelSource = path.join(source, SEMANTIC_MODEL_ID, SEMANTIC_MODEL_REVISION)
    const modelTarget = path.join(cache, SEMANTIC_MODEL_ID, SEMANTIC_MODEL_REVISION)
    await mkdir(path.dirname(modelTarget), { recursive: true })
    await exec('/bin/cp', ['-cR', modelSource, modelTarget], { timeout: 30_000 })
    await mkdir(path.join(root, 'frames'))
    const binary = process.env['FFMPEG_PATH']
    assert(binary && path.isAbsolute(binary), 'Set the absolute maintained FFMPEG_PATH')
    await exec(
      binary,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-threads',
        '1',
        '-filter_threads',
        '1',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=448x280:rate=1',
        '-frames:v',
        '15',
        '-threads',
        '1',
        path.join(root, 'frames', '%d.jpg'),
      ],
      { timeout: 30_000 },
    )
    const { default: sharp } = await import('sharp')
    for (const colour of ['red', 'green', 'blue'])
      await sharp({ create: { width: 448, height: 280, channels: 3, background: colour } })
        .jpeg()
        .toFile(path.join(root, 'frames', `${colour}.jpg`))
    if (process.env['ADHX_BENCH_PREFETCH'] === '1')
      await exec(
        binary,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=1920x1080:rate=24',
          '-t',
          '60',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-threads',
          '1',
          '-pix_fmt',
          'yuv420p',
          path.join(root, 'pipeline.mp4'),
        ],
        { timeout: 120_000, maxBuffer: 64 * 1024 },
      )
    for (const variant of variants) {
      if (interrupted) break
      const result: Result = { ...variant, phases: [], peakRss: 0, peakFootprint: 0 }
      results.push(result)
      const sandbox = path.join(root, `${variant.device}-${variant.memory}`)
      await mkdir(sandbox)
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        PATH: process.env['PATH'],
        HOME: sandbox,
        TMPDIR: `${sandbox}/`,
        ADHX_BENCH_CHILD: '1',
        ADHX_BENCH_ROOT: root,
        ADHX_BENCH_ADAPTIVE: process.env['ADHX_BENCH_ADAPTIVE'] || '0',
        ADHX_BENCH_PREFETCH: process.env['ADHX_BENCH_PREFETCH'] || '0',
        FFMPEG_PATH: binary,
        SEMANTIC_CACHE_DIR: cache,
        SEMANTIC_THREADS: '2',
        SEMANTIC_MEMORY_PROFILE: variant.memory,
        SEMANTIC_DEVICE: variant.device,
      }
      active = fork(fileURLToPath(import.meta.url), [], {
        execArgv: ['--import', 'tsx'],
        env,
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      })
      const running = active
      let stderr = '',
        sampling = false
      running.stderr?.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-16_000)
      })
      running.on('message', (message: { result?: Result; phase?: string; rss?: number }) => {
        result.peakRss = Math.max(Number(result.peakRss), Number(message.rss || 0))
        if (message.result) Object.assign(result, message.result)
        else (result.phases as unknown[]).push(message)
        process.stdout.write(
          `${JSON.stringify({ variant, ...message, result: message.result ? 'completed' : undefined })}\n`,
        )
      })
      const sample = async () => {
        if (!running.pid || sampling) return
        sampling = true
        try {
          const pressure = Number(
            (
              await exec('/usr/sbin/sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], {
                timeout: 2000,
              })
            ).stdout.trim(),
          )
          result.peakPressure = Math.max(Number(result.peakPressure || 0), pressure)
          if (pressure >= 4) {
            result.stopped = 'Critical host memory pressure'
            interrupted = true
            running.kill('SIGKILL')
            return
          }
          const vm = (
            await exec('/usr/bin/vmmap', ['-summary', String(running.pid)], { timeout: 5000 })
          ).stdout
          const match = vm.match(/Physical footprint:\s+([\d.]+)([KMG]?)/)
          if (match)
            result.peakFootprint = Math.max(Number(result.peakFootprint), bytes(match[1], match[2]))
          if (Number(result.peakFootprint) > 3.75 * gib) {
            result.stopped = 'Memory safety limit reached'
            interrupted = true
            running.kill('SIGKILL')
          }
        } catch {
          /* A process may finish between samples. */
        } finally {
          sampling = false
        }
      }
      const timer = setInterval(() => void sample(), 3000)
      const deadline = setTimeout(() => {
        result.stopped = 'Three-minute experiment deadline'
        running.kill('SIGKILL')
      }, 180_000)
      const status = await new Promise<{ code: number | null; signal: string | null }>(
        (resolve, reject) => {
          running.once('exit', (code, signal) => resolve({ code, signal }))
          running.once('error', reject)
        },
      ).finally(() => {
        clearInterval(timer)
        clearTimeout(deadline)
      })
      active = undefined
      Object.assign(result, status, { cpuFallback: stderr.includes('using native CPU'), stderr })
      await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
    }
    const baseline = results.find((r) => r.device === 'cpu' && r.memory === 'standard')?.vectors
    for (const result of results) {
      const vectors = result.vectors
      if (baseline && vectors)
        result.cosineToBaseline = vectors.map((v, i) =>
          v.reduce((sum, x, j) => sum + x * baseline[i][j], 0),
        )
      delete result.vectors
    }
    report.interrupted = interrupted
    if (interrupted || results.some((result) => result.code !== 0)) process.exitCode = 1
  } finally {
    if (active && active.exitCode === null && active.signalCode === null) {
      const exited = new Promise<void>((resolve) => active!.once('exit', () => resolve()))
      active.kill('SIGKILL')
      await exited
    }
    process.off('SIGTERM', stop)
    process.off('SIGINT', stop)
    await rm(root, { recursive: true, force: true })
    report.fixtureRemoved = true
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
    process.stdout.write(`Benchmark report: ${output}\n`)
  }
}

if (process.env['ADHX_BENCH_CHILD'] === '1')
  child().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
else
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
