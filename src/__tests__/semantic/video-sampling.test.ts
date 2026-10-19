import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FeedItemResponse } from '@/lib/feed/build-item'
import { createTestDb, type TestDbInstance } from '../api/setup'

let testDb: TestDbInstance | undefined
vi.mock('@/lib/db', () => ({
  get db() {
    return testDb!.db
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  testDb?.close()
  testDb = undefined
})

describe('video inference budgets', () => {
  it.each(['0', '2', '17', '8.5', 'not-a-number'])(
    'uses the default for invalid budget %s',
    async (value) => {
      vi.stubEnv('SEMANTIC_VIDEO_MAX_FRAMES', value)
      vi.resetModules()
      const config = await import('@/lib/semantic/config')
      expect(config.VIDEO_MAX_FRAMES).toBe(16)
      expect(config.VIDEO_SAMPLING).toContain('whole-v2/max16/')
    },
  )

  it('invalidates opening-window video hashes without changing text, pictures or retained URLs', async () => {
    const item = {
      id: '100',
      platform: 'twitter',
      author: 'example',
      authorName: 'Example',
      text: 'A blue shape',
      links: null,
      articlePreview: null,
      articleContent: null,
      media: [
        {
          mediaType: 'video',
          url: '/api/files/twitter/100/video-1',
          thumbnailUrl: '/api/files/twitter/100/poster',
        },
      ],
    } as FeedItemResponse
    vi.stubEnv('SEMANTIC_VIDEO_MAX_FRAMES', '')
    vi.resetModules()
    const defaults = await import('@/lib/semantic/documents')
    const original = defaults.buildPostDocument(item)
    const expectedHash = createHash('sha256')
      .update('/api/files/twitter/100/video-1|fps0.5x16@32s/t70')
      .digest('hex')
      .slice(0, 32)
    expect(original.video?.hash).not.toBe(expectedHash)
    expect(original.video?.hash).toContain('whole-v2/max16/')
    vi.stubEnv('SEMANTIC_VIDEO_MAX_FRAMES', '8')
    vi.resetModules()
    const lighter = (await import('@/lib/semantic/documents')).buildPostDocument(item)
    expect(lighter.video?.hash).not.toBe(original.video?.hash)
    expect(lighter.textHash).toBe(original.textHash)
    expect(lighter.image?.hash).toBe(original.image?.hash)
    expect(lighter.video?.url).toBe(original.video?.url)
  })

  it('bounds sampling work for short clips and very long videos', async () => {
    vi.stubEnv('SEMANTIC_VIDEO_MAX_FRAMES', '8')
    vi.resetModules()
    const { videoSamplePlan } = await import('@/lib/semantic/media')
    expect(videoSamplePlan(0.5)).toEqual({ count: 1, secondsPerFrame: 0.5 })
    expect(videoSamplePlan(4)).toEqual({ count: 2, secondsPerFrame: 2 })
    expect(videoSamplePlan(7200)).toEqual({ count: 8, secondsPerFrame: 900 })
    for (const duration of [0, -1, NaN, Infinity])
      expect(() => videoSamplePlan(duration)).toThrow('duration')
  })

  it.each([4, 8, 16])(
    'samples %i downsized frames without altering the retained source',
    async (budget) => {
      const root = mkdtempSync(join(tmpdir(), 'adhx-video-budget-'))
      try {
        vi.stubEnv('SEMANTIC_VIDEO_MAX_FRAMES', String(budget))
        vi.stubEnv('MEDIA_DIR', root)
        vi.resetModules()
        testDb = createTestDb()
        const { ffmpegPath } = await import('@/lib/media/ffmpeg')
        const binary = await ffmpegPath()
        const originalPath = join(root, 'original.mp4')
        execFileSync(
          binary,
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-f',
            'lavfi',
            '-i',
            'color=c=red:s=896x504:r=1:d=40[red];color=c=green:s=896x504:r=1:d=40[green];color=c=blue:s=896x504:r=1:d=40[blue];[red][green][blue]concat=n=3:v=1:a=0',
            '-g',
            '2',
            '-c:v',
            'libx264',
            '-threads',
            '1',
            '-pix_fmt',
            'yuv420p',
            originalPath,
          ],
          { timeout: 10_000 },
        )
        const before = createHash('sha256').update(readFileSync(originalPath)).digest('hex')
        testDb.sqlite
          .prepare(
            `INSERT INTO kept_files (platform, post_id, slot, path, mime, bytes, created_at) VALUES ('twitter', '100', 'video-1', 'original.mp4', 'video/mp4', ?, ?)`,
          )
          .run(readFileSync(originalPath).length, new Date().toISOString())
        const { sampleVideoFrames } = await import('@/lib/semantic/media')
        const sampled = await sampleVideoFrames('/api/files/twitter/100/video-1')
        try {
          expect(sampled.files).toHaveLength(budget)
          expect(sampled.duration).toBe(120)
          expect(sampled.secondsPerFrame).toBe(120 / budget)
          const { probeMedia } = await import('@/lib/keep/probe')
          expect((await probeMedia(sampled.files[0])).width).toBe(448)
          expect(createHash('sha256').update(readFileSync(originalPath)).digest('hex')).toBe(before)
          // Blue exists only after 80 seconds: a first-32-seconds sampler fails this.
          const pixel = (file: string) =>
            execFileSync(
              binary,
              [
                '-v',
                'error',
                '-i',
                file,
                '-vf',
                'scale=1:1',
                '-frames:v',
                '1',
                '-f',
                'rawvideo',
                '-pix_fmt',
                'rgb24',
                '-',
              ],
              { timeout: 10_000 },
            )
          const first = pixel(sampled.files[0])
          const last = pixel(sampled.files.at(-1)!)
          expect(first[0]).toBeGreaterThan(first[2] + 100)
          expect(last[2]).toBeGreaterThan(last[0] + 100)
        } finally {
          await sampled.cleanup()
        }
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
    30_000,
  )
})
