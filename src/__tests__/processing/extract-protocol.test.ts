import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { createTestDb, createTestBookmark, USER_A, type TestDbInstance } from '../api/setup'
import * as schema from '@/lib/db/schema'

let instance: TestDbInstance
let root: string
vi.mock('@/lib/db', () => ({
  get db() {
    return instance.db
  },
  runInTransaction: <T>(fn: () => T): T => instance.sqlite.transaction(fn)(),
}))

import {
  claimProcessingJob,
  completeExtractJob,
  failProcessingJob,
  cacheReleaseAfter,
  reconcileMediaCache,
} from '@/lib/processing/jobs'
import { PROCESSING_PROTOCOL, SUPPORTED_PROTOCOLS, claimableKinds } from '@/lib/processing/protocol'
import { claimConversionJob } from '@/lib/processing/conversion'
import { SEMANTIC_MODEL_VERSION, PRIORITY, type JobKind } from '@/lib/semantic/config'
import { enqueuePosts } from '@/lib/semantic/queue'
import { saveEmbedding } from '@/lib/semantic/store'
import { extractedWords, getExtracted } from '@/lib/semantic/extracted'
import { keywordSearch } from '@/lib/semantic/keywords'
import { POST } from '@/app/api/processing/jobs/route'
import { GET } from '@/app/api/processing/media/route'

const token = 't'.repeat(43)
const claim = (protocol = 2, kinds?: string[]) =>
  claimProcessingJob('mac-test', SEMANTIC_MODEL_VERSION, protocol, kinds)

beforeEach(async () => {
  instance = createTestDb()
  root = await mkdtemp(path.join(os.tmpdir(), 'adhx-extract-protocol-'))
  vi.stubEnv('PROCESSING_MODE', 'remote')
  vi.stubEnv('INDEXING_LEVEL', 'normal')
  vi.stubEnv('PROCESSING_WORKER_TOKEN', token)
  vi.stubEnv('MEDIA_DIR', root)
})
afterEach(async () => {
  instance.close()
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

async function kept(
  slot: string,
  mime: string,
  bytes = 'retained',
  durationMs: number | null = null,
) {
  const file = `${slot}.bin`
  await writeFile(path.join(root, file), bytes)
  instance.db
    .insert(schema.keptFiles)
    .values({
      platform: 'twitter',
      postId: '100',
      slot,
      path: file,
      mime,
      bytes: bytes.length,
      durationMs,
      createdAt: '2026-10-19T10:00:00.000Z',
    })
    .run()
}

/** A saved video post with two photos, everything but `kinds` already understood. */
async function savedPost(kinds: JobKind[]) {
  instance.db
    .insert(schema.bookmarks)
    .values(createTestBookmark(USER_A, '100', { text: 'look at her go' }))
    .run()
  instance.db
    .insert(schema.bookmarkMedia)
    .values([
      {
        id: 'm-100_1',
        userId: USER_A,
        platform: 'twitter',
        bookmarkId: '100',
        mediaType: 'video',
        originalUrl: 'https://video.twimg.com/a.mp4',
        previewUrl: 'https://pbs.twimg.com/a.jpg',
      },
    ])
    .run()
  await kept('video-1', 'video/mp4', 'retained-video', 41_000)
  await kept('photo-1', 'image/jpeg', 'photo-one')
  await kept('photo-2', 'image/jpeg', 'photo-two')
  for (const kind of ['text', 'image', 'video'] as const)
    await saveEmbedding({
      platform: 'twitter',
      postId: '100',
      kind,
      contentHash: null,
      status: 'none',
    })
  await enqueuePosts([{ platform: 'twitter', postId: '100' }], PRIORITY.urgent, kinds)
}

function request(body: unknown) {
  return new Request('https://adhx.example.com/api/processing/jobs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

describe('protocol versions', () => {
  it('serves version 1 and 2 workers, and only hands version 1 the kinds it knows', () => {
    expect(PROCESSING_PROTOCOL).toBe(2)
    expect(SUPPORTED_PROTOCOLS).toEqual([1, 2])
    expect(claimableKinds(1)).toEqual(['text', 'image', 'video'])
    // A version 1 worker can't opt in to kinds it doesn't know.
    expect(claimableKinds(1, ['speech'])).toEqual(['text', 'image', 'video'])
    expect(claimableKinds(2)).toEqual(['text', 'image', 'video', 'speech', 'screen'])
    expect(claimableKinds(2, ['text', 'speech', 'future'])).toEqual(['text', 'speech'])
    vi.stubEnv('SEMANTIC_SCREEN_TEXT', 'off')
    expect(claimableKinds(2)).toEqual(['text', 'image', 'video', 'speech'])
  })

  it('never gives an old worker a speech or on-screen text job', async () => {
    await savedPost(['speech', 'screen'])
    expect(await claim(1)).toBeNull()
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM processing_leases').get()).toEqual({
      n: 0,
    })
    // …and the same work waits for a worker that can do it.
    expect((await claim(2))?.kind).toBe('speech')
  })

  it('rejects unknown protocol versions and malformed kinds lists', async () => {
    await expect(claim(3)).rejects.toThrow('protocol')
    await expect(claimConversionJob('mac-test', SEMANTIC_MODEL_VERSION, 3)).rejects.toThrow(
      'protocol',
    )
    expect(await claimConversionJob('mac-test', SEMANTIC_MODEL_VERSION, 1)).toBeNull()
    const response = await POST(
      request({
        action: 'claim',
        workerId: 'mac',
        model: SEMANTIC_MODEL_VERSION,
        protocol: 2,
        kinds: 'speech',
      }),
    )
    expect(response.status).toBe(400)
  })

  it('lets a worker leave out work it was told not to do', async () => {
    await savedPost(['speech', 'screen'])
    expect((await claim(2, ['text', 'image', 'video', 'screen']))?.kind).toBe('screen')
  })
})

describe('speech and on-screen text jobs', () => {
  it('reconciles only current file generations with live consumers and removes deleted-source copies', async () => {
    await savedPost(['speech'])
    const job = (await claim(2, ['speech']))!
    const key = job.media!.cacheKey!
    expect(reconcileMediaCache([key])).toEqual([])
    instance.sqlite
      .prepare("UPDATE kept_files SET created_at='replacement' WHERE slot='video-1'")
      .run()
    expect(reconcileMediaCache([key])).toEqual([key])
    instance.sqlite
      .prepare("UPDATE kept_files SET created_at='2026-10-19T10:00:00.000Z' WHERE slot='video-1'")
      .run()
    instance.sqlite.prepare("DELETE FROM bookmarks WHERE id='100'").run()
    expect(reconcileMediaCache([key])).toEqual([key])
    expect(() => reconcileMediaCache(['../secret'])).toThrow('cache keys')
    expect(() => reconcileMediaCache(Array(513).fill(key))).toThrow('cache keys')
  })

  it('rejects malformed cache reconciliation before leasing any work', async () => {
    await savedPost(['speech'])
    const response = await POST(
      request({
        action: 'claim',
        workerId: 'mac-test',
        model: SEMANTIC_MODEL_VERSION,
        protocol: 2,
        kinds: ['speech'],
        cachedMedia: ['../private'],
      }),
    )
    expect(response.status).toBe(400)
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM processing_leases').get()).toEqual({
      n: 0,
    })
  })

  it('cleans a cached original when a redundant current job is skipped at claim time', async () => {
    await savedPost(['speech'])
    const job = (await claim(2, ['speech']))!
    await completeExtractJob(job.id, job.lease, 'words already extracted from this source', 'en')
    await enqueuePosts([{ platform: 'twitter', postId: '100' }], PRIORITY.urgent, ['speech'])
    const response = await POST(
      request({
        action: 'claim',
        workerId: 'mac-test',
        model: SEMANTIC_MODEL_VERSION,
        protocol: 2,
        kinds: ['speech'],
      }),
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.job).toBeNull()
    expect(body.releaseMedia).toContain(job.media!.cacheKey)
  })

  it('shares generation-safe file identities across learning kinds and releases after the last consumer', async () => {
    await savedPost(['speech', 'screen'])
    const speech = (await claim(2, ['speech']))!
    const screen = (await claim(2, ['screen']))!
    const video = screen.files!.find((file) => file.slot === 'video-1')!
    expect(speech.contentHash).not.toBe(screen.contentHash)
    expect(speech.media!.cacheKey).toMatch(/^[a-f0-9]{64}$/)
    expect(speech.media!.cacheKey).toBe(video.cacheKey)
    const afterSpeech = cacheReleaseAfter(speech.id, speech.lease)
    await completeExtractJob(speech.id, speech.lease, 'useful spoken words here', 'en')
    expect(afterSpeech()).not.toContain(video.cacheKey)
    const afterScreen = cacheReleaseAfter(screen.id, screen.lease)
    await completeExtractJob(screen.id, screen.lease, 'readable words on screen', null)
    expect(afterScreen()).toContain(video.cacheKey)
    await enqueuePosts([{ platform: 'twitter', postId: '100' }], PRIORITY.urgent, ['speech'])
    instance.sqlite
      .prepare("UPDATE kept_files SET created_at='changed-generation' WHERE slot='video-1'")
      .run()
    expect((await claim(2, ['speech']))!.media!.cacheKey).not.toBe(video.cacheKey)
  })

  it('leases the sound, stores the cleaned words and re-queues the text vector', async () => {
    await savedPost(['speech'])
    const job = (await claim())!
    expect(job).toMatchObject({
      kind: 'speech',
      media: { mime: 'video/mp4', bytes: 'retained-video'.length },
    })
    expect(job.text).toBeUndefined()
    const media = await GET(
      new Request(`https://adhx.example.com${job.media!.path}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-ADHX-Lease': job.lease },
      }),
    )
    expect(await media.text()).toBe('retained-video')

    const response = await POST(
      request({
        action: 'extracted',
        id: job.id,
        lease: job.lease,
        text: 'Okay so my cat just saw a cucumber and she screamed',
        language: 'en',
      }),
    )
    expect(await response.json()).toMatchObject({ done: true, releaseMedia: expect.any(Array) })
    expect(getExtracted('twitter', '100', 'speech')).toMatchObject({
      status: 'ok',
      language: 'en',
      text: 'Okay so my cat just saw a cucumber and she screamed',
    })
    const queue = instance.sqlite
      .prepare('SELECT kind, priority FROM understanding_queue ORDER BY kind')
      .all()
    expect(queue).toEqual([{ kind: 'text', priority: PRIORITY.urgent }])
    expect(keywordSearch('cucumber', 5).map((h) => h.key)).toEqual(['twitter:100'])
    // The re-queued text job carries the words to the worker.
    const text = (await claim())!
    expect(text.kind).toBe('text')
    expect(text.text).toContain('Said in the video: Okay so my cat just saw a cucumber')
  })

  it('lists every picture and the video for on-screen text, each fetched by slot', async () => {
    await savedPost(['screen'])
    const job = (await claim())!
    expect(job.kind).toBe('screen')
    expect(job.files?.map((f) => f.slot)).toEqual(['photo-1', 'photo-2', 'video-1'])
    expect(job.videoSeconds).toBe(41)
    const fetch = (slot: string) =>
      GET(
        new Request(`https://adhx.example.com/api/processing/media?id=${job.id}&slot=${slot}`, {
          headers: { Authorization: `Bearer ${token}`, 'X-ADHX-Lease': job.lease },
        }),
      )
    expect(await (await fetch('photo-2')).text()).toBe('photo-two')
    expect((await fetch('photo-9')).status).toBe(409)
    expect((await fetch('../etc')).status).toBe(409)
    await completeExtractJob(job.id, job.lease, 'WHEN THE WIFI\nGOES DOWN FOR 5 SECONDS', null)
    expect(extractedWords('twitter', '100').screen).toBe('WHEN THE WIFI\nGOES DOWN FOR 5 SECONDS')
  })

  it('filters junk from a worker and does not re-queue words that did not change', async () => {
    await savedPost(['speech'])
    const job = (await claim())!
    await completeExtractJob(job.id, job.lease, 'Thank you for watching!', 'en')
    expect(getExtracted('twitter', '100', 'speech')).toMatchObject({ status: 'none', text: null })
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM understanding_queue').get()).toEqual({
      n: 0,
    })
    // A finished lease can't be used twice, and vectors don't go to word jobs.
    await expect(completeExtractJob(job.id, job.lease, 'again', null)).rejects.toThrow('lease')
  })

  it('refuses a vector for a word job, and words for a vector job', async () => {
    await savedPost(['speech'])
    const job = (await claim())!
    const vector = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0))
    const response = await POST(
      request({ action: 'complete', id: job.id, lease: job.lease, vector }),
    )
    expect(response.status).toBe(409)
    expect(
      (await POST(request({ action: 'extracted', id: job.id, lease: job.lease, text: 5 }))).status,
    ).toBe(400)
  })

  it('records "nothing here" and gives up into failed without touching vectors', async () => {
    await savedPost(['speech', 'screen'])
    const speech = (await claim())!
    await failProcessingJob(speech.id, speech.lease, 'none', 'No sound')
    expect(getExtracted('twitter', '100', 'speech')).toMatchObject({ status: 'none' })
    for (let i = 0; i < 3; i++) {
      instance.db.run(
        sql`UPDATE understanding_queue SET next_attempt_at='2000-01-01T00:00:00.000Z'`,
      )
      const screen = (await claim())!
      expect(screen.kind).toBe('screen')
      await failProcessingJob(screen.id, screen.lease, 'retry', 'Native processing failed')
    }
    expect(getExtracted('twitter', '100', 'screen')).toMatchObject({ status: 'failed' })
    expect(
      instance.sqlite
        .prepare("SELECT count(*) AS n FROM post_embeddings WHERE kind IN ('speech','screen')")
        .get(),
    ).toEqual({ n: 0 })
  })

  it('drops queued work the server has switched off', async () => {
    await savedPost(['speech', 'screen'])
    vi.stubEnv('SEMANTIC_SPEECH', 'off')
    vi.stubEnv('SEMANTIC_SCREEN_TEXT', 'off')
    expect(await claim()).toBeNull()
    // Left in place until the next once-a-minute tidy, never handed out meanwhile.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 61_000)
    try {
      expect(await claim()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM understanding_queue').get()).toEqual({
      n: 0,
    })
  })
})
