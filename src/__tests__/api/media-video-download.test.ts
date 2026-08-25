import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * API Route Tests: /api/media/video/download
 *
 * Tests the streaming download endpoint which sets Content-Disposition
 * for instant browser downloads with progress indication.
 */

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('@/lib/sentry', () => ({
  metrics: { mediaUnavailable: vi.fn() },
  captureException: vi.fn(),
}))

function createRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/media/video/download')
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })
  return new NextRequest(url)
}

const mockVideoResponse = {
  tweet: {
    media: {
      videos: [
        {
          url: 'https://video.twimg.com/default.mp4',
          formats: [
            { url: 'https://video.twimg.com/360p.mp4', bitrate: 832000 },
            { url: 'https://video.twimg.com/720p.mp4', bitrate: 2176000 },
            { url: 'https://video.twimg.com/1080p.mp4', bitrate: 10368000 },
          ],
        },
      ],
    },
  },
}

describe('API: /api/media/video/download', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Input validation', () => {
    it('returns 400 when author is missing', async () => {
      const { GET } = await import('@/app/api/media/video/download/route')
      const response = await GET(createRequest({ tweetId: '123' }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Missing author or tweetId')
    })

    it('returns 400 when tweetId is missing', async () => {
      const { GET } = await import('@/app/api/media/video/download/route')
      const response = await GET(createRequest({ author: 'user' }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Missing author or tweetId')
    })
  })

  describe('Download headers', () => {
    it('sets Content-Disposition for attachment download', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({
          'content-type': 'video/mp4',
          'content-length': '1048576',
        }),
      })

      const { GET } = await import('@/app/api/media/video/download/route')
      const response = await GET(createRequest({ author: 'testuser', tweetId: '123456' }))

      expect(response.status).toBe(200)
      expect(response.headers.get('content-disposition')).toBe(
        'attachment; filename="testuser-123456.mp4"',
      )
    })

    it('sets Content-Type as video/mp4', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({
          'content-type': 'video/mp4',
          'content-length': '1048576',
        }),
      })

      const { GET } = await import('@/app/api/media/video/download/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.headers.get('content-type')).toBe('video/mp4')
    })

    it('passes through Content-Length for progress indication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({
          'content-type': 'video/mp4',
          'content-length': '52428800', // 50MB
        }),
      })

      const { GET } = await import('@/app/api/media/video/download/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.headers.get('content-length')).toBe('52428800')
    })
  })

  describe('Quality selection', () => {
    it('defaults to HD quality for bandwidth efficiency', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      const { GET } = await import('@/app/api/media/video/download/route')
      await GET(createRequest({ author: 'user', tweetId: '123' }))

      // Should fetch 720p (HD) by default
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://video.twimg.com/720p.mp4',
        expect.any(Object),
      )
    })

    it('allows requesting full quality', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      const { GET } = await import('@/app/api/media/video/download/route')
      await GET(createRequest({ author: 'user', tweetId: '123', quality: 'full' }))

      // Should fetch 1080p (full)
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://video.twimg.com/1080p.mp4',
        expect.any(Object),
      )
    })

    it('allows requesting preview quality', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      const { GET } = await import('@/app/api/media/video/download/route')
      await GET(createRequest({ author: 'user', tweetId: '123', quality: 'preview' }))

      // Should fetch 360p (preview)
      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://video.twimg.com/360p.mp4',
        expect.any(Object),
      )
    })

    it('selects the Nth video when index is set (multi-video tweets)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            tweet: {
              media: {
                videos: [
                  {
                    url: 'https://video.twimg.com/first.mp4',
                    formats: [
                      { url: 'https://video.twimg.com/first-720p.mp4', bitrate: 2176000 },
                      { url: 'https://video.twimg.com/first-1080p.mp4', bitrate: 10368000 },
                    ],
                  },
                  {
                    url: 'https://video.twimg.com/second.mp4',
                    formats: [
                      { url: 'https://video.twimg.com/second-720p.mp4', bitrate: 2176000 },
                      { url: 'https://video.twimg.com/second-1080p.mp4', bitrate: 10368000 },
                    ],
                  },
                ],
              },
            },
          }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      const { GET } = await import('@/app/api/media/video/download/route')
      await GET(createRequest({ author: 'user', tweetId: '123', index: '2' }))

      expect(mockFetch).toHaveBeenLastCalledWith(
        'https://video.twimg.com/second-720p.mp4',
        expect.any(Object),
      )
    })
  })

  describe('Error handling', () => {
    it('returns 404 when no video found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tweet: { media: {} } }),
      })

      const { GET } = await import('@/app/api/media/video/download/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain('No video found')
    })

    it('returns 404 when no MP4 format available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            tweet: {
              media: {
                videos: [
                  {
                    url: 'https://video.twimg.com/default.m3u8',
                    formats: [
                      // No MP4 formats, only HLS
                      { url: 'https://video.twimg.com/pl/variant.m3u8', bitrate: null },
                    ],
                  },
                ],
              },
            },
          }),
      })

      const { GET } = await import('@/app/api/media/video/download/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain('No MP4 format available')
    })

    it('returns 502 when video fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      const { GET } = await import('@/app/api/media/video/download/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(502)
      const data = await response.json()
      expect(data.error).toContain('Failed to fetch video')
    })
  })

  describe('Gone tweet (deleted/private/suspended)', () => {
    it('returns 410 with a reason when FxTwitter returns 401', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      const { GET } = await import('@/app/api/media/video/download/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(410)
      const data = await response.json()
      expect(data.error).toBe('unavailable')
      expect(data.reason).toMatch(/no longer available/i)
    })

    it('returns 410 with a reason when FxTwitter returns 404', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      const { GET } = await import('@/app/api/media/video/download/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(410)
      const data = await response.json()
      expect(data.error).toBe('unavailable')
    })

    it('does not report a gone tweet to Sentry as an exception', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      const { GET } = await import('@/app/api/media/video/download/route')
      const { captureException } = await import('@/lib/sentry')
      await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(captureException).not.toHaveBeenCalled()
    })

    it('caches the gone result so a second request skips FxTwitter entirely', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      const { GET } = await import('@/app/api/media/video/download/route')
      const first = await GET(createRequest({ author: 'user', tweetId: '123' }))
      expect(first.status).toBe(410)

      mockFetch.mockClear()

      const second = await GET(createRequest({ author: 'user', tweetId: '123', quality: 'full' }))
      expect(second.status).toBe(410)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('keeps the existing 404 behavior for a genuine FxTwitter outage', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

      const { GET } = await import('@/app/api/media/video/download/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain('Failed to fetch video info')
    })
  })
})
