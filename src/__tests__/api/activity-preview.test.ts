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

import { POST } from '@/app/api/activity/preview/route'
import { recordActivity } from '@/lib/activity/record'

function post(
  body: unknown,
  userAgent = 'Mozilla/5.0 (compatible test browser)',
): Promise<Response> {
  return POST(
    new NextRequest('http://localhost:3000/api/activity/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/activity/preview', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = null
    __resetRateLimitState()
  })
  afterEach(() => testInstance.close())

  it('records a preview from identifiers only, copying server-resolved content', async () => {
    recordActivity({
      action: 'save',
      platform: 'instagram',
      bookmarkId: 'reel1',
      author: 'nature',
      text: 'server caption',
      thumbnailUrl: '/api/media/instagram/thumbnail?id=reel1',
      contentType: 'video',
      url: '/reels/reel1',
    })

    const res = await post({
      platform: 'instagram',
      id: 'reel1',
      text: '<script>alert(1)</script>',
      thumbnailUrl: 'https://evil.example/x.jpg',
      author: 'hijacked',
    })
    expect(res.status).toBe(204)

    const previews = testInstance.db
      .select()
      .from(activity)
      .all()
      .filter((r) => r.action === 'preview')
    expect(previews).toHaveLength(1)
    expect(previews[0].author).toBe('nature')
    expect(previews[0].text).toBe('server caption')
    expect(previews[0].thumbnailUrl).toBe('/api/media/instagram/thumbnail?id=reel1')
    expect(previews[0].contentType).toBe('video')
    expect(previews[0].text).not.toContain('script')
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

  it('rejects a malformed body', async () => {
    const res = await post(null)
    expect(res.status).toBe(400)
  })

  it('rejects a missing/invalid id', async () => {
    const res = await post({ platform: 'twitter', id: '' })
    expect(res.status).toBe(400)
  })

  it('is a silent 204 no-op for bot user agents', async () => {
    recordActivity({
      action: 'save',
      platform: 'twitter',
      bookmarkId: 'tw1',
      author: 'someone',
      url: '/someone/status/tw1',
    })

    const res = await post({ platform: 'twitter', id: 'tw1' }, 'Twitterbot/1.0')
    expect(res.status).toBe(204)
    const previews = testInstance.db
      .select()
      .from(activity)
      .all()
      .filter((r) => r.action === 'preview')
    expect(previews).toHaveLength(0)
  })

  it('never returns userId', async () => {
    mockUserId = 'secret-user'
    recordActivity({
      action: 'save',
      platform: 'youtube',
      bookmarkId: 'abc',
      author: 'yt',
      url: '/shorts/abc',
    })
    const res = await post({ platform: 'youtube', id: 'abc' })
    expect(res.status).toBe(204)
    expect(res.headers.get('content-type')).toBeNull()
    const previews = testInstance.db
      .select()
      .from(activity)
      .all()
      .filter((r) => r.action === 'preview')
    expect(previews[0].userId).toBe('secret-user')
  })
})
