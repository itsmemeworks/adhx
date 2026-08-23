import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, type TestDbInstance } from './setup'
import { analyticsEvents } from '@/lib/db/schema'
import { __resetRateLimitState } from '@/lib/rate-limit'

let testInstance: TestDbInstance
let mockUserId: string | null = null

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
}))

vi.mock('@/lib/sentry', () => ({
  metricCount: vi.fn(),
}))

import { GET, POST } from '@/app/api/analytics/route'

function post(body: unknown, origin?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (origin) headers.Origin = origin
  return POST(
    new NextRequest('http://localhost:3000/api/analytics', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/analytics', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = 'user-a'
    __resetRateLimitState()
  })
  afterEach(() => testInstance.close())

  it('records an allowlisted client event', async () => {
    const res = await post({ name: 'post.copy', platform: 'twitter', id: '123' })
    expect(res.status).toBe(204)
    const rows = testInstance.db.select().from(analyticsEvents).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'post.copy',
      platform: 'twitter',
      bookmarkId: '123',
      userId: 'user-a',
    })
  })

  it('rejects unknown event names and client-invented types', async () => {
    const unknown = await post({ name: 'post.explode', platform: 'twitter', id: '1' })
    expect(unknown.status).toBe(400)
    const typed = await post({
      name: 'post.copy',
      platform: 'twitter',
      id: '1',
      contentType: 'video',
    })
    expect(typed.status).toBe(204)
    const rows = testInstance.db.select().from(analyticsEvents).all()
    expect(rows[0].contentType).toBeNull()
  })

  it('rejects a cross-origin write', async () => {
    const res = await post(
      { name: 'post.copy', platform: 'twitter', id: '1' },
      'https://evil.example',
    )
    expect(res.status).toBe(403)
    expect(testInstance.db.select().from(analyticsEvents).all()).toHaveLength(0)
  })
})

describe('GET /api/analytics', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = null
    __resetRateLimitState()
  })
  afterEach(() => testInstance.close())

  it('returns aggregates and never includes userId', async () => {
    mockUserId = 'hidden'
    await post({ name: 'post.send', platform: 'tiktok', id: 'v1', source: 'share' })
    const res = await GET(new NextRequest('http://localhost:3000/api/analytics?window=week'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.window).toBe('week')
    expect(body.totals['post.send']).toBe(1)
    expect(JSON.stringify(body)).not.toContain('hidden')
    expect(JSON.stringify(body)).not.toContain('userId')
  })
})
