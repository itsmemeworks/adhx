import { describe, it, expect } from 'vitest'
import { authorProfileUrl } from '@/lib/activity/preview-path'

/**
 * Round 8: the theater's tappable author row links here so a viewer can
 * jump to the rest of that creator's content on their own platform.
 */
describe('authorProfileUrl', () => {
  it('builds the X profile URL by default (twitter)', () => {
    expect(authorProfileUrl('twitter', 'naval')).toBe('https://x.com/naval')
  })

  it('builds the Instagram profile URL', () => {
    expect(authorProfileUrl('instagram', 'someone')).toBe('https://www.instagram.com/someone/')
  })

  it('builds the TikTok profile URL, stripping a leading "@" (stored with one)', () => {
    expect(authorProfileUrl('tiktok', '@dancer')).toBe('https://www.tiktok.com/@dancer')
  })

  it('builds the YouTube channel URL', () => {
    expect(authorProfileUrl('youtube', 'channelname')).toBe('https://www.youtube.com/@channelname')
  })

  it('strips a leading "@" for X/Instagram/YouTube too, not just TikTok', () => {
    expect(authorProfileUrl('twitter', '@naval')).toBe('https://x.com/naval')
  })

  it('trims surrounding whitespace', () => {
    expect(authorProfileUrl('twitter', '  naval  ')).toBe('https://x.com/naval')
  })

  it('returns null for an empty or missing handle — nothing to link to', () => {
    expect(authorProfileUrl('twitter', '')).toBe(null)
    expect(authorProfileUrl('twitter', '   ')).toBe(null)
  })
})
