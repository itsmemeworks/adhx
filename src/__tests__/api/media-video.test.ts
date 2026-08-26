import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * API Route Tests: /api/media/video
 *
 * Tests video URL resolution, quality selection, and caching.
 */

// Mock fetch for FxTwitter API and video streaming
const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('@/lib/sentry', () => ({
  metrics: { mediaUnavailable: vi.fn() },
  captureException: vi.fn(),
}))

function createRequest(params: Record<string, string>, ip?: string): NextRequest {
  const url = new URL('http://localhost:3000/api/media/video')
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })
  return new NextRequest(url, ip ? { headers: { 'fly-client-ip': ip } } : undefined)
}

// Mock video data from FxTwitter
const mockVideoResponse = {
  tweet: {
    media: {
      videos: [
        {
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

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
  })
}

describe('API: /api/media/video', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear the module cache to reset the in-memory cache
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('Input validation', () => {
    it('returns 400 when author is missing', async () => {
      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ tweetId: '123' }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Missing author or tweetId')
    })

    it('returns 400 when tweetId is missing', async () => {
      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'user' }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Missing author or tweetId')
    })
  })

  describe('Video resolution', () => {
    it('fetches video from FxTwitter API', async () => {
      // Mock FxTwitter API response
      mockFetch.mockResolvedValueOnce(jsonResponse(mockVideoResponse))
      // Mock video stream response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream(),
        headers: new Headers({
          'content-type': 'video/mp4',
          'content-length': '1024',
        }),
      })

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'testuser', tweetId: '123456' }))

      expect(response.status).toBe(200)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fxtwitter.com/testuser/status/123456',
        expect.any(Object),
      )
    })

    it('selects the Nth video when index is set (multi-video tweets)', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          tweet: {
            media: {
              videos: [
                {
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      const { GET } = await import('@/app/api/media/video/route')
      await GET(createRequest({ author: 'user', tweetId: '123', index: '2' }))

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://video.twimg.com/second-hd.mp4',
        expect.any(Object),
      )
    })

    it('returns 404 when no video found', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ tweet: { media: {} } }))

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain('No video found')
    })
  })

  describe('Quality selection', () => {
    it('selects preview quality (360p) when requested', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockVideoResponse))
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      const { GET } = await import('@/app/api/media/video/route')
      await GET(createRequest({ author: 'user', tweetId: '123', quality: 'preview' }))

      // Second fetch should be for 360p video
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://video.twimg.com/360p.mp4',
        expect.any(Object),
      )
    })

    it('selects HD quality (720p) by default', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockVideoResponse))
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      const { GET } = await import('@/app/api/media/video/route')
      await GET(createRequest({ author: 'user', tweetId: '123' }))

      // Second fetch should be for 720p video
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://video.twimg.com/720p.mp4',
        expect.any(Object),
      )
    })

    it('selects full quality (1080p) when requested', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockVideoResponse))
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      const { GET } = await import('@/app/api/media/video/route')
      await GET(createRequest({ author: 'user', tweetId: '123', quality: 'full' }))

      // Second fetch should be for 1080p video
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://video.twimg.com/1080p.mp4',
        expect.any(Object),
      )
    })
  })

  describe('Response headers', () => {
    it('sets correct content-type header', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockVideoResponse))
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream(),
        headers: new Headers({
          'content-type': 'video/mp4',
          'content-length': '2048',
        }),
      })

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.headers.get('content-type')).toBe('video/mp4')
    })

    it('includes cache-control header', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockVideoResponse))
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.headers.get('cache-control')).toContain('max-age=3600')
    })

    it('includes accept-ranges header for seeking', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockVideoResponse))
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.headers.get('accept-ranges')).toBe('bytes')
    })
  })

  describe('Range requests (video seeking)', () => {
    it('forwards range header to video server', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockVideoResponse))
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 206,
        body: new ReadableStream(),
        headers: new Headers({
          'content-type': 'video/mp4',
          'content-range': 'bytes 0-1023/2048',
        }),
      })

      const { GET } = await import('@/app/api/media/video/route')
      const request = createRequest({ author: 'user', tweetId: '123' })
      // Add range header to request
      request.headers.set('range', 'bytes=0-1023')

      const response = await GET(request)

      expect(response.status).toBe(206) // Partial content
      expect(response.headers.get('content-range')).toBe('bytes 0-1023/2048')
    })
  })

  describe('Error handling', () => {
    it('rejects and cancels an oversized FxTwitter JSON response', async () => {
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

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'oversized', tweetId: '991' }))

      expect(response.status).toBe(502)
      await expect(response.json()).resolves.toEqual({
        error: 'FxTwitter response exceeds maximum size',
      })
      expect(cancel).toHaveBeenCalledOnce()
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('handles FxTwitter API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toContain('Failed to fetch video')
    })

    it('handles video fetch errors', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockVideoResponse))
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(500)
    })

    it('handles network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(500)
    })

    it('refuses an off-allowlist redirect from the Twitter video CDN', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(mockVideoResponse)).mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example/video.mp4' },
        }),
      )

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'redirectuser', tweetId: '987654321' }))

      expect(response.status).toBe(502)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('Gone tweet (deleted/private/suspended)', () => {
    it('returns 410 with a reason when FxTwitter returns 401', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(410)
      const data = await response.json()
      expect(data.error).toBe('unavailable')
      expect(data.reason).toMatch(/no longer available/i)
    })

    it('returns 410 with a reason when FxTwitter returns 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(410)
      const data = await response.json()
      expect(data.error).toBe('unavailable')
    })

    it('does not report a gone tweet to Sentry as an exception', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      const { GET } = await import('@/app/api/media/video/route')
      const { captureException } = await import('@/lib/sentry')
      await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(captureException).not.toHaveBeenCalled()
    })

    it('caches the gone result so a second request skips FxTwitter entirely', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      const { GET } = await import('@/app/api/media/video/route')
      const first = await GET(createRequest({ author: 'user', tweetId: '123' }))
      expect(first.status).toBe(410)

      mockFetch.mockClear()
      // No response queued — a second FxTwitter fetch would reject if the
      // cache miss made the route attempt one.

      const second = await GET(createRequest({ author: 'user', tweetId: '123', quality: 'full' }))
      expect(second.status).toBe(410)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('keeps the existing 500 behavior for a genuine FxTwitter outage', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toContain('Failed to fetch video')
    })
  })

  describe('Caching', () => {
    it('caches resolved video URLs', async () => {
      // First request - hits API
      mockFetch.mockResolvedValueOnce(jsonResponse(mockVideoResponse))
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      const { GET } = await import('@/app/api/media/video/route')
      await GET(createRequest({ author: 'user', tweetId: '123', quality: 'hd' }))

      // Clear mock calls
      mockFetch.mockClear()

      // Second request - should use cache, only fetch video stream
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      await GET(createRequest({ author: 'user', tweetId: '123', quality: 'hd' }))

      // Should only call fetch once (for video stream), not twice (API + stream)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('video.twimg.com'),
        expect.any(Object),
      )
    })

    it('expires a resolved URL after one hour', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
      mockFetch.mockImplementation((input) =>
        Promise.resolve(
          String(input).startsWith('https://api.fxtwitter.com/')
            ? jsonResponse(mockVideoResponse)
            : {
                ok: true,
                status: 200,
                body: new ReadableStream(),
                headers: new Headers({ 'content-type': 'video/mp4' }),
              },
        ),
      )

      const { GET } = await import('@/app/api/media/video/route')
      const params = { author: 'expiryuser', tweetId: '900001' }
      await GET(createRequest(params, '10.1.0.1'))
      mockFetch.mockClear()

      vi.advanceTimersByTime(60 * 60 * 1_000)
      await GET(createRequest(params, '10.1.0.1'))

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fxtwitter.com/expiryuser/status/900001',
        expect.any(Object),
      )
    })

    it('evicts the least-recently-used URL after 1,000 live keys', async () => {
      mockFetch.mockImplementation((input) =>
        Promise.resolve(
          String(input).startsWith('https://api.fxtwitter.com/')
            ? jsonResponse(mockVideoResponse)
            : {
                ok: true,
                status: 200,
                body: new ReadableStream(),
                headers: new Headers({ 'content-type': 'video/mp4' }),
              },
        ),
      )

      const { GET } = await import('@/app/api/media/video/route')
      for (let i = 0; i <= 1_000; i++) {
        await GET(
          createRequest(
            { author: 'boundsuser', tweetId: String(1_000_000 + i) },
            `10.2.${Math.floor(i / 256)}.${i % 256}`,
          ),
        )
      }
      mockFetch.mockClear()

      await GET(createRequest({ author: 'boundsuser', tweetId: '1000000' }, '10.3.0.1'))

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.fxtwitter.com/boundsuser/status/1000000',
        expect.any(Object),
      )
    })
  })
})
