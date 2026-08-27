import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  INSTAGRAM_MIRRORS,
  instagramVideoUrls,
  isAllowedInstagramMirrorUrl,
  isRetryableStatus,
  resolveInstagramVideo,
  type VideoMirror,
} from '@/lib/media/mirrors'

/**
 * The pluggable video-mirror registry: how Instagram Reels resolve to a
 * streamable MP4, and the SSRF allowlist that gates the proxy.
 */

describe('Instagram mirror registry', () => {
  it('builds an ordered candidate URL per configured mirror', () => {
    const urls = instagramVideoUrls('DYP6_iUlDzp')
    expect(urls.length).toBe(INSTAGRAM_MIRRORS.length)
    // vxinstagram (the current primary) → /offload/{id}/0.mp4
    expect(urls[0]).toBe('https://www.vxinstagram.com/offload/DYP6_iUlDzp/0.mp4')
  })

  it('url-encodes the reel id', () => {
    expect(instagramVideoUrls('a/b?c')[0]).toContain('offload/a%2Fb%3Fc/0.mp4')
  })

  it('SSRF allowlist accepts mirror hosts + their CDN, https only', () => {
    expect(isAllowedInstagramMirrorUrl('https://www.vxinstagram.com/offload/x/0.mp4')).toBe(true)
    expect(isAllowedInstagramMirrorUrl('https://d.rapidcdn.app/v2?token=abc')).toBe(true)
  })

  it('SSRF allowlist rejects other hosts, http, and suffix spoofs', () => {
    expect(isAllowedInstagramMirrorUrl('http://www.vxinstagram.com/x')).toBe(false) // not https
    expect(isAllowedInstagramMirrorUrl('https://evil.com/x')).toBe(false)
    expect(isAllowedInstagramMirrorUrl('https://vxinstagram.com.evil.com/x')).toBe(false)
    expect(isAllowedInstagramMirrorUrl('not a url')).toBe(false)
  })
})

/**
 * Retry policy. vxinstagram's cache is lazily populated, so the first request
 * for a Reel 404s for ~10-20s while its backend fetches the post and only then
 * starts serving the MP4. Treating that 404 as fatal (which this resolver did
 * until 2026-07-27) failed every first-ever request for a given Reel — these
 * tests pin the behaviour so it can't regress back.
 */
describe('mirror retry policy', () => {
  const mirror = INSTAGRAM_MIRRORS[0]

  it('retries the cold-cache 404 for a mirror that declares it', () => {
    expect(mirror.retryStatuses).toContain(404)
    expect(isRetryableStatus(404, mirror)).toBe(true)
  })

  it('always retries rate-limits and upstream 5xx', () => {
    expect(isRetryableStatus(429, mirror)).toBe(true)
    expect(isRetryableStatus(500, mirror)).toBe(true)
    expect(isRetryableStatus(503, mirror)).toBe(true)
  })

  it('does not retry statuses that will never improve', () => {
    for (const status of [400, 401, 403, 410, 451]) {
      expect(isRetryableStatus(status, mirror)).toBe(false)
    }
  })

  it('does not retry a 404 for a mirror that has not declared it retryable', () => {
    const strict: VideoMirror = { name: 'strict', videoUrl: () => 'https://x/y', hosts: ['x'] }
    expect(isRetryableStatus(404, strict)).toBe(false)
    expect(isRetryableStatus(500, strict)).toBe(true)
  })

  it('budgets enough backoff to outlast the measured cold fetch', () => {
    const attempts = mirror.attempts ?? 3
    const base = mirror.backoffMs ?? 400
    // Backoff is base * attemptNumber between attempts.
    let total = 0
    for (let i = 0; i < attempts - 1; i++) total += base * (i + 1)
    // The cold fetch was measured resolving at ~10-20s.
    expect(total).toBeGreaterThanOrEqual(20_000)
  })
})

describe('Instagram mirror resolution deadline', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
    mockFetch.mockReset()
    global.fetch = mockFetch as unknown as typeof fetch
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('lets a cold-cache 404 become a successful response within the deadline', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response('video', { status: 200 }))

    const pending = resolveInstagramVideo('cold-reel', {
      range: 'bytes=0-1',
      attemptsPerMirror: 2,
      totalTimeoutMs: 10_000,
    })

    await vi.advanceTimersByTimeAsync(1500)
    const response = await pending

    expect(response?.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    for (const [, init] of mockFetch.mock.calls) {
      expect(init.redirect).toBe('manual')
      expect(new Headers(init.headers).get('Range')).toBe('bytes=0-1')
    }
    await response?.body?.cancel()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds a hung attempt by the total wall-clock deadline', async () => {
    mockFetch.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal
          if (!signal) throw new Error('expected request signal')
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        }),
    )

    const startedAt = Date.now()
    const pending = resolveInstagramVideo('hung-reel', {
      attemptsPerMirror: 6,
      attemptTimeoutMs: 30_000,
      totalTimeoutMs: 1000,
    })

    await vi.advanceTimersByTimeAsync(1000)
    await expect(pending).resolves.toBeNull()
    expect(Date.now() - startedAt).toBe(1000)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the attempt timeout active while a successful body streams', async () => {
    mockFetch.mockImplementationOnce(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal
      if (!signal) throw new Error('expected request signal')
      return new Response(
        new ReadableStream({
          start(controller) {
            signal.addEventListener('abort', () => controller.error(signal.reason), { once: true })
          },
        }),
        { status: 200 },
      )
    })

    const response = await resolveInstagramVideo('slow-stream', {
      attemptsPerMirror: 1,
      attemptTimeoutMs: 100,
      totalTimeoutMs: 5000,
    })
    const bodyAssertion = expect(response?.arrayBuffer()).rejects.toBeDefined()

    await vi.advanceTimersByTimeAsync(100)
    await bodyAssertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it('revalidates every automatic redirect hop against the allowlist', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: 'https://d.rapidcdn.app/signed/video.mp4' },
        }),
      )
      .mockResolvedValueOnce(new Response('video', { status: 200 }))

    const response = await resolveInstagramVideo('redirected-reel', {
      attemptsPerMirror: 1,
      totalTimeoutMs: 5000,
    })

    expect(response?.status).toBe(200)
    expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
      'https://www.vxinstagram.com/offload/redirected-reel/0.mp4',
      'https://d.rapidcdn.app/signed/video.mp4',
    ])
    await response?.body?.cancel()
  })

  it('does not follow a redirect to a suffix-spoofed host', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: 'https://rapidcdn.app.evil.com/video.mp4' },
      }),
    )

    await expect(
      resolveInstagramVideo('unsafe-redirect', {
        attemptsPerMirror: 3,
        totalTimeoutMs: 5000,
      }),
    ).resolves.toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('honors caller cancellation and cleans up internal timers', async () => {
    mockFetch.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal
          if (!signal) throw new Error('expected request signal')
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        }),
    )
    const controller = new AbortController()
    const pending = resolveInstagramVideo('cancelled-reel', {
      signal: controller.signal,
      totalTimeoutMs: 5000,
    })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })

    controller.abort()

    await assertion
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
