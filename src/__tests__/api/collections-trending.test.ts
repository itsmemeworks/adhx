import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, type TestDbInstance } from './setup'
import { __resetRateLimitState } from '@/lib/rate-limit'
import { collectionEvents, tagShares, users, type NewCollectionEvent } from '@/lib/db/schema'

/**
 * API Route Test: GET /api/collections/trending — the public Discovery
 * leaderboard endpoint. Mirrors `src/__tests__/api/trending-rate-limit.test.ts`
 * for the rate-limit coverage.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { GET } from '@/app/api/collections/trending/route'

function requestFrom(ip: string, query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/collections/trending${query}`, {
    headers: { 'x-forwarded-for': ip },
  })
}

function seedUser(id: string, username: string) {
  testInstance.db.insert(users).values({ id, username }).run()
}

function seedShare(userId: string, tag: string, isPublic = true) {
  testInstance.db
    .insert(tagShares)
    .values({ userId, tag, shareCode: `${userId}-${tag}`, isPublic })
    .run()
}

function seedEvent(
  overrides: Partial<NewCollectionEvent> & { ownerUserId: string; tag: string; createdAt: string },
) {
  const row: NewCollectionEvent = { action: 'view', hidden: 0, ...overrides }
  testInstance.db.insert(collectionEvents).values(row).run()
}

describe('GET /api/collections/trending', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    __resetRateLimitState()
  })
  afterEach(() => testInstance.close())

  it('returns the week board by default', async () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'tag')
    seedEvent({ ownerUserId: 'u1', tag: 'tag', createdAt: new Date().toISOString() })

    const res = await GET(requestFrom('1.1.1.1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.window).toBe('week')
    expect(body.items.length).toBe(1)
    expect(body.items[0].username).toBe('alice')
  })

  it('accepts a valid window slug', async () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'tag')
    seedEvent({ ownerUserId: 'u1', tag: 'tag', createdAt: new Date().toISOString() })

    const res = await GET(requestFrom('1.1.1.2', '?window=today'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.window).toBe('day')
  })

  it('returns 400 on an invalid window', async () => {
    const res = await GET(requestFrom('1.1.1.3', '?window=nonsense'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid window')
  })

  it('returns 400 on a non-numeric limit', async () => {
    const res = await GET(requestFrom('1.1.1.4', '?limit=abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid limit')
  })

  it('clamps a limit above 50 down to 50', async () => {
    seedUser('u1', 'alice')
    for (let i = 0; i < 60; i++) {
      seedShare('u1', `tag${i}`)
      seedEvent({ ownerUserId: 'u1', tag: `tag${i}`, createdAt: new Date().toISOString() })
    }

    const res = await GET(requestFrom('1.1.1.5', '?limit=999'))
    const body = await res.json()
    expect(body.items.length).toBe(50)
  })

  it('clamps a limit below 1 up to 1', async () => {
    seedUser('u1', 'alice')
    seedShare('u1', 'tag')
    seedEvent({ ownerUserId: 'u1', tag: 'tag', createdAt: new Date().toISOString() })

    const res = await GET(requestFrom('1.1.1.6', '?limit=0'))
    const body = await res.json()
    expect(body.items.length).toBe(1)
  })

  it('defaults the limit to 24 when omitted', async () => {
    seedUser('u1', 'alice')
    for (let i = 0; i < 30; i++) {
      seedShare('u1', `tag${i}`)
      seedEvent({ ownerUserId: 'u1', tag: `tag${i}`, createdAt: new Date().toISOString() })
    }

    const res = await GET(requestFrom('1.1.1.7'))
    const body = await res.json()
    expect(body.items.length).toBe(24)
  })

  it('sets cache-control headers matching the trending endpoint convention', async () => {
    const res = await GET(requestFrom('1.1.1.8'))
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60, stale-while-revalidate=120')
  })

  it('returns 429 with Retry-After once an IP exceeds the per-minute limit', async () => {
    const ip = '2.2.2.2'
    let last: Response | null = null
    for (let i = 0; i < 121; i++) {
      last = await GET(requestFrom(ip))
    }
    expect(last!.status).toBe(429)
    expect(last!.headers.get('Retry-After')).toBeTruthy()
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

  it('never exposes a userId/viewerId anywhere in the JSON payload', async () => {
    const SECRET_OWNER = 'secret-owner-id'
    const SECRET_VIEWER = 'secret-viewer-id'
    seedUser(SECRET_OWNER, 'publicowner')
    seedShare(SECRET_OWNER, 'tag')
    seedEvent({
      ownerUserId: SECRET_OWNER,
      tag: 'tag',
      createdAt: new Date().toISOString(),
      viewerId: SECRET_VIEWER,
    })

    const res = await GET(requestFrom('5.5.5.5'))
    const body = await res.json()

    expect(body.items.length).toBeGreaterThan(0)
    for (const item of body.items) {
      expect(item).not.toHaveProperty('userId')
      expect(item).not.toHaveProperty('viewerId')
      expect(item).not.toHaveProperty('ownerUserId')
    }
    expect(JSON.stringify(body)).not.toContain(SECRET_OWNER)
    expect(JSON.stringify(body)).not.toContain(SECRET_VIEWER)
  })
})
