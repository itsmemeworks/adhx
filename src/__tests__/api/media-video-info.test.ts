import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * API Route Tests: /api/media/video/info
 *
 * Tests video info endpoint which returns duration, HLS URL, and format sizes
 * for determining playback strategy (MP4 vs HLS) and mobile download limits.
 */

const mockFetch = vi.fn()
global.fetch = mockFetch

const mocks = vi.hoisted(() => ({
  mediaRateLimit: vi.fn(),
}))

vi.mock('@/lib/sentry', () => ({
  metrics: { mediaUnavailable: vi.fn() },
  captureException: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  mediaRateLimit: mocks.mediaRateLimit,
}))

function createRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/media/video/info')
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })
  return new NextRequest(url)
}

// Mock short video response (<5 min)
const mockShortVideoResponse = {
  tweet: {
    media: {
      videos: [
        {
          duration: 120, // 2 minutes
          url: 'https://video.twimg.com/default.mp4',
          formats: [
            { url: 'https://video.twimg.com/360p.mp4', bitrate: 832000, container: 'mp4' },
            { url: 'https://video.twimg.com/720p.mp4', bitrate: 2176000, container: 'mp4' },
            { url: 'https://video.twimg.com/1080p.mp4', bitrate: 10368000, container: 'mp4' },
          ],
        },
      ],
    },
  },
}

// Mock long video response (>5 min) with HLS in formats array
const mockLongVideoResponse = {
  tweet: {
    media: {
      videos: [
        {
          duration: 1200, // 20 minutes
          url: 'https://video.twimg.com/ext_tw_video/123/pu/pl/master.m3u8',
          formats: [
            { url: 'https://video.twimg.com/ext_tw_video/123/pu/pl/master.m3u8', bitrate: null }, // HLS playlist
            { url: 'https://video.twimg.com/360p.mp4', bitrate: 832000, container: 'mp4' },
            { url: 'https://video.twimg.com/720p.mp4', bitrate: 2176000, container: 'mp4' },
            { url: 'https://video.twimg.com/1080p.mp4', bitrate: 10368000, container: 'mp4' },
          ],
        },
      ],
    },
  },
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
  })
}

describe('API: /api/media/video/info', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mocks.mediaRateLimit.mockReturnValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('Input validation', () => {
    it.each([undefined, 'true'])(
      'enforces the public media IP limiter before resolving (withSizes=%s)',
      async (withSizes) => {
        mocks.mediaRateLimit.mockReturnValueOnce(
          new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
        )
        const request = createRequest({
          author: 'limited',
          tweetId: '100',
          ...(withSizes ? { withSizes } : {}),
        })
        const { GET } = await import('@/app/api/media/video/info/route')

        const response = await GET(request)

        expect(response.status).toBe(429)
        expect(mocks.mediaRateLimit).toHaveBeenCalledWith(request)
        expect(mockFetch).not.toHaveBeenCalled()
      },
    )

    it('returns 400 when author is missing', async () => {
      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ tweetId: '123' }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Missing author or tweetId')
    })

    it('returns 400 when tweetId is missing', async () => {
      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'user' }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Missing author or tweetId')
    })
  })

  describe('Short video response', () => {
    // 120s duration is above the new 60s HLS threshold, but mockShortVideoResponse
    // has no m3u8 URL, so requiresHls should stay false.
    const veryShortVideoResponse = {
      tweet: {
        media: {
          videos: [
            {
              duration: 30,
              url: 'https://video.twimg.com/default.mp4',
              formats: [
                { url: 'https://video.twimg.com/360p.mp4', bitrate: 832000, container: 'mp4' },
                { url: 'https://video.twimg.com/720p.mp4', bitrate: 2176000, container: 'mp4' },
                { url: 'https://video.twimg.com/1080p.mp4', bitrate: 10368000, container: 'mp4' },
              ],
            },
          ],
        },
      },
    }

    it('returns requiresHls: false for videos under the HLS threshold', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(veryShortVideoResponse))

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.requiresHls).toBe(false)
      expect(data.hlsUrl).toBeNull()
      expect(data.duration).toBe(30)
    })

    it('does not make HEAD requests by default (bitrate estimation)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(veryShortVideoResponse))

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(200)
      const headCalls = mockFetch.mock.calls.filter((call) => call[1]?.method === 'HEAD')
      expect(headCalls).toHaveLength(0)

      const data = await response.json()
      // Sizes should still be populated via bitrate * duration
      expect(data.formats[0].estimatedSize).toBeGreaterThan(0)
    })

    it('fetches actual file sizes via HEAD requests when withSizes=true', async () => {
      // Mock FxTwitter API
      mockFetch.mockResolvedValueOnce(jsonResponse(mockShortVideoResponse))
      // Mock HEAD requests - actual file sizes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-length': '12345678' }), // preview
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-length': '55800000' }), // hd (~55MB)
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-length': '150000000' }), // full
      })

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(
        createRequest({ author: 'user', tweetId: '123', withSizes: 'true' }),
      )

      const data = await response.json()
      expect(data.formats).toHaveLength(3)

      // Check that sizes come from HEAD requests, not bitrate estimation
      const previewFormat = data.formats.find((f: { quality: string }) => f.quality === 'preview')
      expect(previewFormat.estimatedSize).toBe(12345678)

      const hdFormat = data.formats.find((f: { quality: string }) => f.quality === 'hd')
      expect(hdFormat.estimatedSize).toBe(55800000)

      const fullFormat = data.formats.find((f: { quality: string }) => f.quality === 'full')
      expect(fullFormat.estimatedSize).toBe(150000000)
    })

    it('makes HEAD requests with proper headers when withSizes=true', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockShortVideoResponse))
      // Mock HEAD requests
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-length': '10000000' }),
      })

      const { GET } = await import('@/app/api/media/video/info/route')
      await GET(createRequest({ author: 'user', tweetId: '123', withSizes: 'true' }))

      // Verify HEAD requests were made with correct headers
      const headCalls = mockFetch.mock.calls.filter((call) => call[1]?.method === 'HEAD')
      expect(headCalls.length).toBeGreaterThan(0)
      expect(headCalls[0][1].headers).toHaveProperty('User-Agent')
      expect(headCalls[0][1].headers).toHaveProperty('Referer', 'https://twitter.com/')
    })

    it('does not HEAD or expose untrusted FxTwitter media targets', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          tweet: {
            media: {
              videos: [
                {
                  duration: 120,
                  formats: [
                    { url: 'https://evil.example/master.m3u8', bitrate: null },
                    { url: 'https://evil.example/video.mp4', bitrate: 832000 },
                  ],
                },
              ],
            },
          },
        }),
      )

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(
        createRequest({ author: 'untrusted', tweetId: '987', withSizes: 'true' }),
      )
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.hlsUrl).toBeNull()
      expect(data.formats).toEqual([])
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('does not follow a trusted HEAD target redirect to an untrusted host', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          tweet: {
            media: {
              videos: [
                {
                  duration: 120,
                  formats: [{ url: 'https://video.twimg.com/video.mp4', bitrate: 832000 }],
                },
              ],
            },
          },
        }),
      )
      mockFetch.mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example/video.mp4' },
        }),
      )

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(
        createRequest({ author: 'redirected', tweetId: '988', withSizes: 'true' }),
      )

      expect(response.status).toBe(200)
      expect(mockFetch.mock.calls.some(([url]) => String(url).includes('evil.example'))).toBe(false)
    })
  })

  describe('Long video response', () => {
    it('returns requiresHls: true for long videos with m3u8 URL', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockLongVideoResponse))

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.requiresHls).toBe(true)
      expect(data.hlsUrl).toContain('m3u8')
      expect(data.duration).toBe(1200)
    })

    it('returns actual file sizes for long videos when withSizes=true', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockLongVideoResponse))
      // Mock HEAD requests with large file sizes
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-length': '50000000' }), // preview: 50MB
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-length': '180000000' }), // hd: 180MB
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-length': '500000000' }), // full: 500MB
      })

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(
        createRequest({ author: 'user', tweetId: '123', withSizes: 'true' }),
      )

      const data = await response.json()

      const hdFormat = data.formats.find((f: { quality: string }) => f.quality === 'hd')
      expect(hdFormat.estimatedSize).toBe(180000000) // Actual size from HEAD request
    })
  })

  describe('Error handling', () => {
    it('rejects an oversized FxTwitter response body', async () => {
      const cancel = vi.fn()
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < 33; i += 1) {
            controller.enqueue(new Uint8Array(64 * 1024))
          }
        },
        cancel,
      })
      mockFetch.mockResolvedValueOnce(new Response(body))

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'oversized', tweetId: '989' }))

      expect(response.status).toBe(502)
      expect(cancel).toHaveBeenCalledOnce()
    })

    it('returns 404 when no video found', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ tweet: { media: {} } }))

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain('No video found')
    })

    it('selects the Nth video when index is set (multi-video tweets)', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          tweet: {
            media: {
              videos: [
                {
                  duration: 30,
                  url: 'https://video.twimg.com/first.mp4',
                  formats: [
                    {
                      url: 'https://video.twimg.com/first-hd.mp4',
                      bitrate: 2176000,
                      container: 'mp4',
                    },
                  ],
                },
                {
                  duration: 90,
                  url: 'https://video.twimg.com/second.mp4',
                  formats: [
                    {
                      url: 'https://video.twimg.com/second-hd.mp4',
                      bitrate: 2176000,
                      container: 'mp4',
                    },
                  ],
                },
              ],
            },
          },
        }),
      )

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123', index: '2' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.duration).toBe(90)
    })

    it('returns 500 when FxTwitter API fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toContain('Failed to fetch video info')
    })
  })

  describe('Gone tweet (deleted/private/suspended)', () => {
    it('returns 410 with a reason when FxTwitter returns 401', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(410)
      const data = await response.json()
      expect(data.error).toBe('unavailable')
      expect(data.reason).toMatch(/no longer available/i)
    })

    it('returns 410 with a reason when FxTwitter returns 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(410)
      const data = await response.json()
      expect(data.error).toBe('unavailable')
    })

    it('does not report a gone tweet to Sentry as an exception', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      const { GET } = await import('@/app/api/media/video/info/route')
      const { captureException } = await import('@/lib/sentry')
      await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(captureException).not.toHaveBeenCalled()
    })

    it('caches the gone result so a second request skips FxTwitter entirely', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      const { GET } = await import('@/app/api/media/video/info/route')
      const first = await GET(createRequest({ author: 'user', tweetId: '123' }))
      expect(first.status).toBe(410)

      mockFetch.mockClear()

      const second = await GET(createRequest({ author: 'user', tweetId: '123' }))
      expect(second.status).toBe(410)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('keeps the existing 500 behavior for a genuine FxTwitter outage', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toContain('Failed to fetch video info')
    })
  })

  describe('Caching', () => {
    it('reuses cached video info without re-fetching FxTwitter', async () => {
      mockFetch.mockImplementation(() => Promise.resolve(jsonResponse(mockShortVideoResponse)))

      const { GET } = await import('@/app/api/media/video/info/route')
      const request = createRequest({ author: 'cacheuser', tweetId: '800000' })
      await GET(request)
      await GET(request)

      expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('expires video info after one hour', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
      mockFetch.mockImplementation(() => Promise.resolve(jsonResponse(mockShortVideoResponse)))

      const { GET } = await import('@/app/api/media/video/info/route')
      const request = createRequest({ author: 'expiryuser', tweetId: '800001' })
      await GET(request)
      mockFetch.mockClear()

      vi.advanceTimersByTime(60 * 60 * 1_000)
      await GET(request)

      expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('evicts the least-recently-used info after 500 live keys', async () => {
      mockFetch.mockImplementation(() => Promise.resolve(jsonResponse(mockShortVideoResponse)))

      const { GET } = await import('@/app/api/media/video/info/route')
      for (let i = 0; i <= 500; i++) {
        await GET(createRequest({ author: 'boundsuser', tweetId: String(2_000_000 + i) }))
      }
      mockFetch.mockClear()

      await GET(createRequest({ author: 'boundsuser', tweetId: '2000000' }))

      expect(mockFetch).toHaveBeenCalledOnce()
    })
  })
})
