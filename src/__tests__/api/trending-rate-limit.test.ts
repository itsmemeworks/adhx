import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, type TestDbInstance } from './setup'
import { __resetRateLimitState } from '@/lib/rate-limit'

/**
 * API Route Test: GET /api/trending — rate limiting.
 *
 * This is a public, crawlable SEO/GEO endpoint, so the limit is deliberately
 * generous (120 req/min/IP) — it exists as a backstop against hammering, not
 * a throttle on legitimate crawler traffic. See src/lib/rate-limit.ts for the
 * shared fixed-window implementation.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { GET } from '@/app/api/trending/route'

function requestFrom(ip: string): NextRequest {
  return new NextRequest('http://localhost/api/trending', {
    headers: { 'fly-client-ip': ip },
  })
}

describe('GET /api/trending — rate limiting', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    __resetRateLimitState()
  })
  afterEach(() => testInstance.close())

  it('allows a normal request through', async () => {
    const res = await GET(requestFrom('1.1.1.1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('keeps moderation-store failures non-cacheable', async () => {
    testInstance.sqlite.exec('DROP TABLE moderated_posts')

    const res = await GET(requestFrom('1.1.1.9'))

    expect(res.status).toBe(500)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('returns 429 with Retry-After once an IP exceeds the per-minute limit', async () => {
    const ip = '2.2.2.2'
    let last: Response | null = null
    for (let i = 0; i < 121; i++) {
      last = await GET(requestFrom(ip))
    }
    expect(last!.status).toBe(429)
    expect(last!.headers.get('Retry-After')).toBeTruthy()
    expect(last!.headers.get('Cache-Control')).toBe('no-store')
    const body = await last!.json()
    expect(body.error).toBe('Too many requests')
  })

  it('rate-limits per IP — a different IP is unaffected by another IP being limited', async () => {
    const hammered = '3.3.3.3'
    for (let i = 0; i < 121; i++) {
      await GET(requestFrom(hammered))
    }
    const limitedRes = await GET(requestFrom(hammered))
    expect(limitedRes.status).toBe(429)

    const freshRes = await GET(requestFrom('4.4.4.4'))
    expect(freshRes.status).toBe(200)
  })
})
