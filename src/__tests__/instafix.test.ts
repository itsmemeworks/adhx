import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchReelMetadata, isAllowedImageUrl, isValidReelId } from '@/lib/media/instafix'

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

const CDN_IMAGE = 'https://scontent-lhr6-1.cdninstagram.com/v/t51.71878-15/503057746_n.jpg?stp=x&_nc=1'

// Mirrors the OG tags Instagram serves to a Twitterbot UA for a public reel.
const validHtml = `
  <html><head>
  <meta property="og:image" content="${CDN_IMAGE}" />
  <meta property="og:title" content="Penny Lane on Instagram: &quot;PLEASE VOTE FOR ME&quot;" />
  <meta property="og:description" content="34K likes, 419 comments - pennylaneisthename on August 31, 2023: caption" />
  <meta name="twitter:title" content="Penny Lane (@pennylaneisthename) &#x2022; Instagram reel" />
  </head></html>
`

describe('isAllowedImageUrl', () => {
  it('accepts cdninstagram.com and fbcdn.net (and subdomains)', () => {
    expect(isAllowedImageUrl('https://scontent.cdninstagram.com/v/x.jpg')).toBe(true)
    expect(isAllowedImageUrl('https://cdninstagram.com/v/x.jpg')).toBe(true)
    expect(isAllowedImageUrl('https://scontent-lhr6-1.cdninstagram.com/v/x.jpg')).toBe(true)
    expect(isAllowedImageUrl('https://scontent.xx.fbcdn.net/v/x.jpg')).toBe(true)
  })

  it('rejects lookalike hosts (SSRF: subdomain suffix attack)', () => {
    expect(isAllowedImageUrl('https://cdninstagram.com.evil.com/x.jpg')).toBe(false)
    expect(isAllowedImageUrl('https://evilcdninstagram.com/x.jpg')).toBe(false)
    expect(isAllowedImageUrl('https://fake-fbcdn.net/x.jpg')).toBe(false)
  })

  it('rejects http and malformed URLs', () => {
    expect(isAllowedImageUrl('http://scontent.cdninstagram.com/x.jpg')).toBe(false)
    expect(isAllowedImageUrl('not a url')).toBe(false)
    expect(isAllowedImageUrl('')).toBe(false)
  })
})

describe('isValidReelId', () => {
  it('accepts standard Reel shortcodes', () => {
    expect(isValidReelId('Cwnj8o6pKbn')).toBe(true)
    expect(isValidReelId('AbC_123-xy')).toBe(true)
  })

  it('rejects obviously bad ids', () => {
    expect(isValidReelId('')).toBe(false)
    expect(isValidReelId('abc')).toBe(false)
    expect(isValidReelId('../../../etc/passwd')).toBe(false)
    expect(isValidReelId('a'.repeat(30))).toBe(false)
  })
})

describe('fetchReelMetadata (Instagram-direct, no video)', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns null for invalid ids without hitting the network', async () => {
    expect(await fetchReelMetadata('../etc')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('parses poster, caption and author from Instagram OG tags', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(validHtml))

    const result = await fetchReelMetadata('Cwnj8o6pKbn')

    expect(result).toEqual({
      imageUrl: CDN_IMAGE,
      caption: 'PLEASE VOTE FOR ME',
      description: '34K likes, 419 comments - pennylaneisthename on August 31, 2023: caption',
      author: '@pennylaneisthename',
      authorName: 'Penny Lane',
    })
    // Hits instagram.com directly on the /reel/ path first.
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe('https://www.instagram.com/reel/Cwnj8o6pKbn/')
  })

  it('never exposes a video URL (Instagram no longer resolvable to MP4)', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(validHtml))
    const result = await fetchReelMetadata('Cwnj8o6pKbn')
    expect(result).not.toHaveProperty('videoUrl')
  })

  it('drops a thumbnail that is not on an allowlisted CDN host (SSRF defense)', async () => {
    const evilHtml = `
      <html><head>
      <meta property="og:image" content="https://evil.com/thumb.jpg" />
      <meta property="og:title" content="X on Instagram: hello" />
      </head></html>
    `
    mockFetch.mockResolvedValueOnce(htmlResponse(evilHtml))
    const result = await fetchReelMetadata('Cwnj8o6pKbn')
    expect(result?.imageUrl).toBeUndefined()
    expect(result?.caption).toBe('hello')
  })

  it('falls back to the /p/ path when /reel/ yields nothing', async () => {
    mockFetch
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(htmlResponse(validHtml))

    const result = await fetchReelMetadata('Cwnj8o6pKbn')
    expect(result?.author).toBe('@pennylaneisthename')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[1][0]).toBe('https://www.instagram.com/p/Cwnj8o6pKbn/')
  })

  it('returns null when Instagram serves no usable OG tags', async () => {
    mockFetch
      .mockResolvedValueOnce(htmlResponse('<html><head></head></html>'))
      .mockResolvedValueOnce(htmlResponse('<html><head></head></html>'))
    expect(await fetchReelMetadata('Cwnj8o6pKbn')).toBeNull()
  })

  it('survives network errors and returns null', async () => {
    // Both paths (/reel/ then /p/) reject; each is caught and yields null.
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
    expect(await fetchReelMetadata('Cwnj8o6pKbn')).toBeNull()
  })

  it('decodes HTML entities in the caption', async () => {
    const html = `
      <html><head>
      <meta property="og:image" content="${CDN_IMAGE}" />
      <meta property="og:title" content="Bob on Instagram: caption &amp; &quot;quoted&quot;" />
      </head></html>
    `
    mockFetch.mockResolvedValueOnce(htmlResponse(html))
    const result = await fetchReelMetadata('Cwnj8o6pKbn')
    expect(result?.caption).toBe('caption & "quoted"')
  })
})
