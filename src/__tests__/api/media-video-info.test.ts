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

describe('API: /api/media/video/info', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Input validation', () => {
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
    it('returns requiresHls: false for videos under 5 minutes', async () => {
      // Mock FxTwitter API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockShortVideoResponse),
      })
      // Mock HEAD requests for file sizes (3 formats)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-length': '5000000' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-length': '15000000' }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-length': '50000000' }),
      })

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.requiresHls).toBe(false)
      expect(data.hlsUrl).toBeNull()
      expect(data.duration).toBe(120)
    })

    it('fetches actual file sizes via HEAD requests', async () => {
      // Mock FxTwitter API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockShortVideoResponse),
      })
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
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

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

    it('makes HEAD requests with proper headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockShortVideoResponse),
      })
      // Mock HEAD requests
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-length': '10000000' }),
      })

      const { GET } = await import('@/app/api/media/video/info/route')
      await GET(createRequest({ author: 'user', tweetId: '123' }))

      // Verify HEAD requests were made with correct headers
      const headCalls = mockFetch.mock.calls.filter(
        (call) => call[1]?.method === 'HEAD'
      )
      expect(headCalls.length).toBeGreaterThan(0)
      expect(headCalls[0][1].headers).toHaveProperty('User-Agent')
      expect(headCalls[0][1].headers).toHaveProperty('Referer', 'https://twitter.com/')
    })
  })

  describe('Long video response', () => {
    it('returns requiresHls: true for videos over 5 minutes with m3u8 URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLongVideoResponse),
      })
      // Mock HEAD requests
      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-length': '100000000' }),
      })

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.requiresHls).toBe(true)
      expect(data.hlsUrl).toContain('m3u8')
      expect(data.duration).toBe(1200)
    })

    it('returns actual file sizes for long videos', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLongVideoResponse),
      })
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
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      const data = await response.json()

      const hdFormat = data.formats.find((f: { quality: string }) => f.quality === 'hd')
      expect(hdFormat.estimatedSize).toBe(180000000) // Actual size from HEAD request
    })
  })

  describe('Error handling', () => {
    it('returns 404 when no video found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tweet: { media: {} } }),
      })

      const { GET } = await import('@/app/api/media/video/info/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain('No video found')
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
})
