import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetRateLimitState,
  analyticsWriteLimit,
  checkRateLimit,
  downloadRateLimit,
  getClientIp,
  mediaRateLimit,
  activityWriteLimit,
  publicReadRateLimit,
} from '@/lib/rate-limit'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('checkRateLimit', () => {
  beforeEach(() => {
    __resetRateLimitState()
    vi.useRealTimers()
  })

  it('allows up to the configured max requests within the window', () => {
    const key = 'test-key-allow'
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(key, { max: 5, windowMs: 10_000 })
      expect(result.limited).toBe(false)
    }
  })

  it('limits requests once the max is exceeded within the window', () => {
    const key = 'test-key-limit'
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, { max: 5, windowMs: 10_000 })
    }
    const sixth = checkRateLimit(key, { max: 5, windowMs: 10_000 })
    expect(sixth.limited).toBe(true)
    expect(sixth.remaining).toBe(0)
  })

  it('resets after the window elapses', async () => {
    vi.useFakeTimers()
    const key = 'test-key-reset'
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, { max: 5, windowMs: 1_000 })
    }
    expect(checkRateLimit(key, { max: 5, windowMs: 1_000 }).limited).toBe(true)

    vi.advanceTimersByTime(1_001)

    const afterReset = checkRateLimit(key, { max: 5, windowMs: 1_000 })
    expect(afterReset.limited).toBe(false)
    expect(afterReset.remaining).toBe(4)
    vi.useRealTimers()
  })

  it('tracks separate keys independently', () => {
    for (let i = 0; i < 5; i++) {
      checkRateLimit('key-a', { max: 5, windowMs: 10_000 })
    }
    expect(checkRateLimit('key-a', { max: 5, windowMs: 10_000 }).limited).toBe(true)
    expect(checkRateLimit('key-b', { max: 5, windowMs: 10_000 }).limited).toBe(false)
  })

  it('fails closed at capacity without evicting live exhausted buckets', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
    const opts = { max: 1, windowMs: 10_000 }

    expect(checkRateLimit('exhausted-key', opts).limited).toBe(false)
    expect(checkRateLimit('exhausted-key', opts).limited).toBe(true)
    for (let i = 1; i < 5_000; i++) {
      expect(checkRateLimit(`live-key-${i}`, opts).limited).toBe(false)
    }

    // Churning through more unseen keys cannot evict a live counter or admit
    // traffic beyond the fixed store capacity.
    for (let i = 5_000; i < 5_100; i++) {
      expect(checkRateLimit(`overflow-key-${i}`, opts)).toEqual({
        limited: true,
        remaining: 0,
        resetMs: 10_000,
      })
    }
    expect(checkRateLimit('exhausted-key', opts).limited).toBe(true)

    vi.advanceTimersByTime(9_999)
    expect(checkRateLimit('still-full', opts).resetMs).toBe(1)
    expect(checkRateLimit('still-full', opts).limited).toBe(true)

    vi.advanceTimersByTime(1)
    expect(checkRateLimit('recovered-key', opts)).toEqual({
      limited: false,
      remaining: 0,
      resetMs: 10_000,
    })
    expect(checkRateLimit('exhausted-key', opts).limited).toBe(false)
  })

  it('does not let short-window cleanup reset live 60s buckets', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00Z'))
    const headers = { 'fly-client-ip': '10.0.0.20' }
    const request = new Request('https://example.com', { headers })
    const mediaRequest = request as unknown as Parameters<typeof downloadRateLimit>[0]

    expect(downloadRateLimit(mediaRequest, { max: 1, windowMs: 60_000 })).toBeNull()
    expect(downloadRateLimit(mediaRequest, { max: 1, windowMs: 60_000 })?.status).toBe(429)
    expect(publicReadRateLimit(request, { max: 1, windowMs: 60_000 })).toBeNull()
    expect(publicReadRateLimit(request, { max: 1, windowMs: 60_000 })?.status).toBe(429)
    for (let i = 0; i <= 30; i++) analyticsWriteLimit(mediaRequest)
    expect(analyticsWriteLimit(mediaRequest)?.status).toBe(429)

    vi.advanceTimersByTime(10_001)
    for (let i = 0; i <= 5_000; i++) {
      checkRateLimit(`short-window-${i}`, { max: 1, windowMs: 10_000 })
    }

    expect(downloadRateLimit(mediaRequest, { max: 1, windowMs: 60_000 })?.status).toBe(429)
    expect(publicReadRateLimit(request, { max: 1, windowMs: 60_000 })?.status).toBe(429)
    expect(analyticsWriteLimit(mediaRequest)?.status).toBe(429)
  })
})

describe('getClientIp', () => {
  it('prefers Fly-Client-IP over spoofed forwarding headers', () => {
    vi.stubEnv('TRUST_PROXY_IP_HEADERS', 'true')
    const request = new Request('https://example.com', {
      headers: {
        'fly-client-ip': '203.0.113.10',
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
        'x-real-ip': '9.9.9.9',
      },
    })
    expect(getClientIp(request)).toBe('203.0.113.10')
  })

  it('ignores spoofable forwarding headers by default', () => {
    vi.stubEnv('TRUST_PROXY_IP_HEADERS', '')
    const request = new Request('https://example.com', {
      headers: {
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
        'x-real-ip': '9.9.9.9',
      },
    })
    expect(getClientIp(request)).toBe('unknown')
  })

  it('uses trusted proxy forwarding headers only after explicit opt-in', () => {
    vi.stubEnv('TRUST_PROXY_IP_HEADERS', 'true')

    expect(
      getClientIp(
        new Request('https://example.com', {
          headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
        }),
      ),
    ).toBe('1.2.3.4')
    expect(
      getClientIp(
        new Request('https://example.com', {
          headers: { 'x-real-ip': '9.9.9.9' },
        }),
      ),
    ).toBe('9.9.9.9')
  })

  it('falls back to "unknown" when no IP headers are present', () => {
    const request = new Request('https://example.com')
    expect(getClientIp(request)).toBe('unknown')
  })
})

describe('mediaRateLimit', () => {
  beforeEach(() => {
    __resetRateLimitState()
  })

  it('returns null while under the limit', () => {
    const request = new Request('https://example.com/api/media/video', {
      headers: { 'fly-client-ip': '10.0.0.1' },
    })
    const result = mediaRateLimit(request as unknown as Parameters<typeof mediaRateLimit>[0], {
      max: 2,
      windowMs: 10_000,
    })
    expect(result).toBeNull()
  })

  it('returns a 429 response once the limit is exceeded', () => {
    const makeRequest = () =>
      new Request('https://example.com/api/media/video', {
        headers: { 'fly-client-ip': '10.0.0.2' },
      }) as unknown as Parameters<typeof mediaRateLimit>[0]

    mediaRateLimit(makeRequest(), { max: 2, windowMs: 10_000 })
    mediaRateLimit(makeRequest(), { max: 2, windowMs: 10_000 })
    const third = mediaRateLimit(makeRequest(), { max: 2, windowMs: 10_000 })

    expect(third).not.toBeNull()
    expect(third?.status).toBe(429)
  })

  it('puts untrusted forwarding identities into one shared unknown bucket', () => {
    vi.stubEnv('TRUST_PROXY_IP_HEADERS', '')
    const first = new Request('https://example.com/api/media/video', {
      headers: { 'x-forwarded-for': '198.51.100.1' },
    }) as unknown as Parameters<typeof mediaRateLimit>[0]
    const spoofed = new Request('https://example.com/api/media/video', {
      headers: { 'x-forwarded-for': '198.51.100.2' },
    }) as unknown as Parameters<typeof mediaRateLimit>[0]

    expect(mediaRateLimit(first, { max: 1, windowMs: 10_000 })).toBeNull()
    expect(mediaRateLimit(spoofed, { max: 1, windowMs: 10_000 })?.status).toBe(429)
  })
})

describe('activityWriteLimit', () => {
  beforeEach(() => {
    __resetRateLimitState()
  })

  it('does not share a bucket with mediaRateLimit', () => {
    const headers = { 'fly-client-ip': '10.0.0.9' }
    const mediaReq = () =>
      new Request('https://example.com/api/media/video', { headers }) as unknown as Parameters<
        typeof mediaRateLimit
      >[0]
    const actReq = () =>
      new Request('https://example.com/api/activity/share', { headers }) as unknown as Parameters<
        typeof activityWriteLimit
      >[0]

    for (let i = 0; i < 3; i++) mediaRateLimit(mediaReq(), { max: 2, windowMs: 10_000 })
    expect(activityWriteLimit(actReq())).toBeNull()
  })
})

describe('downloadRateLimit', () => {
  beforeEach(() => {
    __resetRateLimitState()
  })

  it('uses a tighter bucket independent from inline media playback', () => {
    const headers = { 'fly-client-ip': '10.0.0.12' }
    const request = new Request('https://example.com/api/media/video/download', {
      headers,
    }) as unknown as Parameters<typeof downloadRateLimit>[0]

    expect(downloadRateLimit(request, { max: 1, windowMs: 10_000 })).toBeNull()
    expect(downloadRateLimit(request, { max: 1, windowMs: 10_000 })?.status).toBe(429)
    expect(mediaRateLimit(request, { max: 1, windowMs: 10_000 })).toBeNull()
  })
})

describe('publicReadRateLimit', () => {
  beforeEach(() => {
    __resetRateLimitState()
  })

  it('limits aggregate reads without consuming the media bucket', () => {
    const request = new Request('https://example.com/api/activity', {
      headers: { 'fly-client-ip': '10.0.0.13' },
    })

    expect(publicReadRateLimit(request, { max: 1, windowMs: 10_000 })).toBeNull()
    expect(publicReadRateLimit(request, { max: 1, windowMs: 10_000 })?.status).toBe(429)
    expect(
      mediaRateLimit(request as unknown as Parameters<typeof mediaRateLimit>[0], {
        max: 1,
        windowMs: 10_000,
      }),
    ).toBeNull()
  })
})
