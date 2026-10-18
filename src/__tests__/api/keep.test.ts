import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, type TestDbInstance } from './setup'

let testInstance: TestDbInstance
let mediaRoot: string

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

vi.mock('@/lib/keep/download', () => ({
  keepPost: vi.fn(),
  NothingToKeep: class NothingToKeep extends Error {},
}))

vi.mock('@/lib/semantic', () => ({ noteSaved: vi.fn(), PRIORITY: { sync: 1 } }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))

const now = () => new Date().toISOString()

function save(platform: string, id: string, author = 'alice', processedAt = now()) {
  testInstance.sqlite
    .prepare(
      `INSERT INTO bookmarks (id, user_id, platform, author, text, tweet_url, processed_at, category)
       VALUES (?, 'u1', ?, ?, '', '', ?, 'video')`,
    )
    .run(id, platform, author, processedAt)
}

function keep(platform: string, id: string, slot: string, contents: string, mime: string) {
  const rel = path.join(platform, id, `${slot}.bin`)
  fs.mkdirSync(path.join(mediaRoot, platform, id), { recursive: true })
  fs.writeFileSync(path.join(mediaRoot, rel), contents)
  testInstance.sqlite
    .prepare(
      `INSERT INTO kept_files (platform, post_id, slot, path, mime, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(platform, id, slot, rel, mime, contents.length, now())
}

const get = async (url: string, headers: Record<string, string> = {}) => {
  const { GET } = await import('@/app/api/files/[platform]/[id]/[slot]/route')
  const u = new URL(url, 'https://adhx.test')
  const [, , , platform, id, slot] = u.pathname.split('/')
  return GET(new NextRequest(u, { headers }), {
    params: Promise.resolve({ platform, id: decodeURIComponent(id), slot }),
  })
}

describe('kept media', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-media-'))
    vi.stubEnv('MEDIA_DIR', mediaRoot)
    vi.clearAllMocks()
    ;(globalThis as { __adhxKeep?: unknown }).__adhxKeep = undefined
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    testInstance.close()
    fs.rmSync(mediaRoot, { recursive: true, force: true })
  })

  describe('GET /api/files', () => {
    it('serves a kept file, with byte ranges for seeking', async () => {
      keep('youtube', 'abc', 'video-1', '0123456789', 'video/mp4')
      const whole = await get('/api/files/youtube/abc/video-1')
      expect(whole.status).toBe(200)
      expect(whole.headers.get('content-type')).toBe('video/mp4')
      expect(whole.headers.get('accept-ranges')).toBe('bytes')
      expect(await whole.text()).toBe('0123456789')

      const part = await get('/api/files/youtube/abc/video-1', { range: 'bytes=2-5' })
      expect(part.status).toBe(206)
      expect(part.headers.get('content-range')).toBe('bytes 2-5/10')
      expect(await part.text()).toBe('2345')

      const tail = await get('/api/files/youtube/abc/video-1', { range: 'bytes=-3' })
      expect(await tail.text()).toBe('789')

      const bad = await get('/api/files/youtube/abc/video-1', { range: 'bytes=50-60' })
      expect(bad.status).toBe(416)
    })

    it('uses the first picture as a picture post’s poster, and sound for a sound-only post', async () => {
      keep('pinterest', 'p1', 'photo-1', 'img', 'image/jpeg')
      keep('soundcloud', 'a~b', 'audio-1', 'sound', 'audio/mp4')
      expect(await (await get('/api/files/pinterest/p1/poster')).text()).toBe('img')
      const sound = await get('/api/files/soundcloud/a~b/video-1')
      expect(sound.headers.get('content-type')).toBe('audio/mp4')
    })

    it('offers the file as a download on request', async () => {
      keep('youtube', 'abc', 'video-1', 'x', 'video/mp4')
      const res = await get('/api/files/youtube/abc/video-1?download=1')
      expect(res.headers.get('content-disposition')).toMatch(
        /^attachment; filename="youtube-abc-video-1\./,
      )
    })

    it('hands off to the old proxy until an X, Instagram or TikTok file is kept', async () => {
      const x = await get('/api/files/twitter/123/video-1?a=alice')
      expect(x.status).toBe(307)
      expect(x.headers.get('location')).toBe('/api/media/video?author=alice&tweetId=123&quality=hd')
      const ig = await get('/api/files/instagram/ABC/photo-2')
      expect(ig.headers.get('location')).toBe('/api/media/instagram/thumbnail?id=ABC&index=2')
      const tt = await get('/api/files/tiktok/987/video-1?a=bob&download=1')
      expect(tt.headers.get('location')).toBe(
        '/api/media/tiktok/video/download?username=bob&id=987',
      )
    })

    it('is a 404 for a network with no proxy when nothing is kept or on its way', async () => {
      expect((await get('/api/files/vimeo/1/video-1')).status).toBe(404)
    })

    it('rejects bad slots, ids and hidden posts', async () => {
      expect((await get('/api/files/youtube/abc/video-x')).status).toBe(404)
      expect((await get('/api/files/YouTube/abc/video-1')).status).toBe(404)
      keep('youtube', 'hidden', 'video-1', 'x', 'video/mp4')
      testInstance.sqlite
        .prepare(
          `INSERT INTO moderated_posts (platform, bookmark_id, hidden, created_at, created_by) VALUES ('youtube', 'hidden', 1, ?, 'admin')`,
        )
        .run(now())
      expect((await get('/api/files/youtube/hidden/video-1')).status).toBe(404)
    })

    it('never serves a path outside the media folder', async () => {
      testInstance.sqlite
        .prepare(
          `INSERT INTO kept_files (platform, post_id, slot, path, mime, bytes, created_at) VALUES ('youtube', 'evil', 'video-1', '../../etc/passwd', 'text/plain', 1, ?)`,
        )
        .run(now())
      expect((await get('/api/files/youtube/evil/video-1')).status).toBe(404)
    })
  })

  describe('the download queue', () => {
    it('queues every saved post once, newest save first', async () => {
      save('youtube', 'old', 'a', '2026-01-01T00:00:00.000Z')
      save('reddit', 'new', 'videos', '2026-10-01T00:00:00.000Z')
      const { scanForNewSaves, claimNext } = await import('@/lib/keep/worker')
      expect(scanForNewSaves()).toBe(2)
      expect(scanForNewSaves()).toBe(0)
      expect(claimNext()).toEqual({ platform: 'reddit', postId: 'new' })
      expect(claimNext()).toEqual({ platform: 'youtube', postId: 'old' })
      expect(claimNext()).toBeNull()
    })

    it('only queues new saves when the backfill is off', async () => {
      save('youtube', 'old', 'a', '2026-01-01T00:00:00.000Z')
      save('youtube', 'fresh', 'a', now())
      const { scanForNewSaves } = await import('@/lib/keep/worker')
      expect(scanForNewSaves(1000, new Date(Date.now() - 60_000).toISOString())).toBe(1)
    })

    it('skips older queued jobs once the backfill is turned off', async () => {
      save('youtube', 'old', 'a', '2026-01-01T00:00:00.000Z')
      save('youtube', 'fresh', 'a', now())
      const { scanForNewSaves, claimNext } = await import('@/lib/keep/worker')
      scanForNewSaves()
      const since = new Date(Date.now() - 60_000).toISOString()
      expect(claimNext(new Date(), since)).toEqual({ platform: 'youtube', postId: 'fresh' })
      expect(claimNext(new Date(), since)).toBeNull()
    })

    it('pauses while the media disk is nearly full', async () => {
      const { diskHasRoom } = await import('@/lib/keep/worker')
      vi.stubEnv('KEEP_MIN_FREE_GB', '0')
      expect(await diskHasRoom()).toBe(true)
      vi.stubEnv('KEEP_MIN_FREE_GB', '1000000')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await diskHasRoom()).toBe(false)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('[keep] Paused'))
      warn.mockRestore()
    })

    it('records the files and marks the job done', async () => {
      save('youtube', 'abc')
      const file = path.join(mediaRoot, 'v.mp4')
      fs.writeFileSync(file, 'video!')
      const { keepPost } = await import('@/lib/keep/download')
      vi.mocked(keepPost).mockResolvedValue([
        { slot: 'video-1', file, mime: 'video/mp4', width: 1920, height: 1080, durationMs: 1000 },
      ])
      const { scanForNewSaves, claimNext, runJob } = await import('@/lib/keep/worker')
      scanForNewSaves()
      const job = claimNext()!
      await runJob(job.platform, job.postId)
      const row = testInstance.sqlite.prepare(`SELECT * FROM keep_jobs`).get() as {
        status: string
        bytes: number
      }
      expect(row).toMatchObject({ status: 'done', bytes: 6 })
      const { keptFile } = await import('@/lib/keep/store')
      expect(keptFile('youtube', 'abc', 'video-1')).toMatchObject({ width: 1920, path: 'v.mp4' })
    })

    it('drops the percent while a downloaded video is re-encoded, so it never sits at 99%', async () => {
      save('youtube', 'vp9')
      const { keepPost } = await import('@/lib/keep/download')
      const progress = await import('@/lib/keep/progress')
      const seen: Array<{ percent: number | null; converting: boolean }> = []
      const look = () =>
        seen.push({
          percent: progress.keepProgress('youtube', 'vp9'),
          converting: progress.isKeepConverting('youtube', 'vp9'),
        })
      vi.mocked(keepPost).mockImplementation(async (t) => {
        t.onProgress?.(100)
        look()
        t.onConverting?.()
        look()
        return []
      })
      const { scanForNewSaves, claimNext, runJob } = await import('@/lib/keep/worker')
      scanForNewSaves()
      const job = claimNext()!
      await runJob(job.platform, job.postId)
      look()
      expect(seen).toEqual([
        { percent: 99, converting: false },
        { percent: null, converting: true },
        { percent: null, converting: false },
      ])
    })

    it('retries a failure later, and gives up at once when there is nothing to keep', async () => {
      save('youtube', 'flaky')
      save('vimeo', 'drm')
      const { keepPost, NothingToKeep } = await import('@/lib/keep/download')
      vi.mocked(keepPost).mockImplementation(async (t) => {
        if (t.platform === 'vimeo') throw new NothingToKeep('DRM')
        throw new Error('network down')
      })
      const { scanForNewSaves, claimNext, runJob } = await import('@/lib/keep/worker')
      scanForNewSaves()
      for (let job = claimNext(); job; job = claimNext()) await runJob(job.platform, job.postId)
      const rows = testInstance.sqlite
        .prepare(
          `SELECT post_id, status, attempts, next_attempt_at FROM keep_jobs ORDER BY post_id`,
        )
        .all() as Array<{ post_id: string; status: string; next_attempt_at: string | null }>
      expect(rows[0]).toMatchObject({
        post_id: 'drm',
        status: 'unavailable',
        next_attempt_at: null,
      })
      expect(rows[1]).toMatchObject({ post_id: 'flaky', status: 'failed' })
      expect(Date.parse(rows[1].next_attempt_at!)).toBeGreaterThan(Date.now())
      // Not due yet, so nothing to claim.
      expect(claimNext()).toBeNull()
    })

    it('deletes files nobody has saved any more', async () => {
      keep('youtube', 'gone', 'video-1', 'x', 'video/mp4')
      testInstance.sqlite
        .prepare(
          `INSERT INTO keep_jobs (platform, post_id, status, attempts, updated_at) VALUES ('youtube', 'gone', 'done', 0, ?)`,
        )
        .run(now())
      const { postDir } = await import('@/lib/keep/store')
      const dir = path.join(mediaRoot, postDir('youtube', 'gone'))
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'video-1.mp4'), 'x')
      const { cleanUp } = await import('@/lib/keep/worker')
      expect(await cleanUp()).toBe(1)
      expect(fs.existsSync(dir)).toBe(false)
      expect(testInstance.sqlite.prepare(`SELECT count(*) AS n FROM kept_files`).get()).toEqual({
        n: 0,
      })
    })
  })

  describe('postDir', () => {
    it('keeps ids filesystem-safe and distinct', async () => {
      const { postDir } = await import('@/lib/keep/store')
      expect(postDir('soundcloud', 'forss~flickermood')).toMatch(
        /^soundcloud\/forss_flickermood-[0-9a-f]{8}$/,
      )
      expect(postDir('x', 'a/b')).not.toBe(postDir('x', 'a_b'))
      expect(() => postDir('../etc', 'x')).toThrow()
    })
  })
})
