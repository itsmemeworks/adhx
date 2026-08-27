import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  fetchInstagramMetadata: vi.fn(),
  fetchFreshInstagramMetadata: vi.fn(),
  fetchImage: vi.fn(),
  mediaRateLimit: vi.fn(),
  downloadRateLimit: vi.fn(),
}))

vi.mock('@/lib/media/instafix', () => ({
  fetchInstagramMetadata: mocks.fetchInstagramMetadata,
  fetchFreshInstagramMetadata: mocks.fetchFreshInstagramMetadata,
  isAllowedImageUrl: (url: string) => url.startsWith('https://cdninstagram.com/'),
  isValidInstagramId: (id: string) => /^[A-Za-z0-9_-]{5,20}$/.test(id),
}))

vi.mock('@/lib/media/proxy', () => ({
  fetchWithAllowlistedRedirects: mocks.fetchImage,
  isUntrustedMediaRedirectError: () => false,
}))

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  mediaRateLimit: mocks.mediaRateLimit,
  downloadRateLimit: mocks.downloadRateLimit,
}))

function createRequest(id: string, query = ''): NextRequest {
  return new NextRequest(`http://localhost:3000/api/media/instagram/thumbnail?id=${id}${query}`)
}

function imageResponse(status = 200): Response {
  return new Response(status === 200 ? 'image' : null, {
    status,
    headers: { 'content-type': 'image/jpeg' },
  })
}

describe('GET /api/media/instagram/thumbnail', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.fetchInstagramMetadata.mockReset()
    mocks.fetchFreshInstagramMetadata.mockReset()
    mocks.fetchImage.mockReset()
    mocks.mediaRateLimit.mockReset()
    mocks.downloadRateLimit.mockReset()
    mocks.mediaRateLimit.mockReturnValue(null)
    mocks.downloadRateLimit.mockReturnValue(null)
    mocks.fetchInstagramMetadata.mockImplementation((id: string) =>
      Promise.resolve({ imageUrl: `https://cdninstagram.com/${id}.jpg` }),
    )
    mocks.fetchFreshInstagramMetadata.mockImplementation((id: string) =>
      Promise.resolve({ imageUrl: `https://cdninstagram.com/${id}-fresh.jpg` }),
    )
    mocks.fetchImage.mockImplementation(() => Promise.resolve(imageResponse()))
  })

  afterEach(() => vi.useRealTimers())

  it('enforces the public media IP limiter before resolving metadata', async () => {
    mocks.mediaRateLimit.mockReturnValueOnce(
      new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
    )
    const request = createRequest('limited1')
    const { GET } = await import('@/app/api/media/instagram/thumbnail/route')

    const response = await GET(request)

    expect(response.status).toBe(429)
    expect(mocks.mediaRateLimit).toHaveBeenCalledWith(request)
    expect(mocks.fetchInstagramMetadata).not.toHaveBeenCalled()
    expect(mocks.fetchImage).not.toHaveBeenCalled()
  })

  it('uses the stricter attachment limiter for download requests', async () => {
    mocks.downloadRateLimit.mockReturnValueOnce(
      new Response(JSON.stringify({ error: 'Too many downloads' }), { status: 429 }),
    )
    const request = createRequest('limited2', '&download=1')
    const { GET } = await import('@/app/api/media/instagram/thumbnail/route')

    const response = await GET(request)

    expect(response.status).toBe(429)
    expect(mocks.downloadRateLimit).toHaveBeenCalledWith(request)
    expect(mocks.mediaRateLimit).not.toHaveBeenCalled()
    expect(mocks.fetchInstagramMetadata).not.toHaveBeenCalled()
    expect(mocks.fetchImage).not.toHaveBeenCalled()
  })

  it('reuses a cached resolved URL', async () => {
    const { GET } = await import('@/app/api/media/instagram/thumbnail/route')

    expect((await GET(createRequest('cache1'))).status).toBe(200)
    expect((await GET(createRequest('cache1'))).status).toBe(200)

    expect(mocks.fetchInstagramMetadata).toHaveBeenCalledOnce()
    expect(mocks.fetchImage).toHaveBeenCalledTimes(2)
  })

  it('resolves an indexed carousel image and keeps each index in its own cache entry', async () => {
    mocks.fetchInstagramMetadata.mockResolvedValue({
      imageUrl: 'https://cdninstagram.com/first.jpg',
      media: [
        { type: 'photo', imageUrl: 'https://cdninstagram.com/first.jpg' },
        { type: 'photo', imageUrl: 'https://cdninstagram.com/second.jpg' },
      ],
    })
    const { GET } = await import('@/app/api/media/instagram/thumbnail/route')

    expect((await GET(createRequest('album1', '&index=1'))).status).toBe(200)
    expect((await GET(createRequest('album1', '&index=2'))).status).toBe(200)

    expect(mocks.fetchInstagramMetadata).toHaveBeenCalledTimes(2)
    expect(mocks.fetchImage.mock.calls.map(([url]) => url)).toEqual([
      'https://cdninstagram.com/first.jpg',
      'https://cdninstagram.com/second.jpg',
    ])
  })

  it('marks an indexed image as an attachment for Send/download', async () => {
    mocks.fetchInstagramMetadata.mockResolvedValue({
      imageUrl: 'https://cdninstagram.com/first.jpg',
      media: [{ type: 'photo', imageUrl: 'https://cdninstagram.com/first.jpg' }],
    })
    const { GET } = await import('@/app/api/media/instagram/thumbnail/route')

    const response = await GET(createRequest('album2', '&index=1&download=1'))

    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="adhx-instagram-album2-1.jpg"',
    )
    expect(mocks.downloadRateLimit).toHaveBeenCalled()
    expect(mocks.mediaRateLimit).not.toHaveBeenCalled()
  })

  it('bypasses cached metadata and retries once after a signed image URL expires', async () => {
    mocks.fetchImage
      .mockResolvedValueOnce(imageResponse(502))
      .mockResolvedValueOnce(imageResponse())
    const { GET } = await import('@/app/api/media/instagram/thumbnail/route')

    expect((await GET(createRequest('retry1'))).status).toBe(200)

    expect(mocks.fetchInstagramMetadata).toHaveBeenCalledOnce()
    expect(mocks.fetchFreshInstagramMetadata).toHaveBeenCalledOnce()
    expect(mocks.fetchImage.mock.calls.map(([url]) => url)).toEqual([
      'https://cdninstagram.com/retry1.jpg',
      'https://cdninstagram.com/retry1-fresh.jpg',
    ])
  })

  it('expires a resolved thumbnail URL after 30 minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
    const { GET } = await import('@/app/api/media/instagram/thumbnail/route')

    await GET(createRequest('expiry1'))
    mocks.fetchInstagramMetadata.mockClear()
    vi.advanceTimersByTime(30 * 60 * 1_000)
    await GET(createRequest('expiry1'))

    expect(mocks.fetchInstagramMetadata).toHaveBeenCalledOnce()
  })

  it('evicts the least-recently-used URL after 1,000 live keys', async () => {
    const { GET } = await import('@/app/api/media/instagram/thumbnail/route')
    for (let i = 0; i <= 1_000; i++) {
      await GET(createRequest(`bounds${i}`))
    }
    mocks.fetchInstagramMetadata.mockClear()

    await GET(createRequest('bounds0'))

    expect(mocks.fetchInstagramMetadata).toHaveBeenCalledOnce()
  })
})
