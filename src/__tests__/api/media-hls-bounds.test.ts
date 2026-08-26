import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { __resetRateLimitState } from '@/lib/rate-limit'
import { MAX_HLS_PLAYLIST_BYTES } from '@/app/api/media/video/hls/route'
import { MAX_HLS_SEGMENT_BYTES } from '@/app/api/media/video/hls/segment/route'

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }))

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

function request(path: string, upstreamUrl: string): NextRequest {
  const url = new URL(`http://localhost:3000${path}`)
  url.searchParams.set('url', upstreamUrl)
  return new NextRequest(url)
}

function cancellableBody(bytes = new Uint8Array([1])) {
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
    cancel,
  })
  return { body, cancel }
}

describe('bounded HLS media proxies', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    __resetRateLimitState()
  })

  it('rejects and cancels a playlist with an oversized Content-Length', async () => {
    const { body, cancel } = cancellableBody()
    mockFetch.mockResolvedValueOnce(
      new Response(body, {
        headers: { 'content-length': String(MAX_HLS_PLAYLIST_BYTES + 1) },
      }),
    )

    const { GET } = await import('@/app/api/media/video/hls/route')
    const response = await GET(
      request('/api/media/video/hls', 'https://video.twimg.com/path/master.m3u8'),
    )

    expect(response.status).toBe(413)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('rejects a streamed playlist body that crosses the byte ceiling', async () => {
    const { body } = cancellableBody(new Uint8Array(MAX_HLS_PLAYLIST_BYTES + 1))
    mockFetch.mockResolvedValueOnce(new Response(body))

    const { GET } = await import('@/app/api/media/video/hls/route')
    const response = await GET(
      request('/api/media/video/hls', 'https://video.twimg.com/path/master.m3u8'),
    )

    expect(response.status).toBe(413)
  })

  it('does not expose an off-allowlist nested playlist URL', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('#EXTM3U\nhttps://evil.example/variant.m3u8\n', { status: 200 }),
    )

    const { GET } = await import('@/app/api/media/video/hls/route')
    const response = await GET(
      request('/api/media/video/hls', 'https://video.twimg.com/path/master.m3u8'),
    )

    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('evil.example')
  })

  it('rejects and cancels a clearly oversized segment', async () => {
    const { body, cancel } = cancellableBody()
    mockFetch.mockResolvedValueOnce(
      new Response(body, {
        headers: {
          'content-type': 'video/mp2t',
          'content-length': String(MAX_HLS_SEGMENT_BYTES + 1),
        },
      }),
    )

    const { GET } = await import('@/app/api/media/video/hls/segment/route')
    const response = await GET(
      request('/api/media/video/hls/segment', 'https://video.twimg.com/path/segment.ts'),
    )

    expect(response.status).toBe(413)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('cancels a chunked segment when streamed bytes cross the ceiling', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_HLS_SEGMENT_BYTES + 1))
      },
      cancel,
    })
    mockFetch.mockResolvedValueOnce(
      new Response(body, { headers: { 'content-type': 'video/mp2t' } }),
    )

    const { GET } = await import('@/app/api/media/video/hls/segment/route')
    const response = await GET(
      request('/api/media/video/hls/segment', 'https://video.twimg.com/path/segment.ts'),
    )

    expect(response.status).toBe(200)
    await expect(response.arrayBuffer()).rejects.toMatchObject({
      name: 'MediaResponseTooLargeError',
    })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('streams a segment without buffering and preserves range headers/status', async () => {
    const upstream = new Response(cancellableBody().body, {
      status: 206,
      headers: {
        'content-type': 'video/mp2t',
        'content-length': '1',
        'content-range': 'bytes 0-0/20',
        'accept-ranges': 'bytes',
      },
    })
    const arrayBuffer = vi.fn()
    Object.defineProperty(upstream, 'arrayBuffer', { value: arrayBuffer })
    mockFetch.mockResolvedValueOnce(upstream)

    const { GET } = await import('@/app/api/media/video/hls/segment/route')
    const response = await GET(
      request('/api/media/video/hls/segment', 'https://video.twimg.com/path/segment.ts'),
    )

    expect(response.status).toBe(206)
    expect(response.headers.get('content-length')).toBe('1')
    expect(response.headers.get('content-range')).toBe('bytes 0-0/20')
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('cancels and rejects an off-allowlist segment redirect', async () => {
    const { body, cancel } = cancellableBody()
    mockFetch.mockResolvedValueOnce(
      new Response(body, {
        status: 302,
        headers: { location: 'https://evil.example/payload.ts' },
      }),
    )

    const { GET } = await import('@/app/api/media/video/hls/segment/route')
    const response = await GET(
      request('/api/media/video/hls/segment', 'https://video.twimg.com/path/segment.ts'),
    )

    expect(response.status).toBe(502)
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledOnce()
  })
})
