import { describe, it, expect, vi } from 'vitest'
import { isPermanent } from '@/lib/keep/ytdlp'

describe('which yt-dlp failures are final', () => {
  it('gives up on videos that are gone, private or locked', () => {
    for (const message of [
      '[youtube] BaW_jenozKc: This video is unavailable',
      '[youtube] x: Video unavailable',
      '[vimeo] 76979871: This format is DRM protected; Try selecting another format',
      '[youtube] x: Private video. Sign in if you have access',
    ]) {
      expect(isPermanent(message), message).toBe(true)
    }
  })

  it('tries again after network trouble', () => {
    for (const message of [
      'Unable to download webpage: <urlopen error timed out>',
      'HTTP Error 429: Too Many Requests',
    ]) {
      expect(isPermanent(message), message).toBe(false)
    }
  })
})

describe('running yt-dlp', () => {
  it('gives it the Node running ADHX for YouTube’s player challenges', async () => {
    vi.resetModules()
    const calls: string[][] = []
    vi.doMock('child_process', () => ({
      execFile: (
        _bin: string,
        args: string[],
        _opts: unknown,
        done: (e: null, out: string) => void,
      ) => {
        calls.push(args)
        done(null, '{}')
        return { stdout: null, stderr: null }
      },
    }))
    vi.doMock('@/lib/media/ffmpeg', () => ({ ffmpegPath: async () => '/usr/bin/ffmpeg' }))
    const { ytdlpInfo } = await import('@/lib/keep/ytdlp')
    await ytdlpInfo('https://www.youtube.com/watch?v=x')
    const args = calls[0]
    expect(args[args.indexOf('--js-runtimes') + 1]).toBe(`node:${process.execPath}`)
    expect(args.slice(-2)).toEqual(['--', 'https://www.youtube.com/watch?v=x'])
    vi.doUnmock('child_process')
    vi.doUnmock('@/lib/media/ffmpeg')
  })
})
