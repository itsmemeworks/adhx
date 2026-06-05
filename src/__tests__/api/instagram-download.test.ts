import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * API Route Tests: Instagram video + download endpoints.
 *
 * Instagram video is no longer resolvable (the InstaFix mirrors are dead and
 * Instagram exposes no og:video), so both endpoints are degraded to a stable
 * 410 Gone. See src/lib/media/instafix.ts.
 */

function createRequest(path: string, id: string | null): NextRequest {
  const url = new URL(`http://localhost:3000${path}`)
  if (id !== null) url.searchParams.set('id', id)
  return new NextRequest(url)
}

describe('Instagram video endpoints (degraded)', () => {
  it('video route returns 410 with a link-out message', async () => {
    const { GET } = await import('@/app/api/media/instagram/video/route')
    const response = await GET(createRequest('/api/media/instagram/video', 'DXVsqQ7CSXw'))

    expect(response.status).toBe(410)
    const data = await response.json()
    expect(data.error).toMatch(/instagram/i)
  })

  it('download route returns 410 with a link-out message', async () => {
    const { GET } = await import('@/app/api/media/instagram/video/download/route')
    const response = await GET(createRequest('/api/media/instagram/video/download', 'DXVsqQ7CSXw'))

    expect(response.status).toBe(410)
    const data = await response.json()
    expect(data.error).toMatch(/instagram/i)
  })
})
