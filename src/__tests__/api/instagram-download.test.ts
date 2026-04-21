import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * API Route Tests: /api/media/instagram/video/download
 *
 * Streams Instagram Reel videos through the server with
 * Content-Disposition: attachment for instant browser downloads.
 */

const mockFetchReelMetadata = vi.fn()

vi.mock('@/lib/media/instafix', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/instafix')>(
    '@/lib/media/instafix',
  )
  return {
    ...actual,
    fetchReelMetadata: mockFetchReelMetadata,
  }
})

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

function createRequest(id: string | null): NextRequest {
  const url = new URL('http://localhost:3000/api/media/instagram/video/download')
  if (id !== null) url.searchParams.set('id', id)
  return new NextRequest(url)
}

const VALID_ID = 'DXVsqQ7CSXw'
const CDN_VIDEO = 'https://scontent-lhr8-1.cdninstagram.com/v/video.mp4'

describe('API: /api/media/instagram/video/download', () => {
  beforeEach(() => {
    mockFetchReelMetadata.mockReset()
    mockFetch.mockReset()
    vi.resetModules()
  })

  describe('Input validation', () => {
    it('returns 400 when id is missing', async () => {
      const { GET } = await import('@/app/api/media/instagram/video/download/route')
      const response = await GET(createRequest(null))

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Missing or invalid id')
    })

    it('returns 400 when id has an unsafe shape', async () => {
      const { GET } = await import('@/app/api/media/instagram/video/download/route')
      const response = await GET(createRequest('../../../etc/passwd'))

      expect(response.status).toBe(400)
    })
  })

  describe('Metadata resolution', () => {
    it('returns 404 when the reel cannot be resolved', async () => {
      mockFetchReelMetadata.mockResolvedValueOnce(null)

      const { GET } = await import('@/app/api/media/instagram/video/download/route')
      const response = await GET(createRequest(VALID_ID))

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain('not found')
    })

    it('returns 403 when the resolved URL is not on the CDN allowlist', async () => {
      mockFetchReelMetadata.mockResolvedValueOnce({
        videoUrl: 'https://evil.com/payload.mp4',
      })

      const { GET } = await import('@/app/api/media/instagram/video/download/route')
      const response = await GET(createRequest(VALID_ID))

      expect(response.status).toBe(403)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('Download streaming', () => {
    it('sets Content-Disposition attachment with instagram-{id}.mp4 filename', async () => {
      mockFetchReelMetadata.mockResolvedValueOnce({ videoUrl: CDN_VIDEO })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({
          'content-type': 'video/mp4',
          'content-length': '1048576',
        }),
      })

      const { GET } = await import('@/app/api/media/instagram/video/download/route')
      const response = await GET(createRequest(VALID_ID))

      expect(response.status).toBe(200)
      expect(response.headers.get('content-disposition')).toBe(
        `attachment; filename="instagram-${VALID_ID}.mp4"`,
      )
      expect(response.headers.get('content-type')).toBe('video/mp4')
      expect(response.headers.get('content-length')).toBe('1048576')
    })

    it('returns 502 when the upstream CDN fetch fails', async () => {
      mockFetchReelMetadata.mockResolvedValueOnce({ videoUrl: CDN_VIDEO })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        body: null,
        headers: new Headers(),
      })

      const { GET } = await import('@/app/api/media/instagram/video/download/route')
      const response = await GET(createRequest(VALID_ID))

      expect(response.status).toBe(502)
      const data = await response.json()
      expect(data.error).toContain('Failed to fetch video')
    })

    it('uses a 30s timeout and browser-like UA on the upstream fetch', async () => {
      mockFetchReelMetadata.mockResolvedValueOnce({ videoUrl: CDN_VIDEO })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      const { GET } = await import('@/app/api/media/instagram/video/download/route')
      await GET(createRequest(VALID_ID))

      expect(mockFetch).toHaveBeenCalledWith(
        CDN_VIDEO,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('Mozilla'),
          }),
        }),
      )
    })
  })
})
