import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Keeping a YouTube/Vimeo/Twitch/SoundCloud post whose video yt-dlp can't get
 * (DRM, gone): the failure is reported, never kept as "a photo" of the page's
 * preview image. A picture network still falls back to its preview images.
 */

const ytdlpDownload = vi.fn()
vi.mock('@/lib/keep/ytdlp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/keep/ytdlp')>()),
  ytdlpInfo: vi.fn(async () => ({ formats: [{ vcodec: 'avc1', acodec: 'mp4a' }] })),
  ytdlpDownload: (...args: unknown[]) => ytdlpDownload(...args),
}))
vi.mock('@/lib/keep/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/keep/fetch')>()),
  openGraph: vi.fn(async () => ({ images: ['https://i.vimeocdn.com/video/1.jpg'], videos: [] })),
  downloadTo: vi.fn(async (_url: string, _hosts: string[], file: string) => {
    fs.writeFileSync(file, 'jpg')
  }),
}))

let media: string
beforeEach(() => {
  media = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-keep-'))
  vi.stubEnv('MEDIA_DIR', media)
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(media, { recursive: true, force: true })
})

describe('keeping a video-only post yt-dlp can’t download', () => {
  it('reports the failure instead of keeping the preview image', async () => {
    const { YtdlpError } = await import('@/lib/keep/ytdlp')
    ytdlpDownload.mockRejectedValue(new YtdlpError('ERROR: This format is DRM protected', true))
    const { keepPost } = await import('@/lib/keep/download')
    await expect(
      keepPost({ platform: 'vimeo', postId: '76979871', author: 'vimeo', category: 'video' }),
    ).rejects.toThrow(/DRM/)
  })

  it('never archives a private post’s login-page image as the post', async () => {
    const { YtdlpError } = await import('@/lib/keep/ytdlp')
    ytdlpDownload.mockRejectedValue(new YtdlpError('This post is private', true))
    const { keepPost } = await import('@/lib/keep/download')
    await expect(
      keepPost({ platform: 'tiktok', postId: '123', author: 'test', category: 'video' }),
    ).rejects.toThrow(/private/)
  })

  it('retries a TikTok that failed for a reason other than the post', async () => {
    ytdlpDownload.mockRejectedValue(new Error('FFmpeg is unavailable'))
    const { keepPost } = await import('@/lib/keep/download')
    await expect(
      keepPost({ platform: 'tiktok', postId: '123', author: 'test', category: 'video' }),
    ).rejects.toThrow(/FFmpeg/)
  })

  it('still keeps a picture network’s preview images', async () => {
    const { YtdlpError } = await import('@/lib/keep/ytdlp')
    ytdlpDownload.mockRejectedValue(new YtdlpError('ERROR: No video formats found', true))
    const { keepPost } = await import('@/lib/keep/download')
    const kept = await keepPost({
      platform: 'pinterest',
      postId: '1',
      author: 'x',
      category: 'photo',
    })
    expect(kept.map((k) => k.slot)).toEqual(['photo-1'])
  })
})
