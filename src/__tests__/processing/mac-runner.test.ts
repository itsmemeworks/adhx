import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readdir, readFile, rm, stat, writeFile, mkdir, utimes } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { ffmpegPath } from '@/lib/media/ffmpeg'
import { probeMedia } from '@/lib/keep/probe'
import {
  createMacRunner,
  runnerConfig,
  sampleNativeFrames,
  convertNativeVideo,
  type MacRunnerConfig,
  type MacProcessor,
  type ModelTask,
} from '@/lib/processing/mac-runner'
import { createVideoPlan, type VideoPlan } from '@/lib/processing/profiles'
import type { ProcessingJob } from '@/lib/processing/protocol'
import {
  SEMANTIC_MODEL_VERSION,
  SEMANTIC_MODEL_ID,
  SEMANTIC_MODEL_REVISION,
} from '@/lib/semantic/config'

const modelMocks = vi.hoisted(() => ({
  create: vi.fn(),
  processor: Object.assign(async () => ({}), {
    video_processor: { frame_processor: { max_soft_tokens: 140 } },
  }),
}))
vi.mock('@huggingface/transformers', () => ({
  env: {},
  AutoConfig: { from_pretrained: async () => ({}) },
  AutoProcessor: { from_pretrained: async () => modelMocks.processor },
  AutoModel: { from_pretrained: modelMocks.create },
  RawImage: {},
  RawVideo: class {},
  RawVideoFrame: class {},
}))

let dir: string
let config: MacRunnerConfig
const vector = Array(768).fill(0.01)
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const textJob = (): ProcessingJob => ({
  id: 'job1',
  lease: 'private-lease',
  model: SEMANTIC_MODEL_VERSION,
  kind: 'text',
  contentHash: 'text-hash',
  profile: 'normal',
  text: 'title: useful | text: saved words',
})
const videoJob = (index: number, lease: string): ProcessingJob => ({
  ...textJob(),
  kind: 'video',
  lease,
  contentHash: 'video-hash',
  media: { path: '/api/files/twitter/video/video-1', mime: 'video/mp4', bytes: 4 },
  video: { plan: createVideoPlan(120, 'normal'), nextSegment: index },
})

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'adhx-worker-test-'))
  config = {
    serverUrl: 'https://adhx.example.com',
    token: 'x'.repeat(40),
    workerId: 'mac-test',
    cacheDir: dir,
    maxFileBytes: 1024,
    maxCacheBytes: 2048,
    pollMs: 1000,
  }
})
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await rm(dir, { recursive: true, force: true })
})

describe('native model initialization', () => {
  const platform = process.platform
  const embedding = async () => ({ sentence_embedding: { tolist: () => [vector] } })
  beforeEach(() => {
    Reflect.deleteProperty(globalThis, '__adhxSemanticModel')
    modelMocks.create.mockReset()
    vi.stubEnv('SEMANTIC_DEVICE', 'coreml')
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  })
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
    Reflect.deleteProperty(globalThis, '__adhxSemanticModel')
  })

  it('preserves the pinned quantization while requesting native CoreML MLProgram', async () => {
    modelMocks.create.mockResolvedValue(embedding)
    const { embedTexts } = await import('@/lib/semantic/model')
    await embedTexts(['a prompt'])
    expect(modelMocks.create.mock.calls[0][1]).toMatchObject({
      device: 'coreml',
      dtype: { model: 'q4', vision_encoder: 'q8' },
      session_options: { executionProviders: [{ name: 'coreml', coreMlFlags: 0x010 }, 'cpu'] },
    })
  })

  it('falls back once when CoreML creation fails and keeps the native CPU model warm', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    modelMocks.create
      .mockRejectedValueOnce(new Error('unsupported quantized operation'))
      .mockResolvedValue(embedding)
    const { embedTexts } = await import('@/lib/semantic/model')
    await embedTexts(['first'])
    await embedTexts(['second'])
    expect(modelMocks.create).toHaveBeenCalledTimes(2)
    expect(modelMocks.create.mock.calls.map((call) => call[1].device)).toEqual(['coreml', 'cpu'])
  })

  it('never requests CoreML on a Linux server even when the environment contains that value', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    modelMocks.create.mockResolvedValue(embedding)
    const { embedTexts } = await import('@/lib/semantic/model')
    await embedTexts(['server query'])
    expect(modelMocks.create.mock.calls[0][1].device).toBe('cpu')
  })

  it('loads a complete pinned cache directly so offline tokenizers never probe main', async () => {
    vi.stubEnv('SEMANTIC_CACHE_DIR', dir)
    vi.stubEnv('SEMANTIC_TEXT_ONLY', '0')
    const source = path.join(dir, SEMANTIC_MODEL_ID, SEMANTIC_MODEL_REVISION)
    await mkdir(path.join(source, 'onnx'), { recursive: true })
    for (const name of [
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
    ]) {
      await writeFile(path.join(source, name), 'cached fixture')
    }
    const tf = await import('@huggingface/transformers')
    const processor = vi.spyOn(tf.AutoProcessor, 'from_pretrained')
    modelMocks.create.mockResolvedValue(embedding)
    const { embedTexts } = await import('@/lib/semantic/model')
    await embedTexts(['offline text'])
    expect(processor).toHaveBeenCalledWith(
      source,
      expect.objectContaining({ local_files_only: true, revision: SEMANTIC_MODEL_REVISION }),
    )
    expect(modelMocks.create.mock.calls[0][0]).toBe(source)
    expect(modelMocks.create.mock.calls[0][1].local_files_only).toBe(true)
  })

  it('keeps every actual model and processor download pinned when the cache is incomplete', async () => {
    vi.stubEnv('SEMANTIC_CACHE_DIR', dir)
    const tf = await import('@huggingface/transformers')
    const configLoad = vi.spyOn(tf.AutoConfig, 'from_pretrained')
    const processorLoad = vi.spyOn(tf.AutoProcessor, 'from_pretrained')
    modelMocks.create.mockResolvedValue(embedding)
    const { embedTexts } = await import('@/lib/semantic/model')
    await embedTexts(['first load'])
    expect(configLoad).toHaveBeenCalledWith(SEMANTIC_MODEL_ID, {
      revision: SEMANTIC_MODEL_REVISION,
    })
    expect(processorLoad).toHaveBeenCalledWith(SEMANTIC_MODEL_ID, {
      revision: SEMANTIC_MODEL_REVISION,
    })
    expect(modelMocks.create.mock.calls[0][0]).toBe(SEMANTIC_MODEL_ID)
    expect(modelMocks.create.mock.calls[0][1].revision).toBe(SEMANTIC_MODEL_REVISION)
  })
})

describe('real native frame extraction', () => {
  it.each([
    { name: 'ordinary video', fps: 10, duration: 4 },
    { name: 'single-frame short clip', fps: 25, duration: 0.04 },
    { name: 'low-FPS video ending', fps: 0.2, duration: 10 },
  ])(
    'samples $name and clears its temporary frames',
    async ({ fps, duration }) => {
      const binary = await ffmpegPath()
      const execute = promisify(execFile)
      const source = path.join(dir, 'synthetic.mp4')
      await execute(
        binary,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          `testsrc2=s=64x36:r=${fps}`,
          '-t',
          String(duration),
          '-c:v',
          'libx264',
          '-threads',
          '1',
          '-pix_fmt',
          'yuv420p',
          source,
        ],
        { timeout: 10_000 },
      )
      const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
      const originalHash = hash(await readFile(source))
      const cache = path.join(dir, 'scratch')
      const plan = createVideoPlan(duration, 'deep')
      const sampled = await sampleNativeFrames(source, plan, 0, new AbortController().signal, cache)
      try {
        expect(sampled.files).toHaveLength(plan.framesPerSegment)
        for (const frame of sampled.files) expect((await stat(frame)).size).toBeGreaterThan(0)
        if (fps === 0.2 || duration === 0.04) {
          const expected = path.join(dir, 'expected-last.jpg')
          await execute(
            binary,
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-threads',
              '1',
              '-i',
              source,
              '-map',
              '0:v:0',
              '-an',
              '-sn',
              '-vf',
              'scale=448:-2',
              '-fps_mode',
              'passthrough',
              '-update',
              '1',
              '-q:v',
              '4',
              expected,
            ],
            { timeout: 10_000 },
          )
          // Final requested timestamps exceed the last frame's PTS; retain the
          // actual final image rather than failing or jumping back to the opening.
          expect(await readFile(sampled.files.at(-1)!)).toEqual(await readFile(expected))
        }
        expect(hash(await readFile(source))).toBe(originalHash)
      } finally {
        await sampled.cleanup()
      }
      expect(await readdir(cache)).toEqual([])
    },
    20_000,
  )

  it.each(['undecodable', 'aborted'])(
    'clears frame scratch after %s extraction',
    async (failure) => {
      const source = path.join(dir, 'source.mp4')
      const original = Buffer.from('not a decodable video')
      await writeFile(source, original)
      const controller = new AbortController()
      if (failure === 'aborted') controller.abort(new Error('Synthetic lease revoked'))
      const cache = path.join(dir, 'scratch')
      await expect(
        sampleNativeFrames(source, createVideoPlan(1, 'deep'), 0, controller.signal, cache),
      ).rejects.toThrow(
        failure === 'aborted' ? 'Synthetic lease revoked' : 'Video frame extraction failed',
      )
      expect(await readdir(cache)).toEqual([])
      expect(await readFile(source)).toEqual(original)
    },
  )
})

describe('native H.264 conversion', () => {
  it('preserves full resolution, audio and duration in a validated H.264 result', async () => {
    const binary = await ffmpegPath(),
      execute = promisify(execFile)
    const source = path.join(dir, 'source.mp4')
    await execute(
      binary,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=s=320x180:r=10',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000',
        '-t',
        '1',
        '-c:v',
        'mpeg4',
        '-threads',
        '1',
        '-c:a',
        'aac',
        source,
      ],
      { timeout: 10_000 },
    )
    const original = await readFile(source)
    const output = await convertNativeVideo(
      source,
      { width: 320, height: 180, duration: 1, hasAudio: true },
      new AbortController().signal,
      dir,
      2 * 1024 ** 2,
    )
    try {
      const actual = await probeMedia(output.file)
      expect(actual).toMatchObject({ width: 320, height: 180, hasAudio: true, videoCodec: 'h264' })
      expect(actual.durationMs).toBeGreaterThanOrEqual(900)
      expect(actual.durationMs).toBeLessThanOrEqual(1100)
      expect(await readFile(source)).toEqual(original)
    } finally {
      await output.cleanup()
    }
    expect(await readdir(dir)).toEqual(['source.mp4'])
  }, 20_000)

  it('cleans rejected conversion output while preserving the source', async () => {
    const binary = await ffmpegPath(),
      execute = promisify(execFile)
    const source = path.join(dir, 'source.mp4')
    await execute(
      binary,
      [
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=320x180:r=10',
        '-t',
        '1',
        '-c:v',
        'mpeg4',
        '-threads',
        '1',
        source,
      ],
      { timeout: 10_000 },
    )
    await expect(
      convertNativeVideo(
        source,
        { width: 320, height: 180, duration: 10, hasAudio: false },
        new AbortController().signal,
        dir,
        2 * 1024 ** 2,
      ),
    ).rejects.toThrow('integrity')
    expect(await readdir(dir)).toEqual(['source.mp4'])
  }, 20_000)
})

describe('native worker configuration', () => {
  it('requires a private machine credential and a secure origin', () => {
    const env = { ADHX_SERVER_URL: 'https://adhx.example.com', ADHX_WORKER_TOKEN: 's'.repeat(32) }
    expect(runnerConfig(env).serverUrl).toBe(env.ADHX_SERVER_URL)
    expect(() => runnerConfig({ ...env, ADHX_WORKER_TOKEN: 'short' })).toThrow()
    for (const url of [
      'http://adhx.example.com',
      'https://name:password@adhx.example.com',
      'https://adhx.example.com/path',
      'https://adhx.example.com?key=s',
    ]) {
      expect(() => runnerConfig({ ...env, ADHX_SERVER_URL: url })).toThrow()
    }
    expect(runnerConfig({ ...env, ADHX_SERVER_URL: 'http://localhost:3001' }).serverUrl).toBe(
      'http://localhost:3001',
    )
    expect(() => runnerConfig({ ...env, ADHX_WORKER_MAX_FILE_BYTES: 'NaN' })).toThrow()
  })
})

describe('native worker protocol and isolation', () => {
  it.each([200, 409, 503])(
    'streams a converted result with authenticated ACK cleanup (status %s)',
    async (status) => {
      const job: ProcessingJob = {
        ...videoJob(0, 'conversion-lease'),
        kind: 'convert',
        conversion: { width: 320, height: 180, duration: 1, hasAudio: true },
      }
      let source = ''
      let uploaded = false
      const transcode = vi.fn(async (file: string) => {
        source = file
        const outputDir = path.join(dir, 'transcode-test')
        await mkdir(outputDir)
        const output = path.join(outputDir, 'output.mp4')
        await writeFile(output, new Uint8Array([5, 6, 7, 8]))
        return { file: output, cleanup: () => rm(outputDir, { recursive: true, force: true }) }
      })
      const request = vi.fn(async (url: unknown, init?: RequestInit) => {
        if (String(url).includes('/media?')) return new Response(new Uint8Array([1, 2, 3, 4]))
        if (String(url).includes('/result?')) {
          expect(init?.method).toBe('PUT')
          expect((init as RequestInit & { duplex: string }).duplex).toBe('half')
          const headers = new Headers(init?.headers)
          expect(headers.get('Authorization')).toBe(`Bearer ${config.token}`)
          expect(headers.get('X-ADHX-Lease')).toBe(job.lease)
          expect(headers.get('Content-Length')).toBe('4')
          expect(headers.get('Content-Type')).toBe('video/mp4')
          expect(String(url)).not.toContain(job.lease)
          expect(Array.from(new Uint8Array(await new Response(init?.body).arrayBuffer()))).toEqual([
            5, 6, 7, 8,
          ])
          // The source cannot be deleted until the server's final ACK is received.
          expect((await stat(source)).size).toBe(4)
          uploaded = true
          return json({ done: status === 200 }, status)
        }
        const body = JSON.parse(String(init?.body))
        return json(body.action === 'claim' ? { job } : {})
      }) as unknown as typeof fetch
      const run = vi.fn(async () => vector)
      const runner = createMacRunner(config, {
        fetch: request,
        transcode,
        processor: { run, close: vi.fn() },
        log: vi.fn(),
      })
      await runner.runOnce()
      expect(uploaded).toBe(true)
      expect(run).not.toHaveBeenCalled()
      expect((await readdir(dir)).some((name) => name.startsWith('transcode-'))).toBe(false)
      if (status === 503) expect((await stat(source)).size).toBe(4)
      else await expect(stat(source)).rejects.toThrow()
      runner.close()
    },
  )
  it('claims and completes text without downloading media or exposing credentials in logs', async () => {
    const actions: Record<string, unknown>[] = []
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${config.token}`)
      expect(init?.redirect).toBe('error')
      expect(init?.signal).toBeDefined()
      const body = JSON.parse(String(init?.body))
      actions.push(body)
      return json(body.action === 'claim' ? { job: textJob() } : {})
    }) as unknown as typeof fetch
    const run = vi.fn(async (_task: ModelTask, _signal: AbortSignal) => vector)
    const log = vi.fn()
    const runner = createMacRunner(config, {
      fetch: request,
      processor: { run, close: vi.fn() },
      log,
    })
    expect(await runner.runOnce()).toBe(true)
    expect(actions.map((a) => a.action)).toEqual(['claim', 'complete'])
    expect(actions[0]).toMatchObject({
      protocol: 2,
      model: SEMANTIC_MODEL_VERSION,
      kinds: ['text', 'image', 'video', 'speech', 'screen'],
    })
    expect(actions[1]).toMatchObject({ id: 'job1', lease: 'private-lease', vector })
    expect(run.mock.calls[0][0]).toMatchObject({ kind: 'text', text: textJob().text })
    expect(JSON.stringify(log.mock.calls)).not.toContain(config.token)
    runner.close()
  })

  it('yields after one video segment, lets an urgent save run, then reuses the cached original', async () => {
    const jobs = [videoJob(0, 'lease-1'), textJob(), videoJob(1, 'lease-2')]
    const actions: Record<string, unknown>[] = []
    let downloads = 0
    const request = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/media?')) {
        downloads++
        expect(String(url)).not.toContain('lease-1')
        expect(new Headers(init?.headers).get('X-ADHX-Lease')).toBe('lease-1')
        return new Response(new Uint8Array([1, 2, 3, 4]))
      }
      const body = JSON.parse(String(init?.body))
      actions.push(body)
      return json(
        body.action === 'claim'
          ? { job: jobs.shift() }
          : { done: body.action === 'segment' && body.index === 1 },
      )
    }) as unknown as typeof fetch
    const run = vi.fn(async () => vector)
    const cleanup = vi.fn(async () => undefined)
    const sample = vi.fn(async (file: string, _plan: VideoPlan, _index: number) => {
      expect(Array.from(await readFile(file))).toEqual([1, 2, 3, 4])
      return { files: ['frame.jpg'], cleanup }
    })
    const runner = createMacRunner(config, {
      fetch: request,
      processor: { run, close: vi.fn() },
      sample,
      log: vi.fn(),
    })
    await runner.runOnce()
    expect(actions.map((a) => a.action)).toEqual(['claim', 'segment'])
    const cache = (await readdir(dir)).find((name) => name.endsWith('.media'))!
    expect((await stat(path.join(dir, cache))).mode & 0o777).toBe(0o600)
    await runner.runOnce()
    await runner.runOnce()
    expect(actions.map((a) => a.action)).toEqual([
      'claim',
      'segment',
      'claim',
      'complete',
      'claim',
      'segment',
    ])
    expect(downloads).toBe(1)
    expect(sample.mock.calls.map((call) => call[2])).toEqual([0, 1])
    expect(cleanup).toHaveBeenCalledTimes(2)
    expect((await stat(dir)).mode & 0o777).toBe(0o700)
    expect(await readdir(dir)).toEqual([])
    runner.close()
  })

  it('asks the server to plan an unindexed video using its probed full duration', async () => {
    const job = videoJob(0, 'lease')
    delete job.video
    const actions: Record<string, unknown>[] = []
    const request = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/media?')) return new Response(new Uint8Array(4))
      const body = JSON.parse(String(init?.body))
      actions.push(body)
      return json(
        body.action === 'claim'
          ? { job }
          : body.action === 'plan'
            ? { video: { plan: createVideoPlan(600, 'normal'), nextSegment: 0 } }
            : {},
      )
    }) as unknown as typeof fetch
    const runner = createMacRunner(config, {
      fetch: request,
      processor: { run: vi.fn(async () => vector), close: vi.fn() },
      probe: vi.fn(async () => 600),
      sample: vi.fn(async () => ({ files: [], cleanup: async () => undefined })),
      log: vi.fn(),
    })
    await runner.runOnce()
    expect(actions.find((a) => a.action === 'plan')).toMatchObject({ duration: 600 })
    expect(actions.at(-1)?.action).toBe('segment')
    runner.close()
  })

  it('deletes a completed image original immediately after the server acknowledges its result', async () => {
    const job = { ...videoJob(0, 'lease'), kind: 'image' as const }
    const request = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/media?')) return new Response(new Uint8Array(4))
      const body = JSON.parse(String(init?.body))
      return json(body.action === 'claim' ? { job } : { done: true })
    }) as unknown as typeof fetch
    const runner = createMacRunner(config, {
      fetch: request,
      processor: { run: vi.fn(async () => vector), close: vi.fn() },
      log: vi.fn(),
    })
    await runner.runOnce()
    expect(await readdir(dir)).toEqual([])
    runner.close()
  })

  it('cleans crash leftovers on startup even when the server has no work, preserving model weights', async () => {
    const original = path.join(dir, `${'a'.repeat(64)}.media`)
    const partial = path.join(dir, `${'b'.repeat(64)}.dead-beef.partial`)
    const frames = path.join(dir, 'frames-orphan')
    const weights = path.join(dir, 'models')
    await writeFile(original, 'old original')
    await writeFile(partial, 'unfinished')
    await mkdir(frames)
    await writeFile(path.join(frames, '0.jpg'), 'temporary frame')
    await mkdir(weights)
    await writeFile(path.join(weights, 'model.onnx'), 'reusable model')
    const yesterday = new Date(Date.now() - 25 * 60 * 60_000)
    for (const file of [original, partial, frames]) await utimes(file, yesterday, yesterday)
    const runner = createMacRunner(config, {
      fetch: vi.fn(async () => json({ job: null })) as unknown as typeof fetch,
      processor: { run: vi.fn(async () => vector), close: vi.fn() },
      log: vi.fn(),
    })
    expect(await runner.runOnce()).toBe(false)
    expect(await readdir(dir)).toEqual(['models'])
    expect(await readFile(path.join(weights, 'model.onnx'), 'utf8')).toBe('reusable model')
    runner.close()
  })

  it('counts recent orphan partials and frame contents against the ceiling before downloading', async () => {
    const partial = path.join(dir, `${'c'.repeat(64)}.dead-beef.partial`)
    const frames = path.join(dir, 'frames-recent')
    const weights = path.join(dir, 'models')
    await writeFile(partial, new Uint8Array(1600))
    await mkdir(frames)
    await writeFile(path.join(frames, '0.jpg'), new Uint8Array(445))
    await mkdir(weights)
    await writeFile(path.join(weights, 'model.onnx'), new Uint8Array(5000))
    await writeFile(path.join(dir, 'notes.txt'), 'unrelated file')
    const job = { ...videoJob(0, 'lease'), kind: 'image' as const }
    let downloaded = false
    const request = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/media?')) {
        // 1600 + 445 + the incoming4 would exceed the 2048-byte test cap.
        // The recent partial must be evicted despite not reaching its TTL.
        await expect(stat(partial)).rejects.toThrow()
        expect(
          (await stat(path.join(frames, '0.jpg'))).size + job.media!.bytes,
        ).toBeLessThanOrEqual(config.maxCacheBytes)
        downloaded = true
        return new Response(new Uint8Array(4))
      }
      const body = JSON.parse(String(init?.body))
      return json(body.action === 'claim' ? { job } : { done: true })
    }) as unknown as typeof fetch
    const runner = createMacRunner(config, {
      fetch: request,
      processor: { run: vi.fn(async () => vector), close: vi.fn() },
      log: vi.fn(),
    })
    await runner.runOnce()
    expect(downloaded).toBe(true)
    expect((await stat(path.join(weights, 'model.onnx'))).size).toBe(5000)
    expect(await readFile(path.join(dir, 'notes.txt'), 'utf8')).toBe('unrelated file')
    expect((await readdir(dir)).sort()).toEqual(['frames-recent', 'models', 'notes.txt'])
    runner.close()
  })

  it('evicts recent orphan frame directories when their contents exceed the scratch ceiling', async () => {
    const frames = path.join(dir, 'frames-overbudget')
    await mkdir(frames)
    await writeFile(path.join(frames, '0.jpg'), new Uint8Array(3000))
    const runner = createMacRunner(config, {
      fetch: vi.fn(async () => json({ job: null })) as unknown as typeof fetch,
      processor: { run: vi.fn(async () => vector), close: vi.fn() },
      log: vi.fn(),
    })
    expect(await runner.runOnce()).toBe(false)
    expect(await readdir(dir)).toEqual([])
    runner.close()
  })

  it('rejects insufficient native frame headroom without deleting the active original', async () => {
    const job = videoJob(0, 'lease')
    const failures: Record<string, unknown>[] = []
    const request = vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/media?')) return new Response(new Uint8Array(4))
      const body = JSON.parse(String(init?.body))
      if (body.action === 'fail') failures.push(body)
      return json(body.action === 'claim' ? { job } : {})
    }) as unknown as typeof fetch
    const run = vi.fn(async () => vector)
    const runner = createMacRunner(config, {
      fetch: request,
      processor: { run, close: vi.fn() },
      log: vi.fn(),
    })
    await runner.runOnce()
    expect(run).not.toHaveBeenCalled()
    expect(failures[0].error).toContain('64 MiB')
    const files = await readdir(dir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/\.media$/)
    expect((await stat(path.join(dir, files[0]))).size).toBe(4)
    runner.close()
  })

  it.each(['oversized', 'truncated', 'overrun'] as const)(
    'bounds a %s media download and removes incomplete files',
    async (scenario) => {
      const job = videoJob(0, 'lease')
      if (scenario === 'oversized') job.media!.bytes = 5000
      const actions: Record<string, unknown>[] = []
      const request = vi.fn(async (url: unknown, init?: RequestInit) => {
        if (String(url).includes('/media?'))
          return new Response(new Uint8Array(scenario === 'truncated' ? 2 : 5))
        const body = JSON.parse(String(init?.body))
        actions.push(body)
        return json(body.action === 'claim' ? { job } : {})
      }) as unknown as typeof fetch
      const run = vi.fn(async () => vector)
      const runner = createMacRunner(config, {
        fetch: request,
        processor: { run, close: vi.fn() },
        log: vi.fn(),
      })
      await runner.runOnce()
      expect(run).not.toHaveBeenCalled()
      expect(actions.at(-1)).toMatchObject({ action: 'fail', code: 'retry' })
      expect(await readdir(dir)).toEqual([])
      runner.close()
    },
  )

  it('keeps leases alive while the separate inference processor is busy', async () => {
    vi.useFakeTimers()
    const actions: string[] = []
    let complete!: (vector: number[]) => void
    const processor: MacProcessor = {
      run: vi.fn(
        () =>
          new Promise<number[]>((resolve) => {
            complete = resolve
          }),
      ),
      close: vi.fn(),
    }
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      actions.push(body.action)
      return json(body.action === 'claim' ? { job: textJob() } : {})
    }) as unknown as typeof fetch
    const runner = createMacRunner(config, { fetch: request, processor, log: vi.fn() })
    const pending = runner.runOnce()
    await vi.waitFor(() => expect(processor.run).toHaveBeenCalled())
    await vi.advanceTimersByTimeAsync(20_000)
    expect(actions).toContain('heartbeat')
    complete(vector)
    await pending
    runner.close()
  })

  it('aborts work when lease renewal is rejected and does not submit stale results', async () => {
    vi.useFakeTimers()
    const actions: string[] = []
    const processor: MacProcessor = {
      run: vi.fn(
        (_task, signal) =>
          new Promise<number[]>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('lease lost')), { once: true })
          }),
      ),
      close: vi.fn(),
    }
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      actions.push(body.action)
      return json(
        body.action === 'claim' ? { job: textJob() } : {},
        body.action === 'heartbeat' ? 409 : 200,
      )
    }) as unknown as typeof fetch
    const runner = createMacRunner(config, { fetch: request, processor, log: vi.fn() })
    const pending = runner.runOnce()
    await vi.waitFor(() => expect(processor.run).toHaveBeenCalled())
    await vi.advanceTimersByTimeAsync(20_000)
    await pending
    expect(actions).toEqual(['claim', 'heartbeat'])
    runner.close()
  })
})
