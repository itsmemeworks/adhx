import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from '../api/setup'

/**
 * Sampling video frames for a post whose download is over without a video:
 * a sound (SoundCloud), pictures, or a video that couldn't be downloaded
 * (Vimeo DRM). Each is settled at once instead of retried for hours.
 */

let testInstance: TestDbInstance
vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

const now = () => new Date().toISOString()
const kept = (platform: string, id: string, slot: string) =>
  testInstance.sqlite
    .prepare(
      `INSERT INTO kept_files (platform, post_id, slot, path, mime, bytes, created_at) VALUES (?, ?, ?, ?, 'x', 1, ?)`,
    )
    .run(platform, id, slot, `${platform}/${id}/${slot}`, now())
const job = (platform: string, id: string, status: string) =>
  testInstance.sqlite
    .prepare(
      `INSERT INTO keep_jobs (platform, post_id, status, attempts, updated_at) VALUES (?, ?, ?, 0, ?)`,
    )
    .run(platform, id, status, now())

beforeEach(() => {
  testInstance = createTestDb()
  vi.stubEnv('MEDIA_DIR', '/nonexistent-adhx-media')
})
afterEach(() => {
  vi.unstubAllEnvs()
  testInstance.close()
})

describe('sampleVideoFrames with no video to sample', () => {
  it('calls a sound a sound', async () => {
    job('soundcloud', 'a~b', 'done')
    kept('soundcloud', 'a~b', 'audio-1')
    const { sampleVideoFrames, NotAVideoError } = await import('@/lib/semantic/media')
    await expect(sampleVideoFrames('/api/files/soundcloud/a~b/video-1')).rejects.toBeInstanceOf(
      NotAVideoError,
    )
  })

  it('calls a post kept as pictures not a video', async () => {
    job('vimeo', '1', 'done')
    kept('vimeo', '1', 'photo-1')
    const { sampleVideoFrames, NotAVideoError } = await import('@/lib/semantic/media')
    await expect(sampleVideoFrames('/api/files/vimeo/1/video-1')).rejects.toBeInstanceOf(
      NotAVideoError,
    )
  })

  it('gives up on a video that couldn’t be downloaded', async () => {
    job('vimeo', '2', 'unavailable')
    const { sampleVideoFrames, MediaGoneError } = await import('@/lib/semantic/media')
    await expect(sampleVideoFrames('/api/files/vimeo/2/video-1')).rejects.toBeInstanceOf(
      MediaGoneError,
    )
  })
})
