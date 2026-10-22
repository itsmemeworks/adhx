import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Keeping an X post: a video X took down after a copyright claim stops the
 * retries (and the rest of the post is still kept), and a post FxTwitter
 * can't read falls back to yt-dlp.
 */

const fetchTweetData = vi.fn()
vi.mock('@/lib/media/fxembed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/fxembed')>()),
  fetchTweetData: (...args: unknown[]) => fetchTweetData(...args),
}))

const ytdlpDownload = vi.fn()
vi.mock('@/lib/keep/ytdlp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/keep/ytdlp')>()),
  ytdlpDownload: (...args: unknown[]) => ytdlpDownload(...args),
}))

// Photos download; the video's file answers X's "Dmcaed".
vi.mock('@/lib/keep/fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/keep/fetch')>()
  return {
    ...actual,
    downloadTo: vi.fn(async (url: string, _hosts: string[], file: string) => {
      if (url.includes('video.twimg.com')) throw new actual.TakenDown()
      fs.writeFileSync(file, 'jpg')
    }),
  }
})

vi.mock('@/lib/keep/probe', () => ({
  probeMedia: vi.fn(async (file: string) =>
    file.endsWith('.mp4')
      ? {
          hasVideo: true,
          hasAudio: true,
          width: 704,
          height: 480,
          durationMs: 1000,
          videoCodec: 'h264',
        }
      : { hasVideo: false, hasAudio: false, width: 800, height: 600, durationMs: null },
  ),
}))
vi.mock('@/lib/keep/poster', () => ({ posterFrame: vi.fn(async () => null) }))

const tweet = (all: { type: string; url: string }[]) => ({
  code: 200,
  message: 'OK',
  tweet: { id: '1', text: 'x', media: { all } },
})
const video = { type: 'video', url: 'https://video.twimg.com/amplify_video/1/vid/a.mp4' }
const photo = { type: 'photo', url: 'https://pbs.twimg.com/media/a.jpg' }
const target = { platform: 'twitter', postId: '1', author: 'velesxbt', category: 'video' }

let media: string
beforeEach(() => {
  media = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-keep-x-'))
  vi.stubEnv('MEDIA_DIR', media)
  vi.stubEnv('KEEP_H264', 'off')
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(media, { recursive: true, force: true })
})

describe('keeping an X post', () => {
  it('stops retrying a video X took down after a copyright claim', async () => {
    fetchTweetData.mockResolvedValue(tweet([video]))
    const { keepPost, NothingToKeep } = await import('@/lib/keep/download')
    const kept = keepPost(target)
    await expect(kept).rejects.toBeInstanceOf(NothingToKeep)
    await expect(kept).rejects.toThrow(/copyright claim/)
  })

  it('keeps the photos next to a taken-down video', async () => {
    fetchTweetData.mockResolvedValue(tweet([photo, video]))
    const { keepPost } = await import('@/lib/keep/download')
    const kept = await keepPost(target)
    expect(kept.map((k) => k.slot)).toEqual(['photo-1'])
  })

  it('asks yt-dlp when FxTwitter can’t read the post', async () => {
    fetchTweetData.mockResolvedValue(null)
    ytdlpDownload.mockImplementation(async (_url: string, dir: string) => {
      const file = path.join(dir, 'v1.mp4')
      fs.writeFileSync(file, 'mp4')
      return [{ index: 1, file, poster: null }]
    })
    const { keepPost } = await import('@/lib/keep/download')
    const kept = await keepPost(target)
    expect(ytdlpDownload).toHaveBeenCalledWith(
      'https://x.com/velesxbt/status/1',
      expect.any(String),
      expect.any(Object),
    )
    expect(kept.map((k) => k.slot)).toEqual(['video-1'])
  })

  it('keeps FxTwitter’s reason when yt-dlp can’t help, unless X wants a sign-in', async () => {
    const { YtdlpError } = await import('@/lib/keep/ytdlp')
    const { keepPost, NothingToKeep } = await import('@/lib/keep/download')

    fetchTweetData.mockResolvedValue({ code: 404, message: 'NOT_FOUND', tweet: null })
    ytdlpDownload.mockRejectedValue(new YtdlpError('No video could be found in this tweet'))
    await expect(keepPost(target)).rejects.toBeInstanceOf(NothingToKeep)

    ytdlpDownload.mockRejectedValue(
      new YtdlpError(
        'Requested tweet requires authentication. Use --cookies-from-browser or --cookies for the authentication.',
      ),
    )
    await expect(keepPost(target)).rejects.toBeInstanceOf(YtdlpError)
  })
})
