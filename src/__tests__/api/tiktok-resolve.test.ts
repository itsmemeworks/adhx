import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * API Route Tests: /api/tiktok/resolve
 *
 * Resolves a TikTok short link to its canonical @handle/video/{id} and,
 * with ?go=1, redirects to the in-app preview. The redirect must use a
 * RELATIVE Location — behind Fly's proxy request.url is the internal bind
 * address, so an absolute redirect would send the browser to 0.0.0.0:3000.
 */

const mockResolve = vi.fn()
vi.mock('@/lib/media/tnktok', () => ({
  resolveTikTokUrl: (...args: unknown[]) => mockResolve(...args),
}))

function req(params: Record<string, string>): NextRequest {
  const url = new URL('http://0.0.0.0:3000/api/tiktok/resolve')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

const RESOLVED = { handle: 'nakayylah', videoId: '7645103968468684046' }

describe('API: /api/tiktok/resolve', () => {
  beforeEach(() => mockResolve.mockReset())

  it('returns 400 when url is missing', async () => {
    const { GET } = await import('@/app/api/tiktok/resolve/route')
    const res = await GET(req({}))
    expect(res.status).toBe(400)
  })

  it('returns JSON with a relative preview url by default', async () => {
    mockResolve.mockResolvedValueOnce(RESOLVED)
    const { GET } = await import('@/app/api/tiktok/resolve/route')
    const res = await GET(req({ url: 'https://vm.tiktok.com/ZNRvLPpVV/' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ...RESOLVED, url: '/@nakayylah/video/7645103968468684046' })
  })

  it('with go=1, 307-redirects via a RELATIVE Location (no host)', async () => {
    mockResolve.mockResolvedValueOnce(RESOLVED)
    const { GET } = await import('@/app/api/tiktok/resolve/route')
    const res = await GET(req({ url: 'https://vm.tiktok.com/ZNRvLPpVV/', go: '1' }))
    expect(res.status).toBe(307)
    const loc = res.headers.get('location')
    expect(loc).toBe('/@nakayylah/video/7645103968468684046')
    // Must not leak the internal bind host.
    expect(loc).not.toContain('0.0.0.0')
    expect(loc).not.toMatch(/^https?:\/\//)
  })

  it('with go=1 and an unresolvable link, redirects to home with an error', async () => {
    mockResolve.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/tiktok/resolve/route')
    const res = await GET(req({ url: 'https://vm.tiktok.com/bad/', go: '1' }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/^\/\?error=/)
  })

  it('returns 404 JSON (not a redirect) when not resolvable and go is absent', async () => {
    mockResolve.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/tiktok/resolve/route')
    const res = await GET(req({ url: 'https://vm.tiktok.com/bad/' }))
    expect(res.status).toBe(404)
  })
})
