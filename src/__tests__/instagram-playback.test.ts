import { describe, it, expect, vi } from 'vitest'
import {
  instagramEmbedUrl,
  instagramVideoSrc,
  probeInstagramVideo,
} from '@/lib/media/instagram-playback'

function mockRes(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: { cancel: vi.fn() },
  }
}

describe('instagram playback URLs', () => {
  it('builds the proxy src and official embed', () => {
    expect(instagramVideoSrc('DXVsqQ7CSXw')).toBe('/api/media/instagram/video?id=DXVsqQ7CSXw')
    expect(instagramEmbedUrl('DXVsqQ7CSXw')).toBe(
      'https://www.instagram.com/reel/DXVsqQ7CSXw/embed/',
    )
  })
})

describe('probeInstagramVideo', () => {
  it('treats 206 as ready and cancels the body (Range probe only)', async () => {
    const cancel = vi.fn()
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 206, body: { cancel } })
    await expect(probeInstagramVideo('DXVsqQ7CSXw', { fetch })).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      '/api/media/instagram/video?id=DXVsqQ7CSXw',
      expect.objectContaining({ headers: { Range: 'bytes=0-1' } }),
    )
    expect(cancel).toHaveBeenCalled()
  })

  it('does not retry a 502 (server already spent the mirror budget)', async () => {
    const fetch = vi.fn().mockResolvedValue(mockRes(502))
    await expect(probeInstagramVideo('DXVsqQ7CSXw', { fetch })).resolves.toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries a network error once, then gives up', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('timeout'))
    await expect(probeInstagramVideo('DXVsqQ7CSXw', { fetch })).resolves.toBe(false)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('stops immediately when the caller aborts', async () => {
    const fetch = vi.fn()
    const ac = new AbortController()
    ac.abort()
    await expect(probeInstagramVideo('DXVsqQ7CSXw', { fetch, signal: ac.signal })).resolves.toBe(
      false,
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})
