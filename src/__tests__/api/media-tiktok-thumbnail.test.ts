import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/media/tiktok/thumbnail/route'

/**
 * API Route Tests: /api/media/tiktok/thumbnail
 *
 * Step 1 resolves a CDN image URL by scraping tiktxk.com's og:image tag —
 * untrusted content. Step 2 must not fetch that resolved URL unless its host
 * is on the TikTok CDN allowlist (SSRF guard), same pattern as every sibling
 * media proxy.
 */

const mocks = vi.hoisted(() => ({
  mediaRateLimit: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  mediaRateLimit: mocks.mediaRateLimit,
}))

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

function createRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/media/tiktok/thumbnail')
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  return new NextRequest(url)
}

function mirrorHtml(ogImageUrl: string) {
  return `<html><head><meta property="og:image" content="${ogImageUrl}"/></head></html>`
}

function htmlResponse(html: string) {
  return new Response(html, { headers: { 'content-type': 'text/html' } })
}

function imageResponse() {
  return {
    ok: true,
    body: new ReadableStream(),
    headers: new Headers({ 'content-type': 'image/jpeg' }),
  }
}

describe('GET /api/media/tiktok/thumbnail', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mocks.mediaRateLimit.mockReset()
    mocks.mediaRateLimit.mockReturnValue(null)
  })
  afterEach(() => vi.useRealTimers())

  it('enforces the public media IP limiter before resolving the mirror', async () => {
    mocks.mediaRateLimit.mockReturnValueOnce(
      new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
    )
    const request = createRequest({ username: 'limited_user', id: '7619017281691045100' })

    const res = await GET(request)

    expect(res.status).toBe(429)
    expect(mocks.mediaRateLimit).toHaveBeenCalledWith(request)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rejects invalid username/id without fetching anything', async () => {
    const res = await GET(createRequest({ username: 'bad user!', id: '123' }))
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches the mirror then the resolved CDN image when the host is allowed', async () => {
    const cdnUrl = 'https://p16-sign-va.tiktokcdn-eu.com/thumb.jpeg?x-expires=1&x-signature=abc'
    mockFetch
      .mockResolvedValueOnce(htmlResponse(mirrorHtml(cdnUrl)))
      .mockResolvedValueOnce(imageResponse())

    const res = await GET(createRequest({ username: 'alpha_user', id: '7619017281691045134' }))

    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const [imageCallUrl] = mockFetch.mock.calls[1]
    expect(imageCallUrl).toBe(cdnUrl)
  })

  it('SSRF guard: refuses to fetch a resolved CDN URL on an untrusted host', async () => {
    mockFetch.mockResolvedValueOnce(htmlResponse(mirrorHtml('https://evil.com/steal.jpg')))

    const res = await GET(createRequest({ username: 'bravo_user', id: '7619017281691045135' }))

    expect(res.status).toBe(502)
    // Only the mirror fetch happened — the untrusted image URL was never fetched.
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('SSRF guard: refuses a lookalike host (subdomain-suffix attack)', async () => {
    mockFetch.mockResolvedValueOnce(
      htmlResponse(mirrorHtml('https://tiktokcdn-eu.com.evil.com/steal.jpg')),
    )

    const res = await GET(createRequest({ username: 'charlie_user', id: '7619017281691045136' }))

    expect(res.status).toBe(502)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('rejects an off-allowlist redirect from the thumbnail mirror', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example/thumb.jpg' },
      }),
    )

    const res = await GET(createRequest({ username: 'redirect_user', id: '7619017281691045138' }))

    expect(res.status).toBe(502)
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('reuses a cached, already-validated CDN URL without re-hitting the mirror', async () => {
    const cdnUrl = 'https://p16-sign-va.tiktokcdn-us.com/thumb.jpeg'
    mockFetch
      .mockResolvedValueOnce(htmlResponse(mirrorHtml(cdnUrl)))
      .mockResolvedValueOnce(imageResponse())

    const params = { username: 'delta_user', id: '7619017281691045137' }
    const first = await GET(createRequest(params))
    expect(first.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(2)

    mockFetch.mockResolvedValueOnce(imageResponse())
    const second = await GET(createRequest(params))
    expect(second.status).toBe(200)
    // Only the image fetch happens on the cache hit — no second mirror call.
    expect(mockFetch).toHaveBeenCalledTimes(3)
    const [secondImageCallUrl] = mockFetch.mock.calls[2]
    expect(secondImageCallUrl).toBe(cdnUrl)
  })

  it('evicts a failed cached signed URL and resolves the mirror once more', async () => {
    const staleUrl = 'https://p16-sign-va.tiktokcdn-us.com/stale.jpeg?x-signature=expired'
    const freshUrl = 'https://p16-sign-va.tiktokcdn-us.com/fresh.jpeg?x-signature=current'
    const params = { username: 'stale_user', id: '7619017281691045180' }
    mockFetch
      .mockResolvedValueOnce(htmlResponse(mirrorHtml(staleUrl)))
      .mockResolvedValueOnce(imageResponse())

    expect((await GET(createRequest(params))).status).toBe(200)
    mockFetch.mockReset()
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(htmlResponse(mirrorHtml(freshUrl)))
      .mockResolvedValueOnce(imageResponse())

    const retried = await GET(createRequest(params))

    expect(retried.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(mockFetch.mock.calls.map(([url]) => String(url))).toEqual([
      staleUrl,
      `https://tiktxk.com/@stale_user/video/${params.id}`,
      freshUrl,
    ])
  })

  it('evicts a cached URL after an untrusted redirect and safely re-resolves once', async () => {
    const staleUrl = 'https://p16-sign-va.tiktokcdn-us.com/redirect-stale.jpeg'
    const freshUrl = 'https://p16-sign-va.tiktokcdn-eu.com/redirect-fresh.jpeg'
    const params = { username: 'redirect_cache_user', id: '7619017281691045181' }
    mockFetch
      .mockResolvedValueOnce(htmlResponse(mirrorHtml(staleUrl)))
      .mockResolvedValueOnce(imageResponse())

    expect((await GET(createRequest(params))).status).toBe(200)
    mockFetch.mockReset()
    mockFetch
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example/stolen.jpeg' },
        }),
      )
      .mockResolvedValueOnce(htmlResponse(mirrorHtml(freshUrl)))
      .mockResolvedValueOnce(imageResponse())

    const retried = await GET(createRequest(params))

    expect(retried.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes('evil.example'))).toBe(false)
    expect(mockFetch.mock.calls.map(([url]) => String(url))).toEqual([
      staleUrl,
      `https://tiktxk.com/@redirect_cache_user/video/${params.id}`,
      freshUrl,
    ])
  })

  it('stops after one cached-URL re-resolution attempt', async () => {
    const staleUrl = 'https://p16-sign-va.tiktokcdn-us.com/once-stale.jpeg'
    const replacementUrl = 'https://p16-sign-va.tiktokcdn-eu.com/once-replacement.jpeg'
    const params = { username: 'once_user', id: '7619017281691045182' }
    mockFetch
      .mockResolvedValueOnce(htmlResponse(mirrorHtml(staleUrl)))
      .mockResolvedValueOnce(imageResponse())

    expect((await GET(createRequest(params))).status).toBe(200)
    mockFetch.mockReset()
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(htmlResponse(mirrorHtml(replacementUrl)))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))

    const failed = await GET(createRequest(params))

    expect(failed.status).toBe(502)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('shares one deadline across cached fetch, mirror re-resolution, and retry', async () => {
    vi.useFakeTimers()
    const startedAt = new Date('2026-08-26T12:00:00Z')
    vi.setSystemTime(startedAt)
    const staleUrl = 'https://p16-sign-va.tiktokcdn-us.com/deadline-stale.jpeg'
    const freshUrl = 'https://p16-sign-va.tiktokcdn-eu.com/deadline-fresh.jpeg'
    const params = { username: 'deadline_user', id: '7619017281691045183' }
    mockFetch
      .mockResolvedValueOnce(htmlResponse(mirrorHtml(staleUrl)))
      .mockResolvedValueOnce(imageResponse())

    expect((await GET(createRequest(params))).status).toBe(200)
    mockFetch.mockReset()
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    mockFetch
      .mockImplementationOnce(() => {
        vi.setSystemTime(startedAt.getTime() + 4_000)
        return Promise.resolve(new Response(null, { status: 403 }))
      })
      .mockImplementationOnce(() => {
        vi.setSystemTime(startedAt.getTime() + 8_000)
        return Promise.resolve(htmlResponse(mirrorHtml(freshUrl)))
      })
      .mockResolvedValueOnce(imageResponse())

    const retried = await GET(createRequest(params))

    expect(retried.status).toBe(200)
    expect(timeoutSpy.mock.calls.map(([timeout]) => timeout)).toEqual([10_000, 6_000, 2_000])
    timeoutSpy.mockRestore()
  })

  it('does not start mirror re-resolution after the request deadline expires', async () => {
    vi.useFakeTimers()
    const startedAt = new Date('2026-08-26T12:10:00Z')
    vi.setSystemTime(startedAt)
    const staleUrl = 'https://p16-sign-va.tiktokcdn-us.com/deadline-expired.jpeg'
    const params = { username: 'expired_deadline_user', id: '7619017281691045184' }
    mockFetch
      .mockResolvedValueOnce(htmlResponse(mirrorHtml(staleUrl)))
      .mockResolvedValueOnce(imageResponse())

    expect((await GET(createRequest(params))).status).toBe(200)
    mockFetch.mockReset()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockFetch.mockImplementationOnce(() => {
      vi.setSystemTime(startedAt.getTime() + 10_000)
      return Promise.resolve(new Response(null, { status: 403 }))
    })

    const failed = await GET(createRequest(params))

    expect(failed.status).toBe(500)
    expect(mockFetch).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })

  it('expires a resolved thumbnail URL after one hour', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
    const cdnUrl = 'https://p16-sign-va.tiktokcdn-us.com/expiry.jpeg'
    mockFetch.mockImplementation((input) =>
      Promise.resolve(
        String(input).startsWith('https://tiktxk.com/')
          ? htmlResponse(mirrorHtml(cdnUrl))
          : imageResponse(),
      ),
    )
    const params = { username: 'expiry_user', id: '7619017281691045199' }

    await GET(createRequest(params))
    mockFetch.mockClear()
    vi.advanceTimersByTime(60 * 60 * 1_000)
    await GET(createRequest(params))

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('evicts the least-recently-used thumbnail URL after 1,000 live keys', async () => {
    const cdnUrl = 'https://p16-sign-va.tiktokcdn-us.com/bounds.jpeg'
    mockFetch.mockImplementation((input) =>
      Promise.resolve(
        String(input).startsWith('https://tiktxk.com/')
          ? htmlResponse(mirrorHtml(cdnUrl))
          : imageResponse(),
      ),
    )

    for (let i = 0; i <= 1_000; i++) {
      await GET(
        createRequest({
          username: 'bounds_user',
          id: `7619017281692${String(i).padStart(6, '0')}`,
        }),
      )
    }
    mockFetch.mockClear()

    await GET(createRequest({ username: 'bounds_user', id: '7619017281692000000' }))

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
