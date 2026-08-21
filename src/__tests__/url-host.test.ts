import { describe, it, expect } from 'vitest'
import { isHostOrSubdomainOf } from '@/lib/utils/url-host'

/**
 * `isHostOrSubdomainOf` replaces `url.includes('domain.com')`-style domain
 * checks (js/incomplete-url-substring-sanitization) with real hostname
 * parsing — exact match or a genuine `.`-prefixed subdomain, never a raw
 * substring.
 */
describe('isHostOrSubdomainOf', () => {
  it('matches the exact domain', () => {
    expect(isHostOrSubdomainOf('https://twitter.com/user/status/1', ['twitter.com'])).toBe(true)
    expect(isHostOrSubdomainOf('https://x.com/user/status/1', ['twitter.com', 'x.com'])).toBe(true)
  })

  it('matches a real subdomain', () => {
    expect(isHostOrSubdomainOf('https://m.youtube.com/watch?v=1', ['youtube.com'])).toBe(true)
  })

  it('accepts protocol-less input by defaulting to https', () => {
    expect(isHostOrSubdomainOf('youtu.be/abc123', ['youtu.be'])).toBe(true)
  })

  it('rejects a domain that merely embeds the target as a path segment', () => {
    expect(isHostOrSubdomainOf('https://evil.com/x.com/status/1', ['twitter.com', 'x.com'])).toBe(
      false,
    )
  })

  it('rejects a lookalike host with the target as a prefix', () => {
    expect(isHostOrSubdomainOf('https://x.com.evil.com/', ['twitter.com', 'x.com'])).toBe(false)
  })

  it('rejects a lookalike host with the target as a suffix but no dot boundary', () => {
    expect(isHostOrSubdomainOf('https://notx.com/', ['x.com'])).toBe(false)
  })

  it('returns false on unparseable input instead of throwing', () => {
    expect(isHostOrSubdomainOf('not a url', ['x.com'])).toBe(false)
  })
})
