import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * API Route Tests: Instagram video + download endpoints.
 *
 * Instagram video is resolved through the pluggable mirror registry
 * (src/lib/media/mirrors.ts) and streamed via our proxy. fetch is mocked here so
 * the routes are tested without hitting a real mirror.
 */

const mockFetch = vi.fn()
const mockDownloadRateLimit = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

vi.mock('@/lib/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit')
  return { ...actual, downloadRateLimit: mockDownloadRateLimit }
})

function createRequest(path: string, id: string | null, range?: string): NextRequest {
  const url = new URL(`http://localhost:3000${path}`)
  if (id !== null) url.searchParams.set('id', id)
  return new NextRequest(url, range ? { headers: { range } } : undefined)
}

/** A minimal streamable upstream Response stub. */
function upstream(status: number, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: new ReadableStream(),
    headers: new Headers(headers),
  } as unknown as Response
}

describe('Instagram video endpoints', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockDownloadRateLimit.mockReset()
    mockDownloadRateLimit.mockReturnValue(null)
  })

  it('rejects a missing/invalid id with 400 (no fetch)', async () => {
    const { GET } = await import('@/app/api/media/instagram/video/route')
    const response = await GET(createRequest('/api/media/instagram/video', null))
    expect(response.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('streams the mirror MP4 and forwards the Range header', async () => {
    mockFetch.mockResolvedValueOnce(
      upstream(206, { 'content-type': 'video/mp4', 'content-range': 'bytes 0-1023/3637471' }),
    )
    const { GET } = await import('@/app/api/media/instagram/video/route')
    const response = await GET(
      createRequest('/api/media/instagram/video', 'DYP6_iUlDzp', 'bytes=0-1023'),
    )

    expect(response.status).toBe(206)
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    // The reel id is resolved via the mirror registry (vxinstagram offload URL)...
    const [calledUrl, init] = mockFetch.mock.calls[0]
    expect(String(calledUrl)).toContain('vxinstagram.com/offload/DYP6_iUlDzp/0.mp4')
    // ...and the client's Range is forwarded upstream for seeking.
    expect((init?.headers as Record<string, string>).Range).toBe('bytes=0-1023')
  })

  it('502s when every mirror fails (client falls back to the poster)', async () => {
    // A fatal status, not 404: for vxinstagram a 404 means "cold cache, still
    // fetching" and is deliberately retried across a ~22s budget, which would
    // just time this test out. The retry policy itself is covered in
    // media-mirrors.test.ts; this asserts the route's give-up path.
    mockFetch.mockResolvedValue(upstream(403))
    const { GET } = await import('@/app/api/media/instagram/video/route')
    const response = await GET(createRequest('/api/media/instagram/video', 'DYP6_iUlDzp'))
    expect(response.status).toBe(502)
  })

  it('retries a cold-cache 404 and streams the MP4 once the mirror warms up', async () => {
    // The regression that made downloads look broken: the first request for any
    // Reel 404s while the mirror's backend fetches it. Giving up there failed
    // every first-ever request.
    vi.useFakeTimers()
    try {
      mockFetch
        .mockResolvedValueOnce(upstream(404))
        .mockResolvedValueOnce(upstream(404))
        .mockResolvedValueOnce(upstream(200, { 'content-type': 'video/mp4' }))

      const { GET } = await import('@/app/api/media/instagram/video/route')
      const pending = GET(createRequest('/api/media/instagram/video', 'DYP6_iUlDzp'))
      await vi.runAllTimersAsync()
      const response = await pending

      expect(response.status).toBe(200)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('download route returns the stream as an attachment', async () => {
    mockFetch.mockResolvedValueOnce(upstream(200, { 'content-type': 'video/mp4' }))
    const { GET } = await import('@/app/api/media/instagram/video/download/route')
    const response = await GET(createRequest('/api/media/instagram/video/download', 'DYP6_iUlDzp'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('attachment')
    expect(response.headers.get('content-disposition')).toContain('instagram-DYP6_iUlDzp.mp4')
  })

  it('download route rate-limits before resolving a mirror', async () => {
    mockDownloadRateLimit.mockReturnValueOnce(new Response(null, { status: 429 }))

    const { GET } = await import('@/app/api/media/instagram/video/download/route')
    const response = await GET(createRequest('/api/media/instagram/video/download', 'DYP6_iUlDzp'))

    expect(response.status).toBe(429)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('download route rejects a mirror redirect to an untrusted host', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example/video.mp4' },
      }),
    )

    const { GET } = await import('@/app/api/media/instagram/video/download/route')
    const response = await GET(createRequest('/api/media/instagram/video/download', 'DYP6_iUlDzp'))

    expect(response.status).toBe(502)
    expect(mockFetch).toHaveBeenCalledOnce()
  })
})
