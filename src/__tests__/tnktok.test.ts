import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  fetchTikTokMetadata,
  isAllowedVideoUrl,
  isValidUsername,
  isValidVideoId,
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

function notFoundResponse() {
  return { ok: false, status: 404, headers: new Headers({ 'content-type': 'text/html' }), body: null }
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
  beforeEach(() => mockFetch.mockReset())

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

  it('returns null on 404 from the mirror', async () => {
    mockFetch.mockResolvedValueOnce(notFoundResponse())
    const result = await fetchTikTokMetadata('@sophieraiin', VIDEO_ID)
    expect(result).toBeNull()
  })

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
