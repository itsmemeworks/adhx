import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from '../api/setup'
import * as schema from '@/lib/db/schema'

let instance: TestDbInstance
let root: string
let beforeTransaction: (() => void) | undefined
vi.mock('@/lib/db', () => ({
  get db() {
    return instance.db
  },
  runInTransaction: <T>(fn: () => T): T => {
    const hook = beforeTransaction
    beforeTransaction = undefined
    hook?.()
    return instance.sqlite.transaction(fn)()
  },
}))
import {
  claimProcessingJob,
  completeProcessingJob,
  completeVideoSegment,
  planProcessingVideo,
  heartbeat,
  failProcessingJob,
  reconcileMediaCache,
} from '@/lib/processing/jobs'
import { remoteActivity } from '@/lib/processing/activity'
import { workerAuthorized } from '@/lib/processing/auth'
import { SEMANTIC_MODEL_VERSION, PRIORITY, MAX_ATTEMPTS } from '@/lib/semantic/config'
import { enqueueBackfill, enqueuePosts } from '@/lib/semantic/queue'
import { saveEmbedding } from '@/lib/semantic/store'
import { POST } from '@/app/api/processing/jobs/route'
import { GET } from '@/app/api/processing/media/route'
const token = 't'.repeat(43)
const vector: number[] = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0))
const claim = () => claimProcessingJob('mac-test', SEMANTIC_MODEL_VERSION, 1)

beforeEach(async () => {
  instance = createTestDb()
  root = await mkdtemp(path.join(os.tmpdir(), 'adhx-remote-jobs-'))
  vi.stubEnv('PROCESSING_MODE', 'remote')
  vi.stubEnv('INDEXING_LEVEL', 'normal')
  vi.stubEnv('PROCESSING_WORKER_TOKEN', token)
  vi.stubEnv('MEDIA_DIR', root)
  // Speech and text on screen are covered in extract-protocol.test.ts.
  vi.stubEnv('SEMANTIC_SPEECH', 'off')
  vi.stubEnv('SEMANTIC_SCREEN_TEXT', 'off')
})
afterEach(async () => {
  instance.close()
  beforeTransaction = undefined
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})
async function saved(kind: 'text' | 'video', id = '100') {
  instance.db
    .insert(schema.bookmarks)
    .values(createTestBookmark(USER_A, id, { text: 'Useful public content' }))
    .run()
  for (const other of ['text', 'image', 'video'] as const)
    if (other !== kind)
      await saveEmbedding({
        platform: 'twitter',
        postId: id,
        kind: other,
        contentHash: null,
        status: 'none',
      })
  if (kind === 'video') {
    instance.db
      .insert(schema.bookmarkMedia)
      .values({
        id: `m-${id}`,
        userId: USER_A,
        platform: 'twitter',
        bookmarkId: id,
        mediaType: 'video',
        originalUrl: 'https://video.twimg.com/a.mp4',
        previewUrl: 'https://pbs.twimg.com/a.jpg',
      })
      .run()
    await writeFile(path.join(root, 'movie.mp4'), 'retained-original')
    instance.db
      .insert(schema.keptFiles)
      .values({
        platform: 'twitter',
        postId: id,
        slot: 'video-1',
        path: 'movie.mp4',
        mime: 'video/mp4',
        bytes: 17,
        durationMs: 120000,
        createdAt: '2026-10-19T10:00:00.000Z',
      })
      .run()
  }
  await enqueuePosts([{ platform: 'twitter', postId: id }], PRIORITY.sync, [kind])
}
function request(body: unknown, credential = token) {
  return new Request('https://adhx.example.com/api/processing/jobs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${credential}` },
    body: JSON.stringify(body),
  })
}

describe('understanding queue fairness', () => {
  it('eventually serves an old backfill job while fresh urgent work keeps arriving', async () => {
    await saved('text', 'old')
    await saved('text', 'fresh')
    await enqueuePosts([{ platform: 'twitter', postId: 'old' }], PRIORITY.backfill, ['text'])
    await enqueuePosts([{ platform: 'twitter', postId: 'fresh' }], PRIORITY.urgent, ['text'])
    instance.sqlite
      .prepare("UPDATE understanding_queue SET enqueued_at=? WHERE post_id='old'")
      .run(new Date(Date.now() - 120 * 60_000).toISOString())
    const job = (await claim())!
    expect(job.text).toContain('Useful public content')
    expect(
      instance.sqlite.prepare('SELECT post_id FROM processing_leases WHERE id=?').get(job.id),
    ).toEqual({ post_id: 'old' })
  })
})

describe('machine authentication', () => {
  it('requires remote mode and a separate constant-time URL-safe credential', () => {
    expect(workerAuthorized(request({}))).toBe(true)
    expect(workerAuthorized(request({}, 'adhx_phone_key'))).toBe(false)
    vi.stubEnv('PROCESSING_WORKER_TOKEN', 'é'.repeat(43))
    expect(workerAuthorized(request({}))).toBe(false)
    vi.stubEnv('PROCESSING_WORKER_TOKEN', token)
    vi.stubEnv('PROCESSING_MODE', 'local')
    expect(workerAuthorized(request({}))).toBe(false)
    vi.stubEnv('PROCESSING_MODE', 'remote')
    vi.stubEnv('SEMANTIC_SEARCH', 'off')
    expect(workerAuthorized(request({}))).toBe(true)
  })
  it('rejects invalid auth, model versions and malformed result shapes', async () => {
    expect((await POST(request({}, 'bad'))).status).toBe(401)
    expect(
      (await POST(request({ action: 'claim', workerId: 'mac', model: 'other', protocol: 1 })))
        .status,
    ).toBe(409)
    expect((await POST(request({ action: 'complete' }))).status).toBe(400)
  })
})

describe('durable remote leases', () => {
  it('rejects source writes between asynchronous validation and the result transaction', async () => {
    await saved('text')
    const job = (await claim())!
    beforeTransaction = () =>
      instance.db.run(sql`UPDATE bookmarks SET text='Changed after validation'`)
    await expect(completeProcessingJob(job.id, job.lease, vector)).rejects.toThrow('changed')
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM understanding_queue').get()).toEqual({
      n: 1,
    })
    expect(
      instance.sqlite.prepare("SELECT count(*) AS n FROM post_embeddings WHERE kind='text'").get(),
    ).toEqual({ n: 0 })
  })
  it('pauses indexing claims independently of remote media conversion access', async () => {
    await saved('text')
    vi.stubEnv('SEMANTIC_SEARCH', 'off')
    const response = await POST(
      request({ action: 'claim', workerId: 'mac', model: SEMANTIC_MODEL_VERSION, protocol: 1 }),
    )
    expect(await response.json()).toEqual({ job: null })
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM processing_leases').get()).toEqual({
      n: 0,
    })
  })
  it('rejects invalid numeric embeddings without settling the lease', async () => {
    await saved('text')
    const job = (await claim())!
    for (const bad of [null, '1', 1e308]) {
      const result = [...vector]
      result[1] = bad as number
      const response = await POST(
        request({ action: 'complete', id: job.id, lease: job.lease, vector: result }),
      )
      expect(response.status).toBe(400)
    }
    await completeProcessingJob(job.id, job.lease, vector)
  })
  it('does not let hidden backfill jobs starve visible work', async () => {
    for (let i = 0; i < 35; i++) {
      await saved('text', `hidden-${i}`)
      instance.db
        .insert(schema.moderatedPosts)
        .values({
          platform: 'twitter',
          bookmarkId: `hidden-${i}`,
          hidden: 1,
          createdBy: USER_A,
          createdAt: new Date().toISOString(),
        })
        .run()
    }
    await saved('text', 'visible')
    expect((await claim())?.text).toContain('Useful public content')
    expect(instance.sqlite.prepare('SELECT post_id FROM processing_leases').get()).toEqual({
      post_id: 'visible',
    })
  })
  it.each(['text', 'video'] as const)(
    'bounds abandoned %s jobs without starving another post or reviving on backfill',
    async (kind) => {
      await saved(kind, 'abandoned')
      await enqueuePosts([{ platform: 'twitter', postId: 'abandoned' }], PRIORITY.urgent, [kind])
      let job = (await claim())!
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        instance.db.run(sql`UPDATE processing_leases SET expires_at=0 WHERE id=${job.id}`)
        if (attempt === 1) {
          await saved('text', 'healthy')
          const healthy = (await claim())!
          expect(
            instance.sqlite
              .prepare('SELECT post_id FROM processing_leases WHERE id=?')
              .get(healthy.id),
          ).toEqual({ post_id: 'healthy' })
          await completeProcessingJob(healthy.id, healthy.lease, vector)
        } else expect(await claim()).toBeNull()
        await expect(heartbeat(job.id, job.lease)).rejects.toThrow('lease')
        const q = instance.sqlite
          .prepare(
            "SELECT attempts,next_attempt_at FROM understanding_queue WHERE post_id='abandoned'",
          )
          .get() as { attempts: number; next_attempt_at: string } | undefined
        if (attempt < MAX_ATTEMPTS) {
          expect(q?.attempts).toBe(attempt)
          expect(Date.parse(q!.next_attempt_at)).toBeGreaterThan(Date.now())
          // A second claim during backoff must not charge the same expiration twice.
          expect(await claim()).toBeNull()
          instance.db.run(
            sql`UPDATE understanding_queue SET next_attempt_at='2000-01-01' WHERE post_id='abandoned'`,
          )
          job = (await claim())!
        } else expect(q).toBeUndefined()
      }
      expect(
        instance.sqlite
          .prepare('SELECT status FROM post_embeddings WHERE post_id=? AND kind=?')
          .get('abandoned', kind),
      ).toEqual({ status: 'failed' })
      await enqueueBackfill()
      expect(await claim()).toBeNull()
    },
  )

  it('treats an expired source generation as cancellation rather than a failed attempt', async () => {
    await saved('text')
    const job = (await claim())!
    instance.db.run(sql`UPDATE bookmarks SET text='A new generation of words'`)
    instance.db.run(sql`UPDATE processing_leases SET expires_at=0`)
    const replacement = (await claim())!
    expect(replacement.text).toContain('A new generation')
    expect(instance.sqlite.prepare('SELECT attempts FROM understanding_queue').get()).toEqual({
      attempts: 0,
    })
    await expect(heartbeat(job.id, job.lease)).rejects.toThrow('lease')
  })

  it('claims once, expires safely and rejects an old worker result', async () => {
    await saved('text')
    const first = (await claim())!
    expect(first.kind).toBe('text')
    expect(first.text).toContain('Useful public content')
    expect(await claim()).toBeNull()
    instance.db.run(sql`UPDATE processing_leases SET expires_at=0`)
    expect(await claim()).toBeNull() // Expiration consumes a retry and enters backoff.
    instance.db.run(sql`UPDATE understanding_queue SET next_attempt_at='2000-01-01'`)
    const replacement = (await claim())!
    expect(replacement.lease).not.toBe(first.lease)
    await expect(completeProcessingJob(first.id, first.lease, vector)).rejects.toThrow('lease')
    await completeProcessingJob(replacement.id, replacement.lease, vector)
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM understanding_queue').get()).toEqual({
      n: 0,
    })
    expect(
      instance.sqlite.prepare("SELECT status,dims FROM post_embeddings WHERE kind='text'").get(),
    ).toEqual({ status: 'ok', dims: 768 })
  })
  it('rejects deleted-post results and replaced same-size retained files', async () => {
    await saved('video')
    const first = (await claim())!
    instance.db.run(sql`UPDATE kept_files SET created_at='2026-10-19T11:00:00.000Z'`)
    await expect(planProcessingVideo(first.id, first.lease, 120)).rejects.toThrow('changed')
    const next = (await claim())!
    expect(next.contentHash).not.toBe(first.contentHash)
    instance.db.delete(schema.bookmarks).run()
    await expect(planProcessingVideo(next.id, next.lease, 120)).rejects.toThrow('lease')
  })
  it('shows remote activity only to a saver of that exact post', async () => {
    await saved('video')
    const job = (await claim())!
    await planProcessingVideo(job.id, job.lease, 120)
    expect(remoteActivity(USER_A)).toMatchObject({
      postId: '100',
      segments: 2,
      completedSegments: 0,
    })
    expect(remoteActivity(USER_B)).toBeNull()
  })
  it('rolls back a result when settling the durable queue fails', async () => {
    await saved('text')
    const job = (await claim())!
    instance.sqlite.exec(
      "CREATE TRIGGER test_settle_failure BEFORE DELETE ON understanding_queue BEGIN SELECT RAISE(ABORT, 'fixture failure'); END",
    )
    await expect(completeProcessingJob(job.id, job.lease, vector)).rejects.toThrow()
    expect(
      instance.sqlite.prepare("SELECT count(*) AS n FROM post_embeddings WHERE kind='text'").get(),
    ).toEqual({ n: 0 })
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM processing_leases').get()).toEqual({
      n: 1,
    })
    instance.sqlite.exec('DROP TRIGGER test_settle_failure')
    await completeProcessingJob(job.id, job.lease, vector)
  })
  it('discards a completed aggregate with its segments when the last save is removed', async () => {
    await saved('video')
    const job = (await claim())!
    await planProcessingVideo(job.id, job.lease, 20)
    expect(await completeVideoSegment(job.id, job.lease, 0, vector)).toBe(true)
    instance.db.delete(schema.bookmarks).run()
    expect(
      instance.sqlite.prepare("SELECT count(*) AS n FROM post_embeddings WHERE kind='video'").get(),
    ).toEqual({ n: 0 })
  })
  it('heartbeats only the current lease', async () => {
    await saved('text')
    const job = (await claim())!
    instance.db.run(sql`UPDATE processing_leases SET expires_at=${Date.now() + 5000}`)
    await heartbeat(job.id, job.lease)
    const row = instance.sqlite.prepare('SELECT expires_at FROM processing_leases').get() as {
      expires_at: number
    }
    expect(row.expires_at).toBeGreaterThan(Date.now() + 60_000)
    await expect(heartbeat(job.id, 'x'.repeat(43))).rejects.toThrow('lease')
  })
  it('checkpoints segments, releases work between them and completes exactly once', async () => {
    await saved('video')
    let job = (await claim())!
    const progress = await planProcessingVideo(job.id, job.lease, 120)
    expect(progress.plan.segments).toBe(2)
    await expect(completeVideoSegment(job.id, job.lease, 1, vector)).rejects.toThrow('out of order')
    expect(await completeVideoSegment(job.id, job.lease, 0, vector)).toBe(false)
    job = (await claim())!
    expect(job.video?.nextSegment).toBe(1)
    expect(await completeVideoSegment(job.id, job.lease, 1, vector)).toBe(true)
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM video_segments').get()).toEqual({
      n: 2,
    })
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM understanding_queue').get()).toEqual({
      n: 0,
    })
    await expect(completeVideoSegment(job.id, job.lease, 1, vector)).rejects.toThrow('lease')
  })
  it('does not accept a result after the selected understanding level changes', async () => {
    await saved('video')
    const job = (await claim())!
    vi.stubEnv('INDEXING_LEVEL', 'deep')
    await expect(planProcessingVideo(job.id, job.lease, 120)).rejects.toThrow('lease')
  })
  it('lets fresh sync work run before the next section of an urgent video', async () => {
    await saved('video')
    await enqueuePosts([{ platform: 'twitter', postId: '100' }], PRIORITY.urgent, ['video'])
    const job = (await claim())!
    await planProcessingVideo(job.id, job.lease, 120)
    await saved('text', 'fresh')
    await completeVideoSegment(job.id, job.lease, 0, vector)
    expect((await claim())?.kind).toBe('text')
  })
  it('keeps shared progress until the last saver removes the post', async () => {
    await saved('video')
    const job = (await claim())!
    await planProcessingVideo(job.id, job.lease, 120)
    await completeVideoSegment(job.id, job.lease, 0, vector)
    instance.db.insert(schema.bookmarks).values(createTestBookmark(USER_B, '100')).run()
    const copy = instance.db.select().from(schema.bookmarkMedia).get()!
    instance.db
      .insert(schema.bookmarkMedia)
      .values({ ...copy, id: 'other-media', userId: USER_B })
      .run()
    instance.db.delete(schema.bookmarks).where(eq(schema.bookmarks.userId, USER_A)).run()
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM video_segments').get()).toEqual({
      n: 1,
    })
    const next = (await claim())!
    instance.db.delete(schema.bookmarks).run()
    for (const table of ['processing_leases', 'video_index_state', 'video_segments'])
      expect(instance.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 })
    await expect(completeVideoSegment(next.id, next.lease, 1, vector)).rejects.toThrow('lease')
  })
  it('records bounded failures atomically without marking unsupported content as gone', async () => {
    await saved('text')
    let job = (await claim())!
    await failProcessingJob(job.id, job.lease, 'retry', 'Temporary native failure')
    expect(instance.sqlite.prepare('SELECT attempts FROM understanding_queue').get()).toEqual({
      attempts: 1,
    })
    expect(await claim()).toBeNull()
    instance.db.run(sql`UPDATE understanding_queue SET next_attempt_at='2000-01-01'`)
    job = (await claim())!
    await failProcessingJob(job.id, job.lease, 'none', 'Unsupported input')
    expect(
      instance.sqlite.prepare("SELECT status,error FROM post_embeddings WHERE kind='text'").get(),
    ).toEqual({ status: 'none', error: null })
  })
  it('settles absent terminal media instead of retrying forever', async () => {
    await saved('video')
    instance.db.delete(schema.keptFiles).run()
    instance.db
      .insert(schema.keepJobs)
      .values({
        platform: 'twitter',
        postId: '100',
        status: 'unavailable',
        updatedAt: new Date().toISOString(),
      })
      .run()
    expect(await claim()).toBeNull()
    expect(instance.sqlite.prepare('SELECT count(*) AS n FROM understanding_queue').get()).toEqual({
      n: 0,
    })
    expect(
      instance.sqlite.prepare("SELECT status FROM post_embeddings WHERE kind='video'").get(),
    ).toEqual({ status: 'none' })
  })
})

describe('scoped retained-media transfer', () => {
  it('serves authenticated byte ranges only for the live lease', async () => {
    await saved('video')
    const job = (await claim())!
    const url = `https://adhx.example.com/api/processing/media?id=${job.id}`
    const response = await GET(
      new Request(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-ADHX-Lease': job.lease,
          Range: 'bytes=0-3',
        },
      }),
    )
    expect(response.status).toBe(206)
    expect(await response.text()).toBe('reta')
    expect(response.headers.get('content-range')).toBe('bytes 0-3/17')
    expect(
      (await GET(new Request(url, { headers: { Authorization: `Bearer ${token}` } }))).status,
    ).toBe(409)
    expect((await GET(new Request(url))).status).toBe(401)
  })
})

it('keeps a media lease when only private save state changes', async () => {
  await saved('video')
  const job = (await claim())!
  instance.sqlite
    .prepare("UPDATE bookmarks SET note='private note',is_private=1,processed_at=? WHERE id='100'")
    .run(new Date().toISOString())
  await expect(heartbeat(job.id, job.lease)).resolves.toBeUndefined()
  await planProcessingVideo(job.id, job.lease, 120)
  await expect(completeVideoSegment(job.id, job.lease, 0, vector)).resolves.toBeTypeOf('boolean')
})

it('invalidates a media lease when actual retained media changes', async () => {
  await saved('video')
  const job = (await claim())!
  instance.sqlite.prepare("UPDATE kept_files SET bytes=18 WHERE post_id='100'").run()
  await expect(heartbeat(job.id, job.lease)).rejects.toThrow('Post changed')
})

it('looks up a cache hint by its key, however long the media queue is', () => {
  const now = '2026-10-28T00:00:00Z'
  const bookmark = instance.sqlite.prepare(
    "INSERT INTO bookmarks(user_id,platform,id,author,text,tweet_url,processed_at) VALUES('queue','youtube',?,'author','text','',?)",
  )
  const file = instance.sqlite.prepare(
    "INSERT INTO kept_files(platform,post_id,slot,path,mime,bytes,created_at) VALUES('youtube',?,'video-1',?,'video/mp4',1,?)",
  )
  const queued = instance.sqlite.prepare(
    "INSERT INTO understanding_queue(platform,post_id,kind,priority,attempts,enqueued_at,next_attempt_at) VALUES('youtube',?,'video',1,0,?,?)",
  )
  instance.sqlite.transaction(() => {
    for (let i = 0; i < 50_000; i++) {
      bookmark.run(`q${i}`, now)
      file.run(`q${i}`, `q${i}.mp4`, now)
      queued.run(`q${i}`, now, now)
    }
  })()
  const unknown = 'f'.repeat(64)
  const start = performance.now()
  expect(reconcileMediaCache([unknown])).toEqual([unknown])
  // Scanning and hashing 50,000 files took about 130 ms; a key lookup is far under 1 ms.
  expect(performance.now() - start).toBeLessThan(40)
}, 20_000)
