import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {
  createTestDb,
  createTestBookmark,
  USER_A,
  type TestDbInstance,
} from '@/__tests__/api/setup'
import * as schema from '@/lib/db/schema'
let instance: TestDbInstance
let dir: string
let replaceDuringFrame = false
let duringFrame: (() => void) | undefined
const executions: string[][] = []
vi.mock('@/lib/db', () => ({
  get db() {
    return instance.db
  },
  runInTransaction: <T>(fn: () => T) => instance.sqlite.transaction(fn)(),
}))
vi.mock('@/lib/media/ffmpeg', () => ({ ffmpegPath: async () => '/synthetic/ffmpeg' }))
vi.mock('@/lib/keep/probe', () => ({ probeMedia: async () => ({ width: 12, height: 12 }) }))
vi.mock('child_process', () => ({
  execFile: (_bin: string, args: string[], _opts: unknown, done: (e: null) => void) => {
    executions.push(args)
    duringFrame?.()
    duringFrame = undefined
    fs.copyFileSync(path.join(dir, 'bright.jpg'), args.at(-1)!)
    if (replaceDuringFrame) {
      replaceDuringFrame = false
      instance.sqlite
        .prepare(
          "UPDATE kept_files SET path='replacement.jpg',bytes=?,width=32,height=32,created_at='2099-01-01' WHERE slot='poster'",
        )
        .run(fs.statSync(path.join(dir, 'replacement.jpg')).size)
    }
    done(null)
  },
}))
import { repairDarkPosters, ensurePoster } from '@/lib/keep/poster'
import { setNewWorkPaused, newWorkPaused } from '@/lib/processing/pause'
beforeEach(async () => {
  instance = createTestDb()
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-review-posters-'))
  executions.length = 0
  replaceDuringFrame = false
  duringFrame = undefined
  vi.stubEnv('MEDIA_DIR', dir)
  vi.stubEnv('PROCESSING_MODE', 'local')
  instance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, '1')).run()
  await sharp({ create: { width: 12, height: 12, channels: 3, background: 'black' } })
    .jpeg()
    .toFile(path.join(dir, 'old.jpg'))
  await sharp({ create: { width: 12, height: 12, channels: 3, background: 'white' } })
    .jpeg()
    .toFile(path.join(dir, 'bright.jpg'))
  await sharp({ create: { width: 32, height: 32, channels: 3, background: 'blue' } })
    .jpeg({ quality: 93 })
    .toFile(path.join(dir, 'replacement.jpg'))
  fs.writeFileSync(path.join(dir, 'video.mp4'), 'synthetic original')
  instance.db
    .insert(schema.keptFiles)
    .values([
      {
        platform: 'twitter',
        postId: '1',
        slot: 'poster',
        path: 'old.jpg',
        mime: 'image/jpeg',
        bytes: fs.statSync(path.join(dir, 'old.jpg')).size,
        width: 12,
        height: 12,
        createdAt: '2026-10-21',
      },
      {
        platform: 'twitter',
        postId: '1',
        slot: 'video-1',
        path: 'video.mp4',
        mime: 'video/mp4',
        bytes: 18,
        width: 12,
        height: 12,
        durationMs: 5000,
        createdAt: '2026-10-21',
      },
    ])
    .run()
})
afterEach(() => {
  instance.close()
  vi.unstubAllEnvs()
  fs.rmSync(dir, { recursive: true, force: true })
})
it('defers local repair while paused, then resumes without consuming its marker', async () => {
  setNewWorkPaused(true)
  expect(newWorkPaused()).toBe(true)
  expect(await repairDarkPosters({ pauseMs: 0 })).toBe(0)
  expect(executions).toHaveLength(0)
  expect(instance.sqlite.prepare('SELECT count(*) AS n FROM keep_settings').get()).toEqual({ n: 0 })
  setNewWorkPaused(false)
  expect(await repairDarkPosters({ pauseMs: 0 })).toBe(1)
  const row = instance.sqlite
    .prepare("SELECT path,bytes,width FROM kept_files WHERE slot='poster'")
    .get() as { path: string; bytes: number; width: number }
  expect(row.path).not.toBe('old.jpg')
  expect(row.bytes).toBe(fs.statSync(path.join(dir, row.path)).size)
  expect(row.width).toBe(12)
  expect(fs.existsSync(path.join(dir, 'old.jpg'))).toBe(true) // A downloader can reuse this legacy path.
  expect(await repairDarkPosters({ pauseMs: 0 })).toBe(0)
})
it('discards a stale repair without touching replacement bytes or metadata', async () => {
  replaceDuringFrame = true
  expect(await repairDarkPosters({ pauseMs: 0 })).toBe(0)
  const row = instance.sqlite
    .prepare("SELECT path,bytes,width,created_at FROM kept_files WHERE slot='poster'")
    .get() as { path: string; bytes: number; width: number; created_at: string }
  expect(row.path).toBe('replacement.jpg')
  const actualBytes = fs.statSync(path.join(dir, row.path)).size
  expect(row.bytes).toBe(actualBytes)
  expect(row.width).toBe(32)
  expect(fs.readdirSync(dir).filter((f) => f.startsWith('poster-'))).toEqual([])
})

it('never decodes old or missing posters on a remote host', async () => {
  vi.stubEnv('PROCESSING_MODE', 'remote')
  expect(await repairDarkPosters({ pauseMs: 0 })).toBe(0)
  instance.sqlite.prepare("DELETE FROM kept_files WHERE slot='poster'").run()
  expect(await ensurePoster('twitter', '1')).toBeNull()
  expect(executions).toHaveLength(0)
  expect(instance.sqlite.prepare('SELECT count(*) AS n FROM keep_settings').get()).toEqual({ n: 0 })
})
it.each(['video', 'delete', 'pause'])(
  'rejects a repair when %s changes during decoding and removes scratch files',
  async (change) => {
    duringFrame = () => {
      if (change === 'video')
        instance.sqlite
          .prepare("UPDATE kept_files SET created_at='2099-01-01' WHERE slot='video-1'")
          .run()
      if (change === 'delete') instance.sqlite.prepare('DELETE FROM bookmarks').run()
      if (change === 'pause') setNewWorkPaused(true)
    }
    expect(await repairDarkPosters({ pauseMs: 0 })).toBe(0)
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('poster-'))).toEqual([])
    expect(fs.existsSync(path.join(dir, 'old.jpg'))).toBe(true)
    expect(
      instance.sqlite.prepare("SELECT path FROM kept_files WHERE slot='poster'").get(),
    ).toEqual({ path: 'old.jpg' })
  },
)
it('creates a missing poster once and keeps the published file', async () => {
  instance.sqlite.prepare("DELETE FROM kept_files WHERE slot='poster'").run()
  const [a, b] = await Promise.all([ensurePoster('twitter', '1'), ensurePoster('twitter', '1')])
  expect(a).toEqual(b)
  expect(a?.path).toMatch(/poster-/)
  expect(fs.existsSync(path.join(dir, a!.path))).toBe(true)
  expect(executions).toHaveLength(1)
})
