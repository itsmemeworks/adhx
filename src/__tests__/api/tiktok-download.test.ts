import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * API Route Tests: /api/media/tiktok/video/download
 *
 * Streams TikTok videos through the server with
 * `Content-Disposition: attachment` for instant downloads.
 */

const mockFetchTikTokMetadata = vi.fn()

vi.mock('@/lib/media/tnktok', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/tnktok')>('@/lib/media/tnktok')
  return {
    ...actual,
    fetchTikTokMetadata: mockFetchTikTokMetadata,
  }
})

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

function createRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/media/tiktok/video/download')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url)
}

const HANDLE = 'sophieraiin'
const VIDEO_ID = '7619017281691045134'
const VIDEO_URL = `https://offload.tnktok.com/generate/video/${VIDEO_ID}.mp4`

describe('API: /api/media/tiktok/video/download', () => {
  beforeEach(() => {
    mockFetchTikTokMetadata.mockReset()
    mockFetch.mockReset()
    vi.resetModules()
  })

  describe('Input validation', () => {
    it('returns 400 when username is missing', async () => {
      const { GET } = await import('@/app/api/media/tiktok/video/download/route')
      const response = await GET(createRequest({ id: VIDEO_ID }))
      expect(response.status).toBe(400)
    })

    it('returns 400 when id is missing', async () => {
      const { GET } = await import('@/app/api/media/tiktok/video/download/route')
      const response = await GET(createRequest({ username: HANDLE }))
      expect(response.status).toBe(400)
    })

    it('returns 400 for an unsafe username shape', async () => {
      const { GET } = await import('@/app/api/media/tiktok/video/download/route')
      const response = await GET(createRequest({ username: '../etc', id: VIDEO_ID }))
      expect(response.status).toBe(400)
    })

    it('returns 400 for a non-numeric id', async () => {
      const { GET } = await import('@/app/api/media/tiktok/video/download/route')
      const response = await GET(createRequest({ username: HANDLE, id: 'abc' }))
      expect(response.status).toBe(400)
    })
  })

  describe('Metadata resolution', () => {
    it('returns 404 when the TikTok cannot be resolved', async () => {
      mockFetchTikTokMetadata.mockResolvedValueOnce(null)
      const { GET } = await import('@/app/api/media/tiktok/video/download/route')
      const response = await GET(createRequest({ username: HANDLE, id: VIDEO_ID }))
      expect(response.status).toBe(404)
    })

    it('returns 403 when the resolved URL is not on the allowlist', async () => {
      mockFetchTikTokMetadata.mockResolvedValueOnce({ videoUrl: 'https://evil.com/payload.mp4' })
      const { GET } = await import('@/app/api/media/tiktok/video/download/route')
      const response = await GET(createRequest({ username: HANDLE, id: VIDEO_ID }))
      expect(response.status).toBe(403)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('Download streaming', () => {
    it('sets Content-Disposition attachment with tiktok-{handle}-{id}.mp4 filename', async () => {
      mockFetchTikTokMetadata.mockResolvedValueOnce({ videoUrl: VIDEO_URL })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4', 'content-length': '4128865' }),
      })

      const { GET } = await import('@/app/api/media/tiktok/video/download/route')
      const response = await GET(createRequest({ username: HANDLE, id: VIDEO_ID }))

      expect(response.status).toBe(200)
      expect(response.headers.get('content-disposition')).toBe(
        `attachment; filename="tiktok-${HANDLE}-${VIDEO_ID}.mp4"`,
      )
      expect(response.headers.get('content-type')).toBe('video/mp4')
      expect(response.headers.get('content-length')).toBe('4128865')
    })

    it('strips the leading @ from the username in the filename', async () => {
      mockFetchTikTokMetadata.mockResolvedValueOnce({ videoUrl: VIDEO_URL })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream(),
        headers: new Headers({ 'content-type': 'video/mp4' }),
      })

      const { GET } = await import('@/app/api/media/tiktok/video/download/route')
      const response = await GET(createRequest({ username: `@${HANDLE}`, id: VIDEO_ID }))

      expect(response.headers.get('content-disposition')).toBe(
        `attachment; filename="tiktok-${HANDLE}-${VIDEO_ID}.mp4"`,
      )
    })

    it('returns 502 when the upstream fetch fails', async () => {
      mockFetchTikTokMetadata.mockResolvedValueOnce({ videoUrl: VIDEO_URL })
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403, body: null, headers: new Headers() })

      const { GET } = await import('@/app/api/media/tiktok/video/download/route')
      const response = await GET(createRequest({ username: HANDLE, id: VIDEO_ID }))
      expect(response.status).toBe(502)
    })
  })
})
