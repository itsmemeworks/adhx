import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, type TestDbInstance } from '../api/setup'

let testInstance: TestDbInstance
vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-repair-'))
process.env['MEDIA_DIR'] = dir
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

const { ffmpegPath } = await import('@/lib/media/ffmpeg')
const { brightness, DARK_POSTER, repairDarkPosters } = await import('@/lib/keep/poster')

function ffmpeg(args: string[]): Promise<void> {
  return ffmpegPath().then(
    (bin) =>
      new Promise<void>((resolve, reject) =>
        execFile(bin, ['-loglevel', 'error', '-y', ...args], (e) => (e ? reject(e) : resolve())),
      ),
  )
}

function keep(postId: string, slot: string, file: string, durationMs: number | null) {
  testInstance.db
    .insert(schema.keptFiles)
    .values({
      platform: 'twitter',
      postId,
      slot,
      path: file,
      mime: slot === 'poster' ? 'image/jpeg' : 'video/mp4',
      bytes: fs.statSync(path.join(dir, file)).size,
      width: 64,
      height: 96,
      durationMs,
      createdAt: '2026-10-01T00:00:00.000Z',
    })
    .run()
}

beforeEach(() => {
  testInstance = createTestDb()
})

describe('repairDarkPosters', () => {
  it('remakes a black poster from its video once, and leaves good ones alone', async () => {
    fs.mkdirSync(path.join(dir, 'twitter'), { recursive: true })
    // A video that opens on two seconds of black, with the network's black first frame as its poster.
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=black:size=64x96:rate=10:duration=2',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=64x96:rate=10:duration=4',
      '-filter_complex',
      '[0:v][1:v]concat=n=2:v=1[v]',
      '-map',
      '[v]',
      '-pix_fmt',
      'yuv420p',
      path.join(dir, 'twitter/dark.mp4'),
    ])
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'color=black:size=64x96',
      '-frames:v',
      '1',
      path.join(dir, 'twitter/dark.jpg'),
    ])
    // A bright poster that must not be touched.
    await ffmpeg([
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=64x96',
      '-frames:v',
      '1',
      path.join(dir, 'twitter/fine.jpg'),
    ])
    fs.copyFileSync(path.join(dir, 'twitter/dark.mp4'), path.join(dir, 'twitter/fine.mp4'))
    testInstance.db
      .insert(schema.bookmarks)
      .values(['dark', 'fine'].map((id) => createTestBookmark(USER_A, id)))
      .run()
    keep('dark', 'video-1', 'twitter/dark.mp4', 6000)
    keep('dark', 'poster', 'twitter/dark.jpg', null)
    keep('fine', 'video-1', 'twitter/fine.mp4', 6000)
    keep('fine', 'poster', 'twitter/fine.jpg', null)
    const fineBefore = fs.readFileSync(path.join(dir, 'twitter/fine.jpg'))

    expect(await brightness(path.join(dir, 'twitter/dark.jpg'))).toBeLessThan(DARK_POSTER)
    expect(await repairDarkPosters({ pauseMs: 0 })).toBe(1)
    expect(fs.readFileSync(path.join(dir, 'twitter/fine.jpg')).equals(fineBefore)).toBe(true)
    const row = testInstance.db
      .select()
      .from(schema.keptFiles)
      .all()
      .find((r) => r.postId === 'dark' && r.slot === 'poster')
    expect(await brightness(path.join(dir, row!.path))).toBeGreaterThan(DARK_POSTER)
    expect(await brightness(path.join(dir, 'twitter/dark.jpg'))).toBeLessThan(DARK_POSTER)
    expect(row?.createdAt).not.toBe('2026-10-01T00:00:00.000Z')

    // Once per server.
    expect(await repairDarkPosters({ pauseMs: 0 })).toBe(0)
  }, 60_000)
})
