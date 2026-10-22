import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { isPermanent, isSignInOnly } from '@/lib/keep/ytdlp'

describe('which yt-dlp failures are final', () => {
  it('gives up on videos that are gone, private or locked', () => {
    for (const message of [
      '[youtube] BaW_jenozKc: This video is unavailable',
      '[youtube] x: Video unavailable',
      '[vimeo] 76979871: This format is DRM protected; Try selecting another format',
      '[youtube] x: Private video. Sign in if you have access',
      '[TikTok] x: This post is private',
      '[twitter] x: No video could be found in this tweet',
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

describe('which yt-dlp failures need a signed-in account', () => {
  it('recognises each network’s login wall', () => {
    for (const message of [
      '[TikTok] 7699168500253854998: This post may not be comfortable for some audiences. Log in for access. Use --cookies-from-browser or --cookies for the authentication.',
      '[youtube] x: Sign in to confirm your age. This video may be inappropriate for some users.',
      '[Instagram] DbaFQ90SWzo: Requested content is not available, rate-limit reached or login required. Use --cookies-from-browser or --cookies for the authentication.',
      '[facebook] 1: This video is only available for registered users. Use --cookies-from-browser or --cookies for the authentication.',
      '[LinkedIn] 1: You must log in to view this post',
    ]) {
      expect(isSignInOnly(message), message).toBe(true)
    }
  })

  it('leaves private posts and other failures alone', () => {
    for (const message of [
      '[youtube] x: Private video. Sign in if you have access to this video. Use --cookies-from-browser or --cookies for the authentication.',
      '[TikTok] x: This post is private',
      'HTTP Error 429: Too Many Requests',
      '[youtube] x: Video unavailable',
    ]) {
      expect(isSignInOnly(message), message).toBe(false)
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

  it('hands it a private copy of the cookies file, and removes the copy after', async () => {
    vi.resetModules()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhx-owner-'))
    const owners = path.join(dir, 'cookies.txt')
    fs.writeFileSync(
      owners,
      '# Netscape HTTP Cookie File\n.tiktok.com\tTRUE\t/\tTRUE\t0\tsid\tabc\n',
    )
    const seen: { args: string[]; copy: string | null }[] = []
    vi.doMock('child_process', () => ({
      execFile: (
        _bin: string,
        args: string[],
        _opts: unknown,
        done: (e: null, out: string) => void,
      ) => {
        const at = args.indexOf('--cookies')
        const copy = at >= 0 ? args[at + 1] : null
        // yt-dlp rewrites the file it's given; the owner's must stay as it was.
        if (copy) fs.writeFileSync(copy, 'rewritten by yt-dlp')
        seen.push({ args, copy })
        done(null, '{}')
        return { stdout: null, stderr: null }
      },
    }))
    vi.doMock('@/lib/media/ffmpeg', () => ({ ffmpegPath: async () => '/usr/bin/ffmpeg' }))
    vi.stubEnv('YTDLP_COOKIES', owners)
    try {
      const { ytdlpInfo } = await import('@/lib/keep/ytdlp')
      await ytdlpInfo('https://www.tiktok.com/@a/video/1')
      const [{ args, copy }] = seen
      expect(copy).toBeTruthy()
      expect(copy).not.toBe(owners)
      expect(args.slice(-2)).toEqual(['--', 'https://www.tiktok.com/@a/video/1'])
      expect(fs.existsSync(copy!)).toBe(false)
      expect(fs.readFileSync(owners, 'utf8')).toContain('sid\tabc')

      // A missing file: run without, as if unset.
      vi.stubEnv('YTDLP_COOKIES', path.join(dir, 'gone.txt'))
      await ytdlpInfo('https://www.tiktok.com/@a/video/2')
      expect(seen[1].args).not.toContain('--cookies')
    } finally {
      vi.unstubAllEnvs()
      fs.rmSync(dir, { recursive: true, force: true })
      vi.doUnmock('child_process')
      vi.doUnmock('@/lib/media/ffmpeg')
    }
  })
})
