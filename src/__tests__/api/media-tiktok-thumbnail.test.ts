import { describe, it, expect, beforeEach, vi } from 'vitest'
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
  return { ok: true, text: async () => html }
}

function imageResponse() {
  return {
    ok: true,
    body: new ReadableStream(),
    headers: new Headers({ 'content-type': 'image/jpeg' }),
  }
}

describe('GET /api/media/tiktok/thumbnail', () => {
  beforeEach(() => mockFetch.mockReset())

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
})
