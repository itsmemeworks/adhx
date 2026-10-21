import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { ffmpegPath } from '@/lib/media/ffmpeg'
import { brightness, DARK_POSTER, posterFrame, posterTimes } from '@/lib/keep/poster'

/** Networks that give no poster (Reddit, Bluesky …) get a still from the video. */
describe('posterFrame', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-poster-'))
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('takes a still from a short clip, and gives up quietly on a broken file', async () => {
    const bin = await ffmpegPath()
    const clip = path.join(dir, 'clip.mp4')
    await new Promise<void>((resolve, reject) =>
      execFile(
        bin,
        [
          '-loglevel',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=64x96:rate=10',
          '-t',
          '1',
          '-pix_fmt',
          'yuv420p',
          clip,
        ],
        (e) => (e ? reject(e) : resolve()),
      ),
    )
    const still = await posterFrame(clip, 1000, path.join(dir, 'still.jpg'))
    expect(still).toBe(path.join(dir, 'still.jpg'))
    expect(fs.statSync(still!).size).toBeGreaterThan(100)

    const broken = path.join(dir, 'broken.mp4')
    fs.writeFileSync(broken, 'not a video')
    expect(await posterFrame(broken, null, path.join(dir, 'none.jpg'))).toBeNull()
  }, 30_000)

  it('looks past a black intro, so the cover is not a black tile', async () => {
    const bin = await ffmpegPath()
    const clip = path.join(dir, 'fade.mp4')
    await new Promise<void>((resolve, reject) =>
      execFile(
        bin,
        [
          '-loglevel',
          'error',
          '-y',
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
          clip,
        ],
        (e) => (e ? reject(e) : resolve()),
      ),
    )
    const still = await posterFrame(clip, 6000, path.join(dir, 'fade.jpg'))
    expect(still).not.toBeNull()
    expect(await brightness(still!)).toBeGreaterThan(DARK_POSTER)
    // No stray candidates left beside it.
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('fade.jpg.'))).toEqual([])
  }, 30_000)
})

describe('posterTimes', () => {
  it('looks a little way in first, then further, never past the end', () => {
    expect(posterTimes(null)).toEqual([1])
    expect(posterTimes(1000)).toEqual([0.5])
    expect(posterTimes(60_000)).toEqual([6, 15, 30, 1])
    expect(posterTimes(600_000)).toEqual([20, 150, 300, 1])
    expect(Math.max(...posterTimes(3000))).toBeLessThan(3)
  })
})
