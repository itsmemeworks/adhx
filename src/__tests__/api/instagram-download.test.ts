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
global.fetch = mockFetch as unknown as typeof fetch

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
  beforeEach(() => mockFetch.mockReset())

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
    mockFetch.mockResolvedValue(upstream(404))
    const { GET } = await import('@/app/api/media/instagram/video/route')
    const response = await GET(createRequest('/api/media/instagram/video', 'DYP6_iUlDzp'))
    expect(response.status).toBe(502)
  })

  it('download route returns the stream as an attachment', async () => {
    mockFetch.mockResolvedValueOnce(upstream(200, { 'content-type': 'video/mp4' }))
    const { GET } = await import('@/app/api/media/instagram/video/download/route')
    const response = await GET(createRequest('/api/media/instagram/video/download', 'DYP6_iUlDzp'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('attachment')
    expect(response.headers.get('content-disposition')).toContain('instagram-DYP6_iUlDzp.mp4')
  })
})
