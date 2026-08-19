import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestDb, type TestDbInstance } from './setup'
import { activity } from '@/lib/db/schema'
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

import { POST } from '@/app/api/activity/share/route'
import { recordActivity } from '@/lib/activity/record'

function post(body: unknown): Promise<Response> {
  return POST(
    new NextRequest('http://localhost:3000/api/activity/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/activity/share', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = null
    __resetRateLimitState()
  })
  afterEach(() => testInstance.close())

  it('records a share from identifiers only, copying server-resolved content', async () => {
    recordActivity({
      action: 'preview',
      platform: 'instagram',
      bookmarkId: 'reel1',
      author: 'nature',
      text: 'server caption',
      thumbnailUrl: '/api/media/instagram/thumbnail?id=reel1',
      url: '/reels/reel1',
    })

    const res = await post({
      platform: 'instagram',
      id: 'reel1',
      text: '<script>alert(1)</script>',
      thumbnailUrl: 'https://evil.example/x.jpg',
    })
    expect(res.status).toBe(204)

    const shares = testInstance.db
      .select()
      .from(activity)
      .all()
      .filter((r) => r.action === 'share')
    expect(shares).toHaveLength(1)
    expect(shares[0].text).toBe('server caption')
    expect(shares[0].thumbnailUrl).toBe('/api/media/instagram/thumbnail?id=reel1')
    expect(shares[0].text).not.toContain('script')
  })

  it('ignores client-sent textLinks/quote and keeps the server-recorded values', async () => {
    recordActivity({
      action: 'preview',
      platform: 'twitter',
      bookmarkId: 'qt1',
      author: 'someone',
      url: '/someone/status/qt1',
      textLinks: [{ expandedUrl: 'https://real-source.example/article' }],
      quote: { author: 'realquoter', text: 'the real quote' },
    })

    const res = await post({
      platform: 'twitter',
      id: 'qt1',
      textLinks: [{ expandedUrl: 'https://evil.example/x' }],
      quote: { author: 'hijacked', text: 'injected quote' },
    })
    expect(res.status).toBe(204)

    const shares = testInstance.db
      .select()
      .from(activity)
      .all()
      .filter((r) => r.action === 'share')
    expect(shares).toHaveLength(1)
    expect(JSON.parse(shares[0].textLinks!)).toEqual([
      { shortUrl: null, expandedUrl: 'https://real-source.example/article', linkType: null },
    ])
    expect(JSON.parse(shares[0].quoteJson!)).toMatchObject({
      author: 'realquoter',
      text: 'the real quote',
    })
  })

  it('is a no-op 204 for an unknown post (does not invent a card)', async () => {
    const res = await post({ platform: 'tiktok', id: 'nope' })
    expect(res.status).toBe(204)
    expect(testInstance.db.select().from(activity).all()).toHaveLength(0)
  })

  it('rejects an invalid platform', async () => {
    const res = await post({ platform: 'myspace', id: '1' })
    expect(res.status).toBe(400)
  })

  it('never returns userId', async () => {
    mockUserId = 'secret-user'
    recordActivity({
      action: 'preview',
      platform: 'youtube',
      bookmarkId: 'abc',
      author: 'yt',
      url: '/shorts/abc',
    })
    const res = await post({ platform: 'youtube', id: 'abc' })
    expect(res.status).toBe(204)
    expect(res.headers.get('content-type')).toBeNull()
    const shares = testInstance.db
      .select()
      .from(activity)
      .all()
      .filter((r) => r.action === 'share')
    expect(shares[0].userId).toBe('secret-user')
  })
})
