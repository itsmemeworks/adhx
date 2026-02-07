import { describe, it, expect } from 'vitest'
import { parseShareUrl } from '@/lib/utils/parse-share-url'

/**
 * Share Page URL Parsing Tests
 *
 * Tests the URL parsing utility used by the PWA Share Target /share page.
 * Validates extraction of username and tweet ID from various URL formats.
 */

describe('parseShareUrl', () => {
  it('parses standard x.com URL', () => {
    expect(parseShareUrl('https://x.com/elonmusk/status/1234567890'))
      .toEqual({ username: 'elonmusk', id: '1234567890' })
  })

  it('parses standard twitter.com URL', () => {
    expect(parseShareUrl('https://twitter.com/jack/status/9876543210'))
      .toEqual({ username: 'jack', id: '9876543210' })
  })

  it('parses URL without https protocol', () => {
    expect(parseShareUrl('http://x.com/user/status/111'))
      .toEqual({ username: 'user', id: '111' })
  })

  it('parses URL without protocol', () => {
    expect(parseShareUrl('x.com/user/status/111'))
      .toEqual({ username: 'user', id: '111' })
  })

  it('parses URL with www prefix', () => {
    expect(parseShareUrl('https://www.x.com/user/status/111'))
      .toEqual({ username: 'user', id: '111' })
    expect(parseShareUrl('https://www.twitter.com/user/status/111'))
      .toEqual({ username: 'user', id: '111' })
  })

  it('parses URL with trailing query params', () => {
    expect(parseShareUrl('https://x.com/user/status/111?s=20&t=abc'))
      .toEqual({ username: 'user', id: '111' })
  })

  it('parses URL with trailing path segments', () => {
    expect(parseShareUrl('https://x.com/user/status/111/photo/1'))
      .toEqual({ username: 'user', id: '111' })
  })

  it('handles whitespace around URL', () => {
    expect(parseShareUrl('  https://x.com/user/status/111  '))
      .toEqual({ username: 'user', id: '111' })
  })

  it('handles usernames with underscores', () => {
    expect(parseShareUrl('https://x.com/my_user_name/status/111'))
      .toEqual({ username: 'my_user_name', id: '111' })
  })

  it('handles max length username (15 chars)', () => {
    expect(parseShareUrl('https://x.com/abcdefghijklmno/status/111'))
      .toEqual({ username: 'abcdefghijklmno', id: '111' })
  })

  it('returns null for non-tweet URLs', () => {
    expect(parseShareUrl('https://google.com')).toBeNull()
    expect(parseShareUrl('https://x.com/user')).toBeNull()
    expect(parseShareUrl('https://x.com/user/likes')).toBeNull()
    expect(parseShareUrl('not a url at all')).toBeNull()
    expect(parseShareUrl('')).toBeNull()
  })

  it('returns null for URLs with non-numeric tweet IDs', () => {
    expect(parseShareUrl('https://x.com/user/status/abc')).toBeNull()
  })

  it('is case insensitive for domain', () => {
    expect(parseShareUrl('https://X.COM/user/status/111'))
      .toEqual({ username: 'user', id: '111' })
    expect(parseShareUrl('https://Twitter.Com/user/status/111'))
      .toEqual({ username: 'user', id: '111' })
  })
})
