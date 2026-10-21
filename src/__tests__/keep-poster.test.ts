import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { ffmpegPath } from '@/lib/media/ffmpeg'
import { posterFrame } from '@/lib/keep/poster'

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
})
