import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  fetchReelMetadata: vi.fn(),
  fetchImage: vi.fn(),
  mediaRateLimit: vi.fn(),
}))

vi.mock('@/lib/media/instafix', () => ({
  fetchReelMetadata: mocks.fetchReelMetadata,
  isAllowedImageUrl: (url: string) => url.startsWith('https://cdninstagram.com/'),
  isValidReelId: (id: string) => /^[A-Za-z0-9_-]{5,20}$/.test(id),
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
}))

function createRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/media/instagram/thumbnail?id=${id}`)
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
    mocks.fetchReelMetadata.mockReset()
    mocks.fetchImage.mockReset()
    mocks.mediaRateLimit.mockReset()
    mocks.mediaRateLimit.mockReturnValue(null)
    mocks.fetchReelMetadata.mockImplementation((id: string) =>
      Promise.resolve({ imageUrl: `https://cdninstagram.com/${id}.jpg` }),
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
    expect(mocks.fetchReelMetadata).not.toHaveBeenCalled()
    expect(mocks.fetchImage).not.toHaveBeenCalled()
  })

  it('reuses a cached resolved URL', async () => {
    const { GET } = await import('@/app/api/media/instagram/thumbnail/route')

    expect((await GET(createRequest('cache1'))).status).toBe(200)
    expect((await GET(createRequest('cache1'))).status).toBe(200)

    expect(mocks.fetchReelMetadata).toHaveBeenCalledOnce()
    expect(mocks.fetchImage).toHaveBeenCalledTimes(2)
  })

  it('preserves explicit invalidation after an upstream image failure', async () => {
    mocks.fetchImage
      .mockResolvedValueOnce(imageResponse(502))
      .mockResolvedValueOnce(imageResponse())
    const { GET } = await import('@/app/api/media/instagram/thumbnail/route')

    expect((await GET(createRequest('retry1'))).status).toBe(502)
    expect((await GET(createRequest('retry1'))).status).toBe(200)

    expect(mocks.fetchReelMetadata).toHaveBeenCalledTimes(2)
  })

  it('expires a resolved thumbnail URL after 30 minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
    const { GET } = await import('@/app/api/media/instagram/thumbnail/route')

    await GET(createRequest('expiry1'))
    mocks.fetchReelMetadata.mockClear()
    vi.advanceTimersByTime(30 * 60 * 1_000)
    await GET(createRequest('expiry1'))

    expect(mocks.fetchReelMetadata).toHaveBeenCalledOnce()
  })

  it('evicts the least-recently-used URL after 1,000 live keys', async () => {
    const { GET } = await import('@/app/api/media/instagram/thumbnail/route')
    for (let i = 0; i <= 1_000; i++) {
      await GET(createRequest(`bounds${i}`))
    }
    mocks.fetchReelMetadata.mockClear()

    await GET(createRequest('bounds0'))

    expect(mocks.fetchReelMetadata).toHaveBeenCalledOnce()
  })
})
