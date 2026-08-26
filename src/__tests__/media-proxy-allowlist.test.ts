import { describe, expect, it, vi } from 'vitest'
import {
  fetchWithAllowlistedRedirects,
  isAllowedHlsUrl,
  isAllowedTwitterMediaUrl,
  makeHostAllowlist,
  buildAllowlistedUrl,
  TWITTER_HLS_HOSTS,
} from '@/lib/media/proxy'

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

describe('buildAllowlistedUrl', () => {
  it('rebuilds an allowed URL from its parsed hostname/pathname/search', () => {
    expect(
      buildAllowlistedUrl(
        'https://video.twimg.com/ext_tw_video/1/pu/vid/foo.m3u8?tag=12',
        TWITTER_HLS_HOSTS,
      ),
    ).toBe('https://video.twimg.com/ext_tw_video/1/pu/vid/foo.m3u8?tag=12')
    expect(buildAllowlistedUrl('https://api.twitter.com/segment.ts', TWITTER_HLS_HOSTS)).toBe(
      'https://api.twitter.com/segment.ts',
    )
  })

  it('rejects a subdomain-suffix attack (evil.com hosting a twimg.com-looking path)', () => {
    expect(
      buildAllowlistedUrl('https://twimg.com.evil.com/playlist.m3u8', TWITTER_HLS_HOSTS),
    ).toBeNull()
  })

  it('rejects a host that merely ends with the trusted suffix without the dot boundary', () => {
    expect(buildAllowlistedUrl('https://nottwimg.com/playlist.m3u8', TWITTER_HLS_HOSTS)).toBeNull()
  })

  it('rejects a non-https URL for an otherwise-trusted host', () => {
    expect(
      buildAllowlistedUrl('http://video.twimg.com/playlist.m3u8', TWITTER_HLS_HOSTS),
    ).toBeNull()
  })

  it('rejects unparseable input instead of throwing', () => {
    expect(buildAllowlistedUrl('not a url', TWITTER_HLS_HOSTS)).toBeNull()
  })

  it("uses the allowlist's own literal for an exact host match, not the parsed input", () => {
    // Same value either way for a plain host, but this exercises the
    // constant-host branch specifically (see the two-tier doc comment on
    // buildAllowlistedUrl) rather than the wildcard-suffix branch.
    expect(buildAllowlistedUrl('https://video.twimg.com/foo.mp4?a=1', ['video.twimg.com'])).toBe(
      'https://video.twimg.com/foo.mp4?a=1',
    )
  })

  it('rejects the bare suffix domain on a wildcard-only entry (no subdomain label)', () => {
    // '.twimg.com' only matches a real subdomain (the bare host is shorter
    // than the suffix, so `endsWith` is false) — the bare domain needs its
    // own exact entry, as TWITTER_HLS_HOSTS lists both 'twitter.com' and
    // '.twitter.com'.
    expect(buildAllowlistedUrl('https://twimg.com/x', ['.twimg.com'])).toBeNull()
  })

  it('accepts a multi-label subdomain on the wildcard branch', () => {
    expect(buildAllowlistedUrl('https://a.b.twimg.com/foo.mp4', ['.twimg.com'])).toBe(
      'https://a.b.twimg.com/foo.mp4',
    )
  })
})

describe('fetchWithAllowlistedRedirects', () => {
  it('caps redirect hops without fetching beyond the allowlist', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: '/next/video.mp4' } }),
      )

    try {
      await expect(
        fetchWithAllowlistedRedirects('https://video.twimg.com/start/video.mp4', {
          hosts: ['video.twimg.com'],
          timeoutMs: 1_000,
          maxRedirects: 2,
        }),
      ).rejects.toThrow(/hop limit/i)
      expect(fetchSpy).toHaveBeenCalledTimes(3)
      expect(
        fetchSpy.mock.calls.every(([url]) => new URL(String(url)).hostname === 'video.twimg.com'),
      ).toBe(true)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('rejects and cancels an unexpected off-allowlist final response URL', async () => {
    const cancel = vi.fn()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      url: 'https://evil.example/video.mp4',
      headers: new Headers(),
      body: { cancel },
    } as unknown as Response)

    try {
      await expect(
        fetchWithAllowlistedRedirects('https://video.twimg.com/start/video.mp4', {
          hosts: ['video.twimg.com'],
          timeoutMs: 1_000,
        }),
      ).rejects.toThrow(/final media response URL/i)
      expect(cancel).toHaveBeenCalledOnce()
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
