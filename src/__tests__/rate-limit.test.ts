import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetRateLimitState,
  checkRateLimit,
  getClientIp,
  mediaRateLimit,
} from '@/lib/rate-limit'

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
})

describe('getClientIp', () => {
  it('reads the first entry of x-forwarded-for', () => {
    const request = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(getClientIp(request)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip', () => {
    const request = new Request('https://example.com', {
      headers: { 'x-real-ip': '9.9.9.9' },
    })
    expect(getClientIp(request)).toBe('9.9.9.9')
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
      headers: { 'x-forwarded-for': '10.0.0.1' },
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
        headers: { 'x-forwarded-for': '10.0.0.2' },
      }) as unknown as Parameters<typeof mediaRateLimit>[0]

    mediaRateLimit(makeRequest(), { max: 2, windowMs: 10_000 })
    mediaRateLimit(makeRequest(), { max: 2, windowMs: 10_000 })
    const third = mediaRateLimit(makeRequest(), { max: 2, windowMs: 10_000 })

    expect(third).not.toBeNull()
    expect(third?.status).toBe(429)
  })
})
