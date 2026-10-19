import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const media = vi.hoisted(() => ({
  transcribeSource: vi.fn(),
  readScreenText: vi.fn(),
}))
vi.mock('@/lib/semantic/extract-media', () => media)
// The model process must never start in tests.
vi.mock('@/lib/semantic/extractor', () => ({
  ExtractorProcess: class {
    run() {
      throw new Error('no extract process in tests')
    }
    close() {}
  },
}))

import { createMacRunner, workerKinds, type MacRunnerConfig } from '@/lib/processing/mac-runner'
import type { ProcessingJob } from '@/lib/processing/protocol'
import { SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'

let dir: string
let config: MacRunnerConfig
const json = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
const base = (kind: ProcessingJob['kind']): ProcessingJob => ({
  id: 'job1',
  lease: 'private-lease',
  model: SEMANTIC_MODEL_VERSION,
  kind,
  contentHash: `${kind}-hash`,
  profile: 'normal',
})

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'adhx-worker-extract-'))
  config = {
    serverUrl: 'https://adhx.example.com',
    token: 'x'.repeat(40),
    workerId: 'mac-test',
    cacheDir: dir,
    maxFileBytes: 1024,
    maxCacheBytes: 128 * 1024 ** 2,
    pollMs: 1000,
  }
  media.transcribeSource.mockReset()
  media.readScreenText.mockReset()
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(dir, { recursive: true, force: true })
})

function server(job: ProcessingJob, files: Record<string, string> = {}) {
  const actions: Record<string, unknown>[] = []
  const downloads: string[] = []
  const request = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url).includes('/api/processing/media')) {
      const slot = new URL(String(url)).searchParams.get('slot') ?? ''
      downloads.push(slot)
      return new Response(files[slot] ?? files[''] ?? '')
    }
    const body = JSON.parse(String(init?.body))
    actions.push(body)
    return json(body.action === 'claim' ? { job } : { done: true })
  }) as unknown as typeof fetch
  return { fetch: request, actions, downloads }
}

const extract = vi.fn(async () => ({}))

describe('native worker: speech and text on screen', () => {
  it('offers the kinds switched on here', () => {
    expect(workerKinds()).toEqual(['text', 'image', 'video', 'speech', 'screen'])
    vi.stubEnv('SEMANTIC_SPEECH', 'off')
    expect(workerKinds()).toEqual(['text', 'image', 'video', 'screen'])
  })

  it('transcribes the leased sound and sends back only words', async () => {
    const job = {
      ...base('speech'),
      media: { path: '/api/processing/media?id=job1', mime: 'video/mp4', bytes: 5 },
    }
    const { fetch, actions } = server(job, { '': 'sound' })
    media.transcribeSource.mockImplementation(async (file: string, run: unknown, options) => {
      expect(await readFile(file, 'utf8')).toBe('sound')
      expect(run).toBe(extract)
      expect(options).toMatchObject({ localOnly: true, scratch: dir })
      return { text: 'the cat screams at the cucumber', language: 'en' }
    })
    const runner = createMacRunner(config, {
      fetch,
      extract,
      processor: { run: vi.fn(), close: vi.fn() },
      log: vi.fn(),
    })
    expect(await runner.runOnce()).toBe(true)
    expect(actions[0]).toMatchObject({ action: 'claim', protocol: 2 })
    expect(actions[1]).toEqual({
      action: 'extracted',
      id: 'job1',
      lease: 'private-lease',
      text: 'the cat screams at the cucumber',
      language: 'en',
    })
    // The downloaded copy goes once the server has the words.
    expect((await readdir(dir)).filter((f) => f.endsWith('.media'))).toEqual([])
    runner.close()
  })

  it('reads every leased picture and the video’s frames by slot', async () => {
    const file = (slot: string, bytes: number) => ({
      path: `/api/processing/media?id=job1&slot=${slot}`,
      mime: slot === 'video-1' ? 'video/mp4' : 'image/jpeg',
      bytes,
      slot,
    })
    const job: ProcessingJob = {
      ...base('screen'),
      files: [file('photo-1', 3), file('photo-2', 3), file('video-1', 5)],
      videoSeconds: 41,
    }
    const { fetch, actions, downloads } = server(job, {
      'photo-1': 'one',
      'photo-2': 'two',
      'video-1': 'video',
    })
    media.readScreenText.mockImplementation(async (images: string[], video) => {
      expect(await Promise.all(images.map((i) => readFile(i, 'utf8')))).toEqual(['one', 'two'])
      expect(await readFile(video.source, 'utf8')).toBe('video')
      expect(video.duration).toBe(41)
      return 'WHEN THE WIFI\nGOES DOWN'
    })
    const runner = createMacRunner(config, {
      fetch,
      extract,
      processor: { run: vi.fn(), close: vi.fn() },
      log: vi.fn(),
    })
    await runner.runOnce()
    expect(downloads).toEqual(['photo-1', 'photo-2', 'video-1'])
    expect(actions[1]).toMatchObject({ action: 'extracted', text: 'WHEN THE WIFI\nGOES DOWN' })
    runner.close()
  })

  it('defers a kind it does not know instead of crashing', async () => {
    const { fetch, actions } = server({ ...base('text'), kind: 'hologram' as never })
    const log = vi.fn()
    const runner = createMacRunner(config, {
      fetch,
      extract,
      processor: { run: vi.fn(), close: vi.fn() },
      log,
    })
    expect(await runner.runOnce()).toBe(true)
    expect(actions[1]).toMatchObject({ action: 'fail', code: 'retry' })
    expect(log).toHaveBeenCalledWith('[worker] processing deferred; job will retry')
    runner.close()
  })
})
