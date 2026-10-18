import { describe, it, expect } from 'vitest'
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
