import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { sql } from 'drizzle-orm'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from '../api/setup'
import * as schema from '@/lib/db/schema'

let instance: TestDbInstance
let root: string
vi.mock('@/lib/db', () => ({
  get db() {
    return instance.db
  },
  runInTransaction: <T>(fn: () => T): T => instance.sqlite.transaction(fn)(),
}))
vi.mock('@/lib/keep/probe', () => ({ probeMedia: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/keep/poster', () => ({ posterFrame: vi.fn(async () => null) }))
vi.mock('@/lib/media/fxembed', () => ({ fetchTweetData: vi.fn() }))
vi.mock('@/lib/keep/fetch', () => ({
  downloadTo: vi.fn(async (_url: string, _hosts: string[], file: string) =>
    writeFile(file, 'source-video'),
  ),
  imageExt: () => 'jpg',
  MEDIA_HOSTS: { twitter: ['video.twimg.com'] },
  openGraph: vi.fn(),
}))
vi.mock('child_process', () => ({
  execFile: vi.fn(() => {
    throw new Error('NAS must not transcode remote video')
  }),
}))

import {
  claimConversionJob,
  completeConversionUpload,
  conversionFailure,
  conversionHeartbeat,
  conversionMedia,
} from '@/lib/processing/conversion'
import { recordKept, keptFile, postDir, type Slot } from '@/lib/keep/store'
import { keepPost } from '@/lib/keep/download'
import { probeMedia, type Probed } from '@/lib/keep/probe'
import { fetchTweetData } from '@/lib/media/fxembed'
import { keepStatus } from '@/lib/app/phone-app'
import { listSaves } from '@/lib/app/phone-post'
import { SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'
import { claimProcessingJob } from '@/lib/processing/jobs'
import { claimNextJob } from '@/lib/processing/scheduling'
import { enqueuePosts } from '@/lib/semantic/queue'
import { PRIORITY } from '@/lib/semantic/config'
import { PROCESSING_PROTOCOL } from '@/lib/processing/protocol'
import { execFile } from 'child_process'

const valid: Probed = {
  hasVideo: true,
  hasAudio: true,
  width: 1920,
  height: 1080,
  durationMs: 120000,
  videoCodec: 'h264',
  pixelFormat: 'yuv420p',
  audioCodec: 'aac',
}
const claim = () => claimConversionJob('test-mac', SEMANTIC_MODEL_VERSION, PROCESSING_PROTOCOL)
const status = () =>
  instance.sqlite.prepare('SELECT status FROM keep_jobs').get() as { status: string }

beforeEach(async () => {
  instance = createTestDb()
  root = await mkdtemp(path.join(os.tmpdir(), 'adhx-conversion-'))
  vi.stubEnv('MEDIA_DIR', root)
  vi.stubEnv('PROCESSING_MODE', 'remote')
  vi.stubEnv('KEEP_MEDIA', 'on')
  vi.stubEnv('KEEP_H264', 'on')
  vi.stubEnv('KEEP_BACKFILL', 'on')
  vi.stubEnv('SEMANTIC_SEARCH', 'off')
  vi.clearAllMocks()
  vi.mocked(probeMedia).mockResolvedValue(valid)
})
afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  instance.close()
  await rm(root, { recursive: true, force: true })
})

async function saved(slots = 1) {
  instance.db
    .insert(schema.bookmarks)
    .values(createTestBookmark(USER_A, 'post', { category: 'video' }))
    .run()
  instance.db
    .insert(schema.keepJobs)
    .values({
      platform: 'twitter',
      postId: 'post',
      status: 'running',
      updatedAt: new Date().toISOString(),
    })
    .run()
  const dir = path.join(root, postDir('twitter', 'post'))
  await mkdir(dir, { recursive: true })
  const files = []
  for (let i = 1; i <= slots; i++) {
    const file = path.join(dir, `video-${i}.webm`)
    await writeFile(file, `source-video-${i}`)
    files.push({
      slot: `video-${i}` as Slot,
      file,
      mime: 'video/webm',
      width: 1920,
      height: 1080,
      durationMs: 120000,
      videoCodec: 'vp9',
      hasAudio: true,
    })
  }
  const poster = path.join(dir, 'poster.jpg')
  await writeFile(poster, 'poster')
  await recordKept('twitter', 'post', [
    ...files,
    { slot: 'poster', file: poster, mime: 'image/jpeg' },
  ])
  return files
}
async function upload() {
  const folder = path.join(root, '.worker-uploads')
  await mkdir(folder, { recursive: true })
  const file = path.join(folder, `upload-${Math.random()}.mp4`)
  await writeFile(file, 'converted-browser-video')
  return file
}

describe('remote conversion retaining originals', () => {
  it.each(['video', 'speech', 'screen'] as const)(
    'waits for every conversion slot before claiming %s against a source generation',
    async (kind) => {
      await saved(2)
      await enqueuePosts([{ platform: 'twitter', postId: 'post' }], PRIORITY.urgent, [kind])
      const learn = () =>
        claimProcessingJob('mac-learning', SEMANTIC_MODEL_VERSION, PROCESSING_PROTOCOL, [kind])
      expect(await learn()).toBeNull()
      const first = (await claim())!
      expect(await learn()).toBeNull()
      await completeConversionUpload(first.id, first.lease, await upload())
      // Publishing a second slot also changes the post-wide generation.
      expect(await learn()).toBeNull()
      const second = (await claim())!
      expect(await learn()).toBeNull()
      await completeConversionUpload(second.id, second.lease, await upload())
      const job = (await learn())!
      expect(job?.kind).toBe(kind)
      expect(job.media?.mime).toBe('video/mp4')
      expect(job.media?.cacheKey).not.toBe(first.media?.cacheKey)
    },
  )

  it('lets text, pure photo OCR and audio transcription progress while another post converts', async () => {
    await saved()
    for (const [id, slot, mime] of [
      ['picture', 'photo-1', 'image/jpeg'],
      ['sound', 'audio-1', 'audio/mpeg'],
    ] as const) {
      instance.db
        .insert(schema.bookmarks)
        .values(createTestBookmark(USER_A, id, { text: 'Useful saved words' }))
        .run()
      const file = path.join(root, `${id}.bin`)
      await writeFile(file, 'retained')
      await recordKept('twitter', id, [{ slot, file, mime }])
    }
    await enqueuePosts([{ platform: 'twitter', postId: 'post' }], PRIORITY.urgent, ['text'])
    await enqueuePosts([{ platform: 'twitter', postId: 'picture' }], PRIORITY.urgent, ['screen'])
    await enqueuePosts([{ platform: 'twitter', postId: 'sound' }], PRIORITY.urgent, ['speech'])
    const conversion = (await claim())!
    expect(conversion.kind).toBe('convert')
    for (const kind of ['text', 'screen', 'speech'] as const) {
      const job = await claimProcessingJob(
        'mac-learning',
        SEMANTIC_MODEL_VERSION,
        PROCESSING_PROTOCOL,
        [kind],
      )
      expect(job?.kind).toBe(kind)
      if (kind === 'screen') expect(job?.files?.map((file) => file.slot)).toEqual(['photo-1'])
      if (kind === 'speech') expect(job?.media?.mime).toBe('audio/mpeg')
    }
  })

  it('gives both newest playback and oldest conversion sources a turn', async () => {
    await saved(2)
    instance.db
      .insert(schema.bookmarks)
      .values(
        createTestBookmark(USER_A, 'newest', {
          category: 'video',
          processedAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      )
      .run()
    const file = path.join(root, 'newest.webm')
    await writeFile(file, 'new-source')
    await recordKept('twitter', 'newest', [
      {
        slot: 'video-1',
        file,
        mime: 'video/webm',
        width: 1920,
        height: 1080,
        durationMs: 120_000,
        videoCodec: 'vp9',
        hasAudio: true,
      },
    ])
    instance.sqlite
      .prepare("UPDATE kept_files SET created_at='2020-01-01' WHERE post_id='post'")
      .run()
    instance.sqlite
      .prepare("UPDATE media_conversions SET source_created_at='2020-01-01' WHERE post_id='post'")
      .run()
    const latest = (await claim())!
    expect(
      instance.sqlite
        .prepare('SELECT post_id FROM media_conversions WHERE lease_id=?')
        .get(latest.id),
    ).toEqual({ post_id: 'newest' })
    const oldest = (await claim())!
    expect(
      instance.sqlite
        .prepare('SELECT post_id FROM media_conversions WHERE lease_id=?')
        .get(oldest.id),
    ).toEqual({ post_id: 'post' })
  })

  it('reserves different service classes for simultaneous worker claims', async () => {
    vi.stubEnv('SEMANTIC_SEARCH', 'on')
    await saved(2)
    instance.db
      .insert(schema.bookmarks)
      .values(
        createTestBookmark(USER_A, 'words', {
          text: 'Public words to understand',
        }),
      )
      .run()
    await enqueuePosts([{ platform: 'twitter', postId: 'words' }], PRIORITY.urgent, ['text'])
    const jobs = await Promise.all(
      ['mac-a', 'mac-b'].map((workerId) =>
        claimNextJob(workerId, SEMANTIC_MODEL_VERSION, PROCESSING_PROTOCOL, ['text']),
      ),
    )
    expect(jobs.map((job) => job?.kind).sort()).toEqual(['convert', 'text'])
  })

  it('alternates conversion and understanding while both queues have work', async () => {
    vi.stubEnv('SEMANTIC_SEARCH', 'on')
    await saved(3)
    instance.db
      .insert(schema.bookmarks)
      .values([
        createTestBookmark(USER_A, 'words-1', { text: 'Useful public words' }),
        createTestBookmark(USER_A, 'words-2', { text: 'More useful public words' }),
      ])
      .run()
    await enqueuePosts(
      [
        { platform: 'twitter', postId: 'words-1' },
        { platform: 'twitter', postId: 'words-2' },
      ],
      PRIORITY.urgent,
      ['text'],
    )
    const next = () =>
      claimNextJob('test-mac', SEMANTIC_MODEL_VERSION, PROCESSING_PROTOCOL, ['text'])
    expect((await next())?.kind).toBe('text')
    expect((await next())?.kind).toBe('convert')
    expect((await next())?.kind).toBe('text')
    expect((await next())?.kind).toBe('convert')
    // Empty understanding yields its turn rather than blocking playback.
    instance.sqlite.prepare('DELETE FROM understanding_queue').run()
    expect((await next())?.kind).toBe('convert')
  })

  it('skips software H264 conversion on the NAS and passes the source probe to recordKept', async () => {
    vi.mocked(probeMedia).mockResolvedValue({ ...valid, videoCodec: 'vp9' })
    vi.mocked(fetchTweetData).mockResolvedValue({
      tweet: { media: { all: [{ type: 'video', url: 'https://video.twimg.com/source.mp4' }] } },
    } as never)
    const files = await keepPost({ platform: 'twitter', postId: 'post', author: 'author' })
    expect(files[0]).toMatchObject({
      videoCodec: 'vp9',
      hasAudio: true,
      width: 1920,
      height: 1080,
      durationMs: 120000,
    })
    expect(await readFile(files[0].file, 'utf8')).toBe('source-video')
  })

  it('queues every non-H264 slot atomically, preserves metadata and keeps phones preparing', async () => {
    await saved(2)
    expect(status().status).toBe('converting')
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM media_conversions').get()).toEqual({
      n: 2,
    })
    expect(keepStatus('twitter', 'post')).toMatchObject({
      status: 'keeping',
      step: 'converting',
      percent: null,
      kept: { videos: 2 },
    })
    // Conversion readiness remains enforced even while downloads are paused.
    const feed = await listSaves(USER_A, 0, 30)
    expect(feed.items).toHaveLength(0)
    expect(feed.preparing).toBe(1)
    const job = (await claim())!
    expect(job).toMatchObject({
      kind: 'convert',
      conversion: { width: 1920, height: 1080, duration: 120, hasAudio: true },
    })
    const original = keptFile('twitter', 'post', 'video-1')!.path
    await completeConversionUpload(job.id, job.lease, await upload())
    expect(status().status).toBe('converting')
    expect(keptFile('twitter', 'post', 'video-2')!.path).toMatch(/video-2.webm$/)
    expect(keptFile('twitter', 'post', 'poster')!.path).toMatch(/poster.jpg$/)
    expect(keptFile('twitter', 'post', 'video-1')!.path).not.toBe(original)
    expect(await readFile(path.join(root, original), 'utf8').catch(() => null)).toBeNull()
    const second = (await claim())!
    await completeConversionUpload(second.id, second.lease, await upload())
    expect(status().status).toBe('done')
    expect(keepStatus('twitter', 'post').status).toBe('kept')
  })

  it('validates identity even while paused and supports conversion with semantic inference off', async () => {
    await saved()
    vi.stubEnv('KEEP_MEDIA', 'off')
    expect(await claim()).toBeNull()
    await expect(claimConversionJob('mac', 'wrong', PROCESSING_PROTOCOL)).rejects.toThrow('model')
    await expect(
      claimConversionJob('bad/name', SEMANTIC_MODEL_VERSION, PROCESSING_PROTOCOL),
    ).rejects.toThrow('worker')
    vi.stubEnv('KEEP_MEDIA', 'on')
    expect((await claim())?.kind).toBe('convert')
    vi.stubEnv('KEEP_H264', 'off')
    expect(await claim()).toBeNull()
    expect(status().status).toBe('done')
    expect(keptFile('twitter', 'post', 'video-1')!.path).toMatch(/webm$/)
  })

  it('requires the live hashed lease, heartbeats it and rejects expired/replaced workers', async () => {
    await saved()
    const first = (await claim())!
    expect(await claim()).toBeNull()
    expect(await conversionHeartbeat('not-conversion', 'bad')).toBe(false)
    await expect(conversionMedia(first.id, 'x'.repeat(43))).rejects.toThrow('lease')
    expect(await conversionHeartbeat(first.id, first.lease)).toBe(true)
    expect((await conversionMedia(first.id, first.lease))?.mime).toBe('video/webm')
    instance.db.run(sql`UPDATE media_conversions SET expires_at=0`)
    const replacement = (await claim())!
    await expect(completeConversionUpload(first.id, first.lease, await upload())).rejects.toThrow(
      'lease',
    )
    expect(replacement.lease).not.toBe(first.lease)
  })

  it.each([
    { videoCodec: 'vp9' },
    { pixelFormat: 'yuv444p' },
    { width: 1280 },
    { height: 720 },
    { durationMs: 30000 },
    { hasAudio: false },
    { audioCodec: 'opus' },
  ])('rejects invalid uploads without replacing their source: %j', async (bad) => {
    const [source] = await saved()
    const job = (await claim())!
    vi.mocked(probeMedia).mockResolvedValue({ ...valid, ...bad })
    await expect(completeConversionUpload(job.id, job.lease, await upload())).rejects.toThrow(
      'preserve',
    )
    expect(await readFile(source.file, 'utf8')).toBe('source-video-1')
    expect(keptFile('twitter', 'post', 'video-1')!.path).toMatch(/webm$/)
    expect(probeMedia).toHaveBeenCalledWith(expect.any(String), { format: 'mov', localOnly: true })
  })

  it('revalidates generation and remaining savers after probing before it publishes', async () => {
    const [source] = await saved()
    const job = (await claim())!
    vi.mocked(probeMedia).mockImplementationOnce(async () => {
      instance.db.delete(schema.bookmarks).run()
      return valid
    })
    await expect(completeConversionUpload(job.id, job.lease, await upload())).rejects.toThrow(
      'generation',
    )
    expect(await readFile(source.file, 'utf8')).toBe('source-video-1')
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM media_conversions').get()).toEqual({
      n: 0,
    })
  })

  it('rolls back a failed metadata swap and retains its original', async () => {
    const [source] = await saved()
    const job = (await claim())!
    const before = keptFile('twitter', 'post', 'video-1')!.path
    instance.sqlite.exec(
      "CREATE TRIGGER refuse_conversion BEFORE UPDATE ON kept_files BEGIN SELECT RAISE(ABORT,'simulated swap failure'); END;",
    )
    await expect(completeConversionUpload(job.id, job.lease, await upload())).rejects.toThrow()
    expect(keptFile('twitter', 'post', 'video-1')!.path).toBe(before)
    expect(await readFile(source.file, 'utf8')).toBe('source-video-1')
  })

  it('accepts normalized portrait rotation without reducing the source resolution', async () => {
    await saved()
    const job = (await claim())!
    vi.mocked(probeMedia).mockResolvedValue({ ...valid, width: 1080, height: 1920 })
    await completeConversionUpload(job.id, job.lease, await upload())
    expect(keptFile('twitter', 'post', 'video-1')).toMatchObject({ width: 1080, height: 1920 })
    expect(status().status).toBe('done')
  })

  it('acknowledges a committed conversion even if inference requeue fails', async () => {
    await saved()
    const job = (await claim())!
    instance.sqlite.exec(
      "CREATE TRIGGER refuse_index BEFORE INSERT ON understanding_queue BEGIN SELECT RAISE(ABORT,'index temporarily unavailable'); END;",
    )
    await expect(
      completeConversionUpload(job.id, job.lease, await upload()),
    ).resolves.toBeUndefined()
    expect(status().status).toBe('done')
    expect(keptFile('twitter', 'post', 'video-1')!.mime).toBe('video/mp4')
  })

  it('rejects a referenced original as an upload and preserves its bytes', async () => {
    const [source] = await saved()
    const job = (await claim())!
    await expect(completeConversionUpload(job.id, job.lease, source.file)).rejects.toThrow(
      'Invalid converted upload',
    )
    expect(await readFile(source.file, 'utf8')).toBe('source-video-1')
  })

  it('drops a superseded source generation without redownloading it or stranding phone status', async () => {
    const [source] = await saved()
    const job = (await claim())!
    instance.db.run(sql`UPDATE kept_files SET created_at='new-generation' WHERE slot='video-1'`)
    await expect(conversionMedia(job.id, job.lease)).rejects.toThrow('lease')
    expect(await claim()).toBeNull()
    expect(status().status).toBe('done')
    expect(await readFile(source.file, 'utf8')).toBe('source-video-1')
  })

  it('forces local MOV/MP4 demuxing and extracts browser codec properties during the cheap probe', async () => {
    const actual = await vi.importActual<typeof import('@/lib/keep/probe')>('@/lib/keep/probe')
    vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
      const callback = args[3] as (error: Error, stdout: string, stderr: string) => void
      callback(
        new Error('probe has no output'),
        '',
        'Duration: 00:02:00.00\nStream #0:0: Video: h264 (High), yuv420p(progressive), 1920x1080\nStream #0:1: Audio: aac (LC), 48000 Hz',
      )
    }) as never)
    const result = await actual.probeMedia('/private/synthetic.mp4', {
      format: 'mov',
      localOnly: true,
    })
    expect(result).toMatchObject({
      videoCodec: 'h264',
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      durationMs: 120000,
      width: 1920,
      height: 1080,
    })
    expect(execFile).toHaveBeenCalledWith(
      expect.any(String),
      [
        '-hide_banner',
        '-protocol_whitelist',
        'file,pipe',
        '-f',
        'mov',
        '-i',
        '/private/synthetic.mp4',
      ],
      { timeout: 30000 },
      expect.any(Function),
    )
  })

  it('bounds conversion retries without placing the original back on the download queue', async () => {
    const [source] = await saved()
    for (let i = 0; i < 3; i++) {
      const job = (await claim())!
      expect(await conversionFailure(job.id, job.lease, 'temporary worker failure')).toBe(true)
      instance.db.run(sql`UPDATE media_conversions SET next_attempt_at=0`)
    }
    expect(await claim()).toBeNull()
    expect(status().status).toBe('unavailable')
    expect(await readFile(source.file, 'utf8')).toBe('source-video-1')
    expect(instance.sqlite.prepare('SELECT attempts FROM keep_jobs').get()).toEqual({ attempts: 0 })
  })

  it('blocks moderated media and retains a shared conversion until its last saver deletes', async () => {
    await saved()
    instance.db.insert(schema.bookmarks).values(createTestBookmark(USER_B, 'post')).run()
    instance.db
      .delete(schema.bookmarks)
      .where(sql`user_id=${USER_A}`)
      .run()
    const job = (await claim())!
    instance.db
      .insert(schema.moderatedPosts)
      .values({
        platform: 'twitter',
        bookmarkId: 'post',
        hidden: 1,
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
      })
      .run()
    await expect(conversionHeartbeat(job.id, job.lease)).rejects.toThrow('lease')
    instance.db.delete(schema.bookmarks).run()
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM media_conversions').get()).toEqual({
      n: 0,
    })
  })

  it('recovers aged unreferenced conversion outputs while preserving referenced files', async () => {
    const [source] = await saved()
    const orphan = path.join(
      path.dirname(source.file),
      'video-1.converted-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.mp4',
    )
    await writeFile(orphan, 'crash-before-commit')
    const old = new Date(Date.now() - 2 * 60 * 60_000)
    await utimes(orphan, old, old)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 61_000)
    await claim()
    expect(await stat(orphan).catch(() => null)).toBeNull()
    expect(await readFile(source.file, 'utf8')).toBe('source-video-1')
  })

  it('recovers a committed receipt whose superseded source survived a process crash', async () => {
    const [source] = await saved()
    const converted = path.join(
      path.dirname(source.file),
      'video-1.converted-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.mp4',
    )
    await writeFile(converted, 'committed-browser-video')
    instance.db.run(
      sql`UPDATE kept_files SET path=${path.relative(root, converted)},bytes=23,created_at='committed' WHERE slot='video-1'`,
    )
    instance.db.run(sql`UPDATE media_conversions SET status='done'`)
    instance.db.run(sql`UPDATE keep_jobs SET status='done'`)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 122_000)
    expect(await claim()).toBeNull()
    expect(await stat(source.file).catch(() => null)).toBeNull()
    expect(await readFile(converted, 'utf8')).toBe('committed-browser-video')
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM media_conversions').get()).toEqual({
      n: 0,
    })
  })
})

describe('the conversion switches saved in Admin → System', () => {
  afterEach(async () => {
    const extras = await import('@/lib/settings/extras')
    extras.__resetExtrasCache()
  })

  it.each(['KEEP_H264', 'KEEP_MEDIA'] as const)(
    'hands out no job with %s saved off',
    async (name) => {
      const extras = await import('@/lib/settings/extras')
      extras.__resetExtrasCache()
      await saved()
      extras.setExtra(name, 'off')
      expect(await claim()).toBeNull()
    },
  )

  it('a saved H.264 on wins over the environment’s off', async () => {
    const extras = await import('@/lib/settings/extras')
    extras.__resetExtrasCache()
    await saved()
    vi.stubEnv('KEEP_H264', 'off')
    extras.setExtra('KEEP_H264', 'on')
    expect((await claim())?.kind).toBe('convert')
    expect(instance.sqlite.prepare('SELECT status FROM media_conversions').get()).toEqual({
      status: 'running',
    })
  })
})
