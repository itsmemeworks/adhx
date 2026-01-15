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

function createRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/media/video')
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })
  return new NextRequest(url)
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

describe('API: /api/media/video', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear the module cache to reset the in-memory cache
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
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
        expect.any(Object)
      )
    })

    it('returns 404 when no video found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tweet: { media: {} } }),
      })

      const { GET } = await import('@/app/api/media/video/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain('No video found')
    })
  })

  describe('Quality selection', () => {
    it('selects preview quality (360p) when requested', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
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
        expect.any(Object)
      )
    })

    it('selects HD quality (720p) by default', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
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
        expect.any(Object)
      )
    })

    it('selects full quality (1080p) when requested', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
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
        expect.any(Object)
      )
    })
  })

  describe('Response headers', () => {
    it('sets correct content-type header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
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
  })

  describe('Caching', () => {
    it('caches resolved video URLs', async () => {
      // First request - hits API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockVideoResponse),
      })
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
        expect.any(Object)
      )
    })
  })
})
