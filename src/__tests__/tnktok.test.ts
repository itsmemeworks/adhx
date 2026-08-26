import { describe, it, expect, beforeEach, vi } from 'vitest'

// A small fulfilled-result cache models the important unstable_cache behavior:
// resolved values (including null) are serialized and reused; thrown callbacks
// are not stored and therefore run again on the next invocation.
const cacheHarness = vi.hoisted(() => {
  const entries = new Map<string, string>()

  return {
    clear: () => entries.clear(),
    unstableCache:
      <A extends unknown[], R>(
        fn: (...args: A) => Promise<R>,
        keyParts: string[] = [],
      ): ((...args: A) => Promise<R>) =>
      async (...args: A): Promise<R> => {
        const key = JSON.stringify([keyParts, args])
        const cached = entries.get(key)
        if (cached !== undefined) return JSON.parse(cached) as R

        const value = await fn(...args)
        entries.set(key, JSON.stringify(value))
        return value
      },
  }
})

vi.mock('next/cache', () => ({
  unstable_cache: cacheHarness.unstableCache,
}))

import {
  fetchTikTokMetadata,
  fetchTikTokMetadataStatus,
  isAllowedVideoUrl,
  isValidUsername,
  isValidVideoId,
  isTikTokShortLink,
  resolveTikTokUrl,
} from '@/lib/media/tnktok'

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

function htmlResponse(html: string) {
  return {
    ok: true,
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    body: {
      getReader() {
        let sent = false
        return {
          async read() {
            if (sent) return { done: true, value: undefined }
            sent = true
            return { done: false, value: new TextEncoder().encode(html) }
          },
          cancel: async () => {},
        }
      },
    },
  }
}

function notFoundResponse(status = 404) {
  return {
    ok: false,
    status,
    headers: new Headers({ 'content-type': 'text/html' }),
    body: null,
  }
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    headers: new Headers({ 'content-type': 'text/html' }),
    body: null,
  }
}

const VIDEO_ID = '7619017281691045134'
const VIDEO_URL = `https://offload.tnktok.com/generate/video/${VIDEO_ID}.mp4`

const validHtml = `
  <html><head>
  <meta property="og:title" content="Sophie Rain (@sophieraiin)"/>
  <meta property="og:description" content="the last one ate thooo"/>
  <meta property="og:video" content="${VIDEO_URL}"/>
  <meta property="og:video:type" content="video/mp4"/>
  <meta property="twitter:creator" content="@sophieraiin"/>
  </head></html>
`

describe('isAllowedVideoUrl', () => {
  it('accepts tnktok and offload subdomain', () => {
    expect(isAllowedVideoUrl('https://tnktok.com/generate/video/123.mp4')).toBe(true)
    expect(isAllowedVideoUrl('https://offload.tnktok.com/generate/video/123.mp4')).toBe(true)
  })

  it('accepts the TikTok CDN domains the mirror redirects to', () => {
    expect(isAllowedVideoUrl('https://v16m-default.tiktokcdn-us.com/foo.mp4')).toBe(true)
    expect(isAllowedVideoUrl('https://p16-common-sign.tiktokcdn-eu.com/img.jpg')).toBe(true)
    expect(isAllowedVideoUrl('https://www.tiktokcdn.com/foo.mp4')).toBe(true)
  })

  it('rejects lookalike hosts (SSRF: subdomain suffix attack)', () => {
    expect(isAllowedVideoUrl('https://tnktok.com.evil.com/x.mp4')).toBe(false)
    expect(isAllowedVideoUrl('https://eviltiktokcdn.com/x.mp4')).toBe(false)
    expect(isAllowedVideoUrl('https://faketiktokcdn-us.com/x.mp4')).toBe(false)
  })

  it('rejects non-https URLs', () => {
    expect(isAllowedVideoUrl('http://offload.tnktok.com/x.mp4')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isAllowedVideoUrl('not a url')).toBe(false)
    expect(isAllowedVideoUrl('')).toBe(false)
  })
})

function redirectResponse(location: string, status = 301) {
  return { status, headers: new Headers({ location }), body: null }
}

describe('isTikTokShortLink', () => {
  it('detects vm. / vt. short links and /t/ codes', () => {
    expect(isTikTokShortLink('https://vm.tiktok.com/ZNRvLPpVV/')).toBe(true)
    expect(isTikTokShortLink('https://vt.tiktok.com/ZSabc123/')).toBe(true)
    expect(isTikTokShortLink('https://www.tiktok.com/t/ZNRvLPpVV/')).toBe(true)
    expect(isTikTokShortLink('vm.tiktok.com/ZNRvLPpVV')).toBe(true)
  })

  it('returns false for canonical and non-tiktok URLs', () => {
    expect(isTikTokShortLink('https://www.tiktok.com/@user/video/7619017281691045134')).toBe(false)
    expect(isTikTokShortLink('https://vm.evil.com/abc')).toBe(false)
    expect(isTikTokShortLink('not a url')).toBe(false)
  })
})

describe('resolveTikTokUrl', () => {
  beforeEach(() => mockFetch.mockReset())

  it('parses a canonical URL without any network call', async () => {
    const out = await resolveTikTokUrl(
      'https://www.tiktok.com/@nakayylah/video/7645103968468684046?_t=abc',
    )
    expect(out).toEqual({ handle: 'nakayylah', videoId: '7645103968468684046' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('follows a short-link redirect to the canonical URL', async () => {
    mockFetch.mockResolvedValueOnce(
      redirectResponse('https://www.tiktok.com/@nakayylah/video/7645103968468684046?_r=1'),
    )
    const out = await resolveTikTokUrl('https://vm.tiktok.com/ZNRvLPpVV/')
    expect(out).toEqual({ handle: 'nakayylah', videoId: '7645103968468684046' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('refuses to follow a redirect that leaves tiktok.com (SSRF guard)', async () => {
    mockFetch.mockResolvedValueOnce(redirectResponse('https://evil.com/@x/video/123'))
    expect(await resolveTikTokUrl('https://vm.tiktok.com/ZNRvLPpVV/')).toBeNull()
  })

  it('rejects a non-tiktok input without fetching', async () => {
    expect(await resolveTikTokUrl('https://evil.com/whatever')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('isValidUsername / isValidVideoId', () => {
  it('accepts standard TikTok handles with or without @', () => {
    expect(isValidUsername('sophieraiin')).toBe(true)
    expect(isValidUsername('@sophieraiin')).toBe(true)
    expect(isValidUsername('user.name_123')).toBe(true)
  })

  it('rejects obviously bad handles', () => {
    expect(isValidUsername('')).toBe(false)
    expect(isValidUsername('../etc/passwd')).toBe(false)
    expect(isValidUsername('a'.repeat(40))).toBe(false)
  })

  it('accepts long numeric video ids', () => {
    expect(isValidVideoId('7619017281691045134')).toBe(true)
    expect(isValidVideoId('1234567')).toBe(true)
  })

  it('rejects non-numeric or too-short ids', () => {
    expect(isValidVideoId('')).toBe(false)
    expect(isValidVideoId('abc123')).toBe(false)
    expect(isValidVideoId('12345')).toBe(false)
  })
})

describe('fetchTikTokMetadata', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    cacheHarness.clear()
  })

  it('returns null for invalid input without hitting the network', async () => {
    const result = await fetchTikTokMetadata('../etc', '123')
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('parses OG tags into the canonical shape', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(validHtml))

    const result = await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)

    expect(result).toEqual({
      videoUrl: VIDEO_URL,
      title: 'Sophie Rain (@sophieraiin)',
      description: 'the last one ate thooo',
      authorName: 'Sophie Rain',
      author: '@sophieraiin',
    })
    expect(await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)).toEqual(result)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toContain('/@sophieraiin/video/' + VIDEO_ID)
  })

  it('strips the leading @ from the username before hitting the mirror', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(validHtml))
    await fetchTikTokMetadata('sophieraiin', VIDEO_ID)
    expect(mockFetch.mock.calls[0][0]).toContain('/@sophieraiin/video/')
  })

  it('rejects video URLs not on the allowlist (SSRF defense)', async () => {
    const evilHtml = `
      <html><head>
      <meta property="og:video" content="https://evil.com/payload.mp4"/>
      </head></html>
    `
    mockFetch.mockResolvedValueOnce(htmlResponse(evilHtml))

    const result = await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)
    expect(result).toBeNull()
  })

  it('returns null when og:video is absent', async () => {
    const noVideoHtml = `
      <html><head>
      <meta property="og:title" content="Sophie Rain (@sophieraiin)"/>
      </head></html>
    `
    mockFetch.mockResolvedValueOnce(htmlResponse(noVideoHtml))

    const result = await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)
    expect(result).toBeNull()
  })

  it('survives mirror network errors and returns null', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const result = await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)
    expect(result).toBeNull()
  })

  it('reserves permanent misses for locally invalid input', async () => {
    await expect(fetchTikTokMetadataStatus('../etc', '123')).resolves.toEqual({
      kind: 'permanent-miss',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it.each([404, 410])('treats a mirror-only %i as transient', async (status) => {
    mockFetch.mockResolvedValueOnce(notFoundResponse(status))
    await expect(fetchTikTokMetadataStatus('@sophieraiin', VIDEO_ID)).resolves.toEqual({
      kind: 'transient-failure',
    })
  })

  it('does not cache a 503 and refetches successfully', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(htmlResponse(validHtml))

    expect(await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)).toBeNull()
    expect(await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)).toEqual(
      expect.objectContaining({ videoUrl: VIDEO_URL }),
    )
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('does not cache a timeout and refetches successfully', async () => {
    mockFetch
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
      .mockResolvedValueOnce(htmlResponse(validHtml))

    expect(await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)).toBeNull()
    expect(await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)).toEqual(
      expect.objectContaining({ videoUrl: VIDEO_URL }),
    )
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('does not cache an unparseable 200 response', async () => {
    mockFetch
      .mockResolvedValueOnce(htmlResponse('<html><head></head></html>'))
      .mockResolvedValueOnce(htmlResponse(validHtml))

    expect(await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)).toBeNull()
    expect(await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)).toEqual(
      expect.objectContaining({ videoUrl: VIDEO_URL }),
    )
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it.each([404, 410])(
    'does not cache a mirror-only %i and refetches successfully',
    async (status) => {
      mockFetch
        .mockResolvedValueOnce(notFoundResponse(status))
        .mockResolvedValueOnce(htmlResponse(validHtml))

      expect(await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)).toBeNull()
      expect(await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)).toEqual(
        expect.objectContaining({ videoUrl: VIDEO_URL }),
      )
      expect(mockFetch).toHaveBeenCalledTimes(2)
    },
  )

  it('falls back to twitter:player:stream when og:video is missing', async () => {
    const html = `
      <html><head>
      <meta property="twitter:player:stream" content="${VIDEO_URL}"/>
      <meta property="og:title" content="Foo"/>
      </head></html>
    `
    mockFetch.mockResolvedValueOnce(htmlResponse(html))
    const result = await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)
    expect(result?.videoUrl).toBe(VIDEO_URL)
  })

  it('decodes HTML entities in meta content', async () => {
    const html = `
      <html><head>
      <meta property="og:video" content="${VIDEO_URL}&amp;sig=abc"/>
      <meta property="og:description" content="caption &quot;quoted&quot;"/>
      </head></html>
    `
    mockFetch.mockResolvedValueOnce(htmlResponse(html))
    const result = await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)
    expect(result?.videoUrl).toBe(`${VIDEO_URL}&sig=abc`)
    expect(result?.description).toBe('caption "quoted"')
  })
})
