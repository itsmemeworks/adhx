import { describe, it, expect, beforeEach, vi } from 'vitest'

// Model unstable_cache closely enough to exercise negative caching: fulfilled
// values (including null) are serialized and reused, while rejected callbacks
// leave no entry and must execute again.
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
  fetchInstagramMetadata,
  fetchReelMetadata,
  fetchReelMetadataStatus,
  isAllowedImageUrl,
  isValidReelId,
  parseInstagramDocument,
} from '@/lib/media/instafix'

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

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    headers: new Headers({ 'content-type': 'text/html' }),
    body: null,
  }
}

const CDN_IMAGE =
  'https://scontent-lhr6-1.cdninstagram.com/v/t51.71878-15/503057746_n.jpg?stp=x&_nc=1'

// Mirrors the OG tags Instagram serves to a Twitterbot UA for a public reel.
const validHtml = `
  <html><head>
  <meta property="og:image" content="${CDN_IMAGE}" />
  <meta property="og:title" content="Penny Lane on Instagram: &quot;PLEASE VOTE FOR ME&quot;" />
  <meta property="og:description" content="34K likes, 419 comments - pennylaneisthename on August 31, 2023: caption" />
  <meta name="twitter:title" content="Penny Lane (@pennylaneisthename) &#x2022; Instagram reel" />
  </head></html>
`

function relayHtml(id: string, media: Record<string, unknown>): string {
  return `<html><body><script type="application/json" data-sjs>${JSON.stringify({
    payload: {
      xig_polaris_media: {
        code: id,
        if_not_gated_logged_out: { code: id, ...media },
      },
    },
  })}</script></body></html>`
}

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
  beforeEach(() => {
    mockFetch.mockReset()
    cacheHarness.clear()
  })

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
      contentType: 'video',
      media: [{ type: 'video', imageUrl: CDN_IMAGE }],
    })
    expect(await fetchReelMetadata('Cwnj8o6pKbn')).toEqual(result)
    // Hits instagram.com directly on the /reel/ path first.
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe('https://www.instagram.com/reel/Cwnj8o6pKbn/')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      headers: { 'User-Agent': expect.stringContaining('Googlebot') },
    })
  })

  it('parses a single Instagram image from the crawler Relay payload', () => {
    const metadata = parseInstagramDocument(
      relayHtml('DcBQt5woBw2', {
        __typename: 'XIGPolarisImageMedia',
        media_type: 1,
        user: { username: 'fontainesband', full_name: 'Fontaines D.C.' },
        caption: { text: '5.' },
        taken_at: 1786708815,
        original_width: 1440,
        original_height: 1800,
        display_uri: CDN_IMAGE,
        accessibility_caption: 'Photo by Fontaines D.C.',
      }),
      'DcBQt5woBw2',
      '/p/DcBQt5woBw2/',
    )

    expect(metadata).toMatchObject({
      contentType: 'photo',
      author: '@fontainesband',
      authorName: 'Fontaines D.C.',
      caption: '5.',
      imageUrl: CDN_IMAGE,
      media: [
        {
          type: 'photo',
          imageUrl: CDN_IMAGE,
          width: 1440,
          height: 1800,
          altText: 'Photo by Fontaines D.C.',
        },
      ],
    })
    expect(metadata?.takenAt).toBe('2026-08-14T12:00:15.000Z')
  })

  it('chooses the highest-resolution allowed image candidate', () => {
    const metadata = parseInstagramDocument(
      relayHtml('quality123', {
        __typename: 'XIGPolarisImageMedia',
        media_type: 1,
        user: { username: 'creator' },
        display_uri: 'https://scontent.cdninstagram.com/640.jpg',
        image_versions2: {
          candidates: [
            {
              url: 'https://scontent.cdninstagram.com/320.jpg',
              width: 320,
              height: 400,
            },
            {
              url: 'https://scontent.cdninstagram.com/1440.jpg',
              width: 1440,
              height: 1800,
            },
          ],
        },
      }),
      'quality123',
    )

    expect(metadata?.imageUrl).toBe('https://scontent.cdninstagram.com/1440.jpg')
    expect(metadata?.media[0]?.imageUrl).toBe('https://scontent.cdninstagram.com/1440.jpg')
  })

  it('preserves every ordered image in a large carousel', async () => {
    const images = Array.from({ length: 11 }, (_, index) => ({
      __typename: 'XIGPolarisImageMedia',
      media_type: 1,
      display_uri: `https://scontent.cdninstagram.com/carousel-${index + 1}.jpg`,
      original_width: 1440,
      original_height: 1920 + index,
      accessibility_caption: `Slide ${index + 1}`,
    }))
    mockFetch.mockResolvedValueOnce(
      htmlResponse(
        relayHtml('DcHXej3lt5W', {
          __typename: 'XIGPolarisCarouselMedia',
          media_type: 8,
          user: { username: 'goodnews', full_name: 'Good News' },
          caption: { text: 'Good news carousel' },
          carousel_media: images,
          display_uri: images[0].display_uri,
        }),
      ),
    )

    const metadata = await fetchInstagramMetadata('DcHXej3lt5W')

    expect(metadata?.contentType).toBe('photo')
    expect(metadata?.media).toHaveLength(11)
    expect(metadata?.media.map((media) => media.imageUrl)).toEqual(
      images.map((image) => image.display_uri),
    )
    expect(metadata?.media[10]).toMatchObject({ altText: 'Slide 11', height: 1930 })
  })

  it('preserves mixed carousel ordering while keeping the container photo-shaped', () => {
    const metadata = parseInstagramDocument(
      relayHtml('mixed123', {
        __typename: 'XIGPolarisCarouselMedia',
        media_type: 8,
        user: { username: 'creator' },
        carousel_media: [
          {
            __typename: 'XIGPolarisImageMedia',
            media_type: 1,
            display_uri: 'https://scontent.cdninstagram.com/first.jpg',
          },
          {
            __typename: 'XIGPolarisVideoMedia',
            media_type: 2,
            display_uri: 'https://scontent.cdninstagram.com/video-poster.jpg',
          },
          {
            __typename: 'XIGPolarisImageMedia',
            media_type: 1,
            display_uri: 'https://scontent.cdninstagram.com/third.jpg',
          },
        ],
      }),
      'mixed123',
      '/p/mixed123/',
    )

    expect(metadata?.contentType).toBe('photo')
    expect(metadata?.media.map((media) => media.type)).toEqual(['photo', 'video', 'photo'])
    expect(metadata?.media.map((media) => media.imageUrl)).toEqual([
      'https://scontent.cdninstagram.com/first.jpg',
      'https://scontent.cdninstagram.com/video-poster.jpg',
      'https://scontent.cdninstagram.com/third.jpg',
    ])
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

  it('probes the requested post shape first and keys cached fallbacks by that shape', async () => {
    const genericPhotoHtml = `
      <html><head>
      <meta property="og:image" content="${CDN_IMAGE}" />
      <meta property="og:title" content="Creator on Instagram: &quot;A photo&quot;" />
      </head></html>
    `
    mockFetch
      .mockResolvedValueOnce(htmlResponse(genericPhotoHtml))
      .mockResolvedValueOnce(htmlResponse(validHtml))

    const photo = await fetchInstagramMetadata('shape123', 'post')
    const reel = await fetchInstagramMetadata('shape123', 'reel')

    expect(photo?.contentType).toBe('photo')
    expect(reel?.contentType).toBe('video')
    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
      'https://www.instagram.com/p/shape123/',
      'https://www.instagram.com/reel/shape123/',
    ])
  })

  it('returns null when Instagram serves no usable OG tags', async () => {
    mockFetch
      .mockResolvedValueOnce(htmlResponse('<html><head></head></html>'))
      .mockResolvedValueOnce(htmlResponse('<html><head></head></html>'))
    expect(await fetchReelMetadata('Cwnj8o6pKbn')).toBeNull()
  })

  it('survives network errors and returns null', async () => {
    // Both paths (/reel/ then /p/) reject; the public wrapper preserves null.
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
    expect(await fetchReelMetadata('Cwnj8o6pKbn')).toBeNull()
  })

  it('exposes confirmed permanent misses separately from transient failures', async () => {
    mockFetch.mockResolvedValueOnce(notFoundResponse()).mockResolvedValueOnce(notFoundResponse())
    await expect(fetchReelMetadataStatus('Cwnj8o6pKbn')).resolves.toEqual({
      kind: 'permanent-miss',
    })

    cacheHarness.clear()
    mockFetch.mockResolvedValueOnce(errorResponse(503)).mockResolvedValueOnce(notFoundResponse())
    await expect(fetchReelMetadataStatus('Cwnj8o6pKbn')).resolves.toEqual({
      kind: 'transient-failure',
    })
  })

  it('does not cache a 503 and refetches successfully', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(htmlResponse(validHtml))

    expect(await fetchReelMetadata('Cwnj8o6pKbn')).toBeNull()
    expect(await fetchReelMetadata('Cwnj8o6pKbn')).toEqual(
      expect.objectContaining({ imageUrl: CDN_IMAGE }),
    )
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('does not cache a timeout and refetches successfully', async () => {
    mockFetch
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(htmlResponse(validHtml))

    expect(await fetchReelMetadata('Cwnj8o6pKbn')).toBeNull()
    expect(await fetchReelMetadata('Cwnj8o6pKbn')).toEqual(
      expect.objectContaining({ imageUrl: CDN_IMAGE }),
    )
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('does not cache an unparseable 200 response', async () => {
    mockFetch
      .mockResolvedValueOnce(htmlResponse('<html><head></head></html>'))
      .mockResolvedValueOnce(notFoundResponse())
      .mockResolvedValueOnce(htmlResponse(validHtml))

    expect(await fetchReelMetadata('Cwnj8o6pKbn')).toBeNull()
    expect(await fetchReelMetadata('Cwnj8o6pKbn')).toEqual(
      expect.objectContaining({ imageUrl: CDN_IMAGE }),
    )
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('caches a confirmed miss after both Instagram paths return 404', async () => {
    mockFetch.mockResolvedValueOnce(notFoundResponse()).mockResolvedValueOnce(notFoundResponse())

    expect(await fetchReelMetadata('Cwnj8o6pKbn')).toBeNull()
    expect(await fetchReelMetadata('Cwnj8o6pKbn')).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(2)
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
