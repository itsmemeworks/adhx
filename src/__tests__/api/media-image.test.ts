import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * API Route Tests: /api/media/image
 *
 * Covers the inline (cacheable) proxy behavior plus the `download=1` variant
 * added for the theater's Download button on Twitter photo posts (mirrors
 * `media-video-download.test.ts`'s conventions for the video download route).
 */

const mockFetch = vi.fn()
global.fetch = mockFetch

function createRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/media/image')
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })
  return new NextRequest(url)
}

describe('API: /api/media/image', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Input validation', () => {
    it('returns 400 when author is missing', async () => {
      const { GET } = await import('@/app/api/media/image/route')
      const response = await GET(createRequest({ tweetId: '123' }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Missing author or tweetId')
    })

    it('returns 400 when tweetId is missing', async () => {
      const { GET } = await import('@/app/api/media/image/route')
      const response = await GET(createRequest({ author: 'user' }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Missing author or tweetId')
    })

    it('returns 400 for an invalid author (SSRF guard against a crafted param)', async () => {
      const { GET } = await import('@/app/api/media/image/route')
      const response = await GET(createRequest({ author: 'not valid!', tweetId: '123' }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid author or tweetId')
    })

    it('returns 400 for a non-numeric tweetId', async () => {
      const { GET } = await import('@/app/api/media/image/route')
      const response = await GET(createRequest({ author: 'user', tweetId: 'abc' }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid author or tweetId')
    })

    it('returns 400 for an invalid index', async () => {
      const { GET } = await import('@/app/api/media/image/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123', index: '0' }))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid index')
    })
  })

  describe('Inline (default) response', () => {
    it('proxies the FxTwitter image CDN with a cacheable Content-Type and no Content-Disposition', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'image/jpeg', 'content-length': '2048' }),
      })

      const { GET } = await import('@/app/api/media/image/route')
      const response = await GET(createRequest({ author: 'testuser', tweetId: '123456' }))

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/jpeg')
      expect(response.headers.get('content-disposition')).toBeNull()
      expect(mockFetch).toHaveBeenCalledWith(
        'https://d.fixupx.com/testuser/status/123456/photo/1',
        expect.any(Object),
      )
    })
  })

  describe('download=1 variant', () => {
    it('sets Content-Disposition: attachment with a sensible filename', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'image/jpeg', 'content-length': '2048' }),
      })

      const { GET } = await import('@/app/api/media/image/route')
      const response = await GET(
        createRequest({ author: 'testuser', tweetId: '123456', download: '1' }),
      )

      expect(response.status).toBe(200)
      expect(response.headers.get('content-disposition')).toBe(
        'attachment; filename="adhx-testuser-123456.jpg"',
      )
    })

    it('passes through the upstream Content-Type instead of hardcoding it', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'image/png' }),
      })

      const { GET } = await import('@/app/api/media/image/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123', download: '1' }))

      expect(response.headers.get('content-type')).toBe('image/png')
    })

    it('passes through Content-Length for progress indication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'image/jpeg', 'content-length': '52428' }),
      })

      const { GET } = await import('@/app/api/media/image/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123', download: '1' }))

      expect(response.headers.get('content-length')).toBe('52428')
    })

    it('respects the requested photo index', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'image/jpeg' }),
      })

      const { GET } = await import('@/app/api/media/image/route')
      await GET(createRequest({ author: 'user', tweetId: '123', index: '2', download: '1' }))

      expect(mockFetch).toHaveBeenCalledWith(
        'https://d.fixupx.com/user/status/123/photo/2',
        expect.any(Object),
      )
    })
  })

  describe('Error handling', () => {
    it('returns 500 when the upstream fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

      const { GET } = await import('@/app/api/media/image/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '123' }))

      expect(response.status).toBe(500)
      const data = await response.json()
      expect(data.error).toContain('Failed to fetch image')
    })

    it('refuses an off-allowlist redirect from the image proxy host', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example/image.jpg' },
        }),
      )

      const { GET } = await import('@/app/api/media/image/route')
      const response = await GET(createRequest({ author: 'user', tweetId: '456' }))

      expect(response.status).toBe(502)
      expect(mockFetch).toHaveBeenCalledOnce()
    })
  })
})
