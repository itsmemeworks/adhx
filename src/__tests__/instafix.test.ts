import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchReelMetadata, isAllowedVideoUrl, isValidReelId } from '@/lib/media/instafix'

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

function notFoundResponse() {
  return {
    ok: false,
    status: 404,
    headers: new Headers({ 'content-type': 'text/html' }),
    body: null,
  }
}

const CDN_VIDEO = 'https://scontent-lhr8-1.cdninstagram.com/v/video.mp4?e=123'
const CDN_IMAGE = 'https://scontent.cdninstagram.com/v/thumb.jpg'

const validHtml = `
  <html><head>
  <meta property="og:video:secure_url" content="${CDN_VIDEO}" />
  <meta property="og:image" content="${CDN_IMAGE}" />
  <meta property="og:title" content="Cool Reel" />
  <meta property="og:description" content="A description" />
  </head></html>
`

describe('isAllowedVideoUrl', () => {
  it('accepts cdninstagram.com and subdomains', () => {
    expect(isAllowedVideoUrl('https://scontent.cdninstagram.com/v/x.mp4')).toBe(true)
    expect(isAllowedVideoUrl('https://cdninstagram.com/v/x.mp4')).toBe(true)
    expect(isAllowedVideoUrl('https://scontent-lhr8-1.cdninstagram.com/v/x.mp4')).toBe(true)
  })

  it('accepts fbcdn.net and subdomains', () => {
    expect(isAllowedVideoUrl('https://scontent.xx.fbcdn.net/v/x.mp4')).toBe(true)
  })

  it('accepts trusted mirror proxy hosts', () => {
    expect(isAllowedVideoUrl('https://toinstagram.com/videos/abc/1')).toBe(true)
    expect(isAllowedVideoUrl('https://cp.toinstagram.com/payload.mp4')).toBe(true)
    expect(isAllowedVideoUrl('https://uuinstagram.com/videos/abc/1')).toBe(true)
  })

  it('rejects lookalike hosts (SSRF: subdomain suffix attack)', () => {
    expect(isAllowedVideoUrl('https://cdninstagram.com.evil.com/x.mp4')).toBe(false)
    expect(isAllowedVideoUrl('https://evilcdninstagram.com/x.mp4')).toBe(false)
    expect(isAllowedVideoUrl('https://fake-fbcdn.net/x.mp4')).toBe(false)
    expect(isAllowedVideoUrl('https://toinstagram.com.evil.com/x.mp4')).toBe(false)
  })

  it('rejects http (only https)', () => {
    expect(isAllowedVideoUrl('http://scontent.cdninstagram.com/x.mp4')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isAllowedVideoUrl('not a url')).toBe(false)
    expect(isAllowedVideoUrl('')).toBe(false)
  })
})

describe('isValidReelId', () => {
  it('accepts standard Reel shortcodes', () => {
    expect(isValidReelId('DXVsqQ7CSXw')).toBe(true)
    expect(isValidReelId('AbC_123-xy')).toBe(true)
  })

  it('rejects obviously bad ids', () => {
    expect(isValidReelId('')).toBe(false)
    expect(isValidReelId('abc')).toBe(false) // too short
    expect(isValidReelId('../../../etc/passwd')).toBe(false)
    expect(isValidReelId('a'.repeat(30))).toBe(false) // too long
  })
})

describe('fetchReelMetadata', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns null for invalid ids without hitting the network', async () => {
    const result = await fetchReelMetadata('../etc')
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('parses OG tags from the first successful mirror', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(validHtml))

    const result = await fetchReelMetadata('DXVsqQ7CSXw')

    expect(result).toEqual({
      videoUrl: CDN_VIDEO,
      imageUrl: CDN_IMAGE,
      title: 'Cool Reel',
      description: 'A description',
      author: undefined,
    })
    // Should hit /p/ path on the first mirror.
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toContain('/p/DXVsqQ7CSXw')
  })

  it('falls back to /reels/ path when /p/ fails', async () => {
    mockFetch
      .mockResolvedValueOnce(notFoundResponse()) // /p/ fails on first mirror
      .mockResolvedValueOnce(htmlResponse(validHtml)) // /reels/ succeeds

    const result = await fetchReelMetadata('DXVsqQ7CSXw')

    expect(result?.videoUrl).toBe(CDN_VIDEO)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[1][0]).toContain('/reels/DXVsqQ7CSXw')
  })

  it('tries the next mirror when both paths fail on the first', async () => {
    mockFetch
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(htmlResponse(validHtml))

    const result = await fetchReelMetadata('DXVsqQ7CSXw')

    expect(result?.videoUrl).toBe(CDN_VIDEO)
    // First mirror both paths, then second mirror /p/ succeeds.
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(new URL(mockFetch.mock.calls[0][0]).host).toBe('toinstagram.com')
    expect(new URL(mockFetch.mock.calls[2][0]).host).toBe('uuinstagram.com')
  })

  it('rejects non-Instagram video URLs (SSRF defense)', async () => {
    const evilHtml = `
      <html><head>
      <meta property="og:video:secure_url" content="https://evil.com/payload.mp4" />
      <meta property="og:image" content="https://evil.com/thumb.jpg" />
      </head></html>
    `
    // All 4 mirror+path combinations return the evil HTML; none should be accepted.
    for (let i = 0; i < 4; i++) mockFetch.mockResolvedValueOnce(htmlResponse(evilHtml))

    const result = await fetchReelMetadata('DXVsqQ7CSXw')
    expect(result).toBeNull()
  })

  it('returns null when og:video is absent', async () => {
    const noVideoHtml = `
      <html><head>
      <meta property="og:image" content="${CDN_IMAGE}" />
      <meta property="og:title" content="Photo post" />
      </head></html>
    `
    for (let i = 0; i < 4; i++) mockFetch.mockResolvedValueOnce(htmlResponse(noVideoHtml))

    const result = await fetchReelMetadata('DXVsqQ7CSXw')
    expect(result).toBeNull()
  })

  it('resolves relative video URLs against the mirror origin', async () => {
    // This is the real-world InstaFix behavior: og:video is a relative path
    // pointing back to the mirror's own /videos/ proxy endpoint.
    const html = `
      <html><head>
      <meta name="twitter:title" content="@some_user" />
      <meta name="twitter:player:stream" content="/videos/DXVsqQ7CSXw/1" />
      <meta name="twitter:player:stream:content_type" content="video/mp4" />
      <meta property="og:video" content="/videos/DXVsqQ7CSXw/1" />
      <meta property="og:video:secure_url" content="/videos/DXVsqQ7CSXw/1" />
      <meta property="og:description" content="Caption text" />
      </head></html>
    `
    mockFetch.mockResolvedValueOnce(htmlResponse(html))

    const result = await fetchReelMetadata('DXVsqQ7CSXw')
    expect(result?.videoUrl).toBe('https://toinstagram.com/videos/DXVsqQ7CSXw/1')
    expect(result?.author).toBe('@some_user')
    expect(result?.description).toBe('Caption text')
  })

  it('survives per-mirror network errors and keeps trying', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(htmlResponse(validHtml))

    const result = await fetchReelMetadata('DXVsqQ7CSXw')
    expect(result?.videoUrl).toBe(CDN_VIDEO)
  })

  it('falls through to og:video when og:video:secure_url is missing', async () => {
    const html = `
      <html><head>
      <meta property="og:video" content="${CDN_VIDEO}" />
      <meta property="og:image" content="${CDN_IMAGE}" />
      </head></html>
    `
    mockFetch.mockResolvedValueOnce(htmlResponse(html))
    const result = await fetchReelMetadata('DXVsqQ7CSXw')
    expect(result?.videoUrl).toBe(CDN_VIDEO)
  })

  it('decodes HTML entities in meta content', async () => {
    const html = `
      <html><head>
      <meta property="og:video:secure_url" content="${CDN_VIDEO}&amp;sig=abc" />
      <meta property="og:title" content="Title &amp; caption &quot;quoted&quot;" />
      </head></html>
    `
    mockFetch.mockResolvedValueOnce(htmlResponse(html))
    const result = await fetchReelMetadata('DXVsqQ7CSXw')
    expect(result?.videoUrl).toBe(`${CDN_VIDEO}&sig=abc`)
    expect(result?.title).toBe('Title & caption "quoted"')
  })
})
