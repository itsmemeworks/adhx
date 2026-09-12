import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { fetchFreshInstagramMetadata, fetchInstagramMetadata } from '@/lib/media/instafix'
import { resolveInstagramVideo as mirror } from '@/lib/media/mirrors'
import { resolveInstagramVideo } from '@/lib/media/instagram-video'

vi.mock('@/lib/media/instafix', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/media/instafix')>()),
  fetchInstagramMetadata: vi.fn(),
  fetchFreshInstagramMetadata: vi.fn(),
}))
vi.mock('@/lib/media/mirrors', () => ({ resolveInstagramVideo: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ mediaRateLimit: () => null, downloadRateLimit: () => null }))

const direct = 'https://video.cdninstagram.com/direct.mp4'
const refreshed = 'https://video.fbcdn.net/fresh.mp4'
const metadata = (videoUrl = direct) => ({
  contentType: 'video' as const,
  mediaComplete: true,
  media: [{ type: 'video' as const, videoUrl }],
})
const video = (status = 206) =>
  new Response('mp4', {
    status,
    headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-2/1234' },
  })
let id: string
let sequence = 0
const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  id = `video_${++sequence}`
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  vi.mocked(fetchInstagramMetadata).mockResolvedValue(metadata())
  vi.mocked(fetchFreshInstagramMetadata).mockResolvedValue(metadata(refreshed))
  vi.mocked(mirror).mockResolvedValue(null)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Instagram direct delivery', () => {
  it('streams the direct MP4 with Range, bypassing a broken mirror', async () => {
    const response = video()
    fetchMock.mockResolvedValueOnce(response)
    expect(await resolveInstagramVideo(id, { range: 'bytes=0-2' })).toEqual({
      kind: 'video',
      response,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      direct,
      expect.objectContaining({
        redirect: 'manual',
        headers: expect.objectContaining({ Range: 'bytes=0-2' }),
        signal: expect.any(AbortSignal),
      }),
    )
    expect(mirror).not.toHaveBeenCalled()
    await response.body?.cancel()
  })

  it('refreshes an expired signature once and reuses it on the player request', async () => {
    const expired = new Response('expired', { status: 403 })
    const cancel = vi.spyOn(expired.body!, 'cancel')
    fetchMock.mockResolvedValueOnce(expired).mockImplementation(() => Promise.resolve(video()))
    const first = await resolveInstagramVideo(id)
    const second = await resolveInstagramVideo(id)
    expect(first.kind).toBe('video')
    expect(second.kind).toBe('video')
    expect(cancel).toHaveBeenCalled()
    expect(fetchFreshInstagramMetadata).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([direct, refreshed, refreshed])
    if (first.kind === 'video') await first.response.body?.cancel()
    if (second.kind === 'video') await second.response.body?.cancel()
  })

  it('recognizes a legacy photo before contacting any video source', async () => {
    vi.mocked(fetchInstagramMetadata).mockResolvedValue({
      contentType: 'photo',
      mediaComplete: true,
      media: [{ type: 'photo' }, { type: 'photo' }],
    })
    expect(await resolveInstagramVideo(id)).toEqual({ kind: 'photo', photoCount: 2 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mirror).not.toHaveBeenCalled()
  })

  it.each([null, { contentType: 'photo' as const, mediaComplete: false, media: [] }])(
    'still tries the mirror when metadata is missing or inconclusive',
    async (value) => {
      vi.mocked(fetchInstagramMetadata).mockResolvedValue(value)
      const response = video()
      vi.mocked(mirror).mockResolvedValueOnce(response)
      expect(await resolveInstagramVideo(id)).toEqual({ kind: 'video', response })
      expect(fetchMock).not.toHaveBeenCalled()
      await response.body?.cancel()
    },
  )

  it('rejects a CDN redirect outside the allowlist without fetching its target', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://cdninstagram.com.attacker.example/private' },
      }),
    )
    expect(await resolveInstagramVideo(id)).toEqual({ kind: 'unavailable' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mirror).toHaveBeenCalledTimes(1)
  })

  it('rejects an untrusted initial URL even if cached metadata contains it', async () => {
    vi.mocked(fetchInstagramMetadata).mockResolvedValue(metadata('http://127.0.0.1/private'))
    await resolveInstagramVideo(id)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never relabels an HTML success page as playable MP4', async () => {
    const response = new Response('<html>login</html>', {
      headers: { 'content-type': 'text/html' },
    })
    const cancel = vi.spyOn(response.body!, 'cancel')
    fetchMock.mockResolvedValueOnce(response)
    expect(await resolveInstagramVideo(id)).toEqual({ kind: 'unavailable' })
    expect(cancel).toHaveBeenCalled()
    expect(mirror).toHaveBeenCalledTimes(1)
  })

  it('does not keep retrying an expired URL when fresh metadata also fails', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 403 })))
    expect(await resolveInstagramVideo(id)).toEqual({ kind: 'unavailable' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchFreshInstagramMetadata).toHaveBeenCalledTimes(1)
    expect(mirror).toHaveBeenCalledTimes(1)
  })

  it('returns at the shared deadline even when cached metadata never settles', async () => {
    vi.useFakeTimers()
    vi.mocked(fetchInstagramMetadata).mockReturnValue(new Promise(() => {}))
    const result = resolveInstagramVideo(id)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await result).toEqual({ kind: 'unavailable' })
    expect(mirror).not.toHaveBeenCalled()
  })

  it('stops on caller cancellation without starting a fallback', async () => {
    vi.mocked(fetchInstagramMetadata).mockReturnValue(new Promise(() => {}))
    const controller = new AbortController()
    const result = resolveInstagramVideo(id, { signal: controller.signal })
    controller.abort()
    expect(await result).toEqual({ kind: 'unavailable' })
    expect(mirror).not.toHaveBeenCalled()
  })

  it.each(['video', 'video/download'])(
    'delivers direct media through the %s route',
    async (path) => {
      fetchMock.mockResolvedValueOnce(video(path === 'video' ? 206 : 200))
      const { GET } =
        path === 'video'
          ? await import('@/app/api/media/instagram/video/route')
          : await import('@/app/api/media/instagram/video/download/route')
      const response = await GET(
        new NextRequest(`https://adhx.com/api/media/instagram/${path}?id=${id}`, {
          headers: { Range: 'bytes=0-2' },
        }),
      )
      expect(response.status).toBe(path === 'video' ? 206 : 200)
      expect(response.headers.get('content-type')).toBe('video/mp4')
      if (path === 'video') expect(response.headers.get('content-range')).toBe('bytes 0-2/1234')
      else expect(response.headers.get('content-disposition')).toContain(`instagram-${id}.mp4`)
      expect(await response.text()).toBe('mp4')
      expect(mirror).not.toHaveBeenCalled()
    },
  )

  it('tells the probe that a saved Reel is actually a photo', async () => {
    vi.mocked(fetchInstagramMetadata).mockResolvedValue({
      contentType: 'photo',
      mediaComplete: true,
      media: [{ type: 'photo' }],
    })
    const { GET } = await import('@/app/api/media/instagram/video/route')
    const response = await GET(
      new NextRequest(`https://adhx.com/api/media/instagram/video?id=${id}`),
    )
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ contentType: 'photo', photoCount: 1 })
  })
})
