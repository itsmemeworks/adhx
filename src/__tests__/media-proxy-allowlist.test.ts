import { describe, expect, it } from 'vitest'
import { isAllowedHlsUrl, isAllowedTwitterMediaUrl, makeHostAllowlist } from '@/lib/media/proxy'

describe('makeHostAllowlist', () => {
  it('allows an exact host match', () => {
    const isAllowed = makeHostAllowlist(['video.twimg.com'])
    expect(isAllowed('https://video.twimg.com/foo.mp4')).toBe(true)
  })

  it('allows a dot-prefixed suffix match for subdomains', () => {
    const isAllowed = makeHostAllowlist(['.twimg.com'])
    expect(isAllowed('https://video.twimg.com/foo.mp4')).toBe(true)
    expect(isAllowed('https://pbs.twimg.com/foo.jpg')).toBe(true)
  })

  it('rejects a domain that merely ends with the trusted suffix (attacker-controlled prefix)', () => {
    const isAllowed = makeHostAllowlist(['.twimg.com'])
    expect(isAllowed('https://evil.twimg.com.attacker.com/foo.mp4')).toBe(false)
  })

  it('rejects a host that only superficially resembles the trusted domain', () => {
    const isAllowed = makeHostAllowlist(['twimg.com', '.twimg.com'])
    expect(isAllowed('https://nottwimg.com/foo.mp4')).toBe(false)
  })

  it('rejects non-https URLs even for an otherwise-trusted host', () => {
    const isAllowed = makeHostAllowlist(['video.twimg.com'])
    expect(isAllowed('http://video.twimg.com/foo.mp4')).toBe(false)
  })

  it('returns false on unparseable input instead of throwing', () => {
    const isAllowed = makeHostAllowlist(['video.twimg.com'])
    expect(isAllowed('not a url')).toBe(false)
  })
})

describe('isAllowedTwitterMediaUrl', () => {
  it('allows the Twitter media CDN hosts', () => {
    expect(isAllowedTwitterMediaUrl('https://video.twimg.com/ext_tw_video/1/pu/vid/foo.mp4')).toBe(
      true,
    )
    expect(isAllowedTwitterMediaUrl('https://pbs.twimg.com/media/foo.jpg')).toBe(true)
  })

  it('rejects lookalike and non-https hosts', () => {
    expect(isAllowedTwitterMediaUrl('https://evil.twimg.com.attacker.com/foo.mp4')).toBe(false)
    expect(isAllowedTwitterMediaUrl('http://video.twimg.com/foo.mp4')).toBe(false)
  })
})

describe('isAllowedHlsUrl', () => {
  it('allows video.twimg.com and twitter.com playlist/segment URLs', () => {
    expect(isAllowedHlsUrl('https://video.twimg.com/playlist.m3u8')).toBe(true)
    expect(isAllowedHlsUrl('https://api.twitter.com/segment.ts')).toBe(true)
  })

  it('rejects a lookalike host', () => {
    expect(isAllowedHlsUrl('https://evil.twimg.com.attacker.com/playlist.m3u8')).toBe(false)
    expect(isAllowedHlsUrl('https://nottwimg.com/playlist.m3u8')).toBe(false)
  })

  it('rejects a non-https URL for an otherwise-trusted host', () => {
    expect(isAllowedHlsUrl('http://video.twimg.com/playlist.m3u8')).toBe(false)
  })
})
