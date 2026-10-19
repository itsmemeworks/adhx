import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * describeNetworkPost when yt-dlp can't read the post: picture networks fall
 * back to the page's preview tags, but a YouTube/Vimeo/Twitch/SoundCloud post
 * is always a video or a sound, never "a photo" of its thumbnail.
 */

const ytdlpInfo = vi.fn()
const pageOpenGraph = vi.fn()

vi.mock('@/lib/keep/ytdlp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/keep/ytdlp')>()),
  ytdlpInfo: (...args: unknown[]) => ytdlpInfo(...args),
}))

vi.mock('@/lib/keep/download', () => ({
  MEDIA_ONLY: new Set(['youtube', 'vimeo', 'twitch', 'soundcloud']),
  startUrl: async ({ platform, postId }: { platform: string; postId: string }) =>
    `https://${platform}.test/${postId}`,
  pageOpenGraph: (...args: unknown[]) => pageOpenGraph(...args),
}))

const og = {
  title: 'Charlie bit my finger - again !',
  description: 'Even had I done so…',
  images: ['https://i.ytimg.com/vi/x/hqdefault.jpg'],
}

beforeEach(() => {
  vi.clearAllMocks()
  pageOpenGraph.mockResolvedValue(og)
})

describe('describeNetworkPost when yt-dlp fails', () => {
  it('gives up on a video-only network when yt-dlp says the video is gone', async () => {
    const { YtdlpError } = await import('@/lib/keep/ytdlp')
    ytdlpInfo.mockRejectedValue(new YtdlpError('[youtube] x: Video unavailable', true))
    const { describeNetworkPost } = await import('@/lib/keep/describe')
    expect(await describeNetworkPost('youtube', '_OBlgSz8sSM', undefined)).toBeNull()
    expect(pageOpenGraph).not.toHaveBeenCalled()
  })

  it('keeps a video-only post a video when yt-dlp only failed for now', async () => {
    const { YtdlpError } = await import('@/lib/keep/ytdlp')
    ytdlpInfo.mockRejectedValue(new YtdlpError('Sign in to confirm you’re not a bot', false))
    const { describeNetworkPost } = await import('@/lib/keep/describe')
    expect(await describeNetworkPost('vimeo', '76979871', undefined)).toMatchObject({
      category: 'video',
      videos: 1,
      photos: 0,
      text: `${og.title}\n\n${og.description}`,
    })
    expect(await describeNetworkPost('soundcloud', 'a~b', undefined)).toMatchObject({
      category: 'video',
      audioOnly: true,
    })
  })

  it('still reads a picture network’s preview as photos', async () => {
    const { YtdlpError } = await import('@/lib/keep/ytdlp')
    ytdlpInfo.mockRejectedValue(new YtdlpError('No video formats found', true))
    const { describeNetworkPost } = await import('@/lib/keep/describe')
    expect(await describeNetworkPost('pinterest', '123', undefined)).toMatchObject({
      category: 'photo',
      videos: 0,
      photos: 1,
    })
  })
})

describe('describeNetworkPost words', () => {
  it('never turns encoded tags in a caption back into real ones', async () => {
    ytdlpInfo.mockResolvedValue({
      title: 'Cats &lt;script&gt;alert(1)&lt;/script&gt; &amp; dogs',
      description: '<p>line one<br>line two</p>&lt;&lt;i&gt;script&gt;x',
      uploader_id: '@pets',
      formats: [{ vcodec: 'avc1', acodec: 'mp4a', height: 720 }],
    })
    const { describeNetworkPost } = await import('@/lib/keep/describe')
    const post = await describeNetworkPost('youtube', 'abcdefghijk', undefined)
    expect(post?.text).toMatch(/^Cats alert\(1\) & dogs\n\nline one\nline two/)
    expect(post?.text).not.toMatch(/<[a-z/]/i)
  })
})
