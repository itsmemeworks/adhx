import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createTestBookmark, createTestDb, type TestDbInstance } from './setup'
import {
  activity,
  analyticsEvents,
  bookmarks,
  moderatedPosts,
  userBans,
  type NewActivity,
} from '@/lib/db/schema'
import { __resetRateLimitState } from '@/lib/rate-limit'

let testInstance: TestDbInstance
let mockUserId: string | null = null
let mockSessionUserId: string | null = null

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
  getSession: vi.fn(() =>
    Promise.resolve(
      mockSessionUserId ? { userId: mockSessionUserId, username: 'analytics-test' } : null,
    ),
  ),
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

function seedActivity(bookmarkId: string, overrides: Partial<NewActivity> = {}): void {
  testInstance.db
    .insert(activity)
    .values({
      action: 'preview',
      platform: 'twitter',
      bookmarkId,
      author: 'trusted-author',
      url: `/trusted-author/status/${bookmarkId}`,
      contentType: 'text',
      createdAt: new Date().toISOString(),
      ...overrides,
    })
    .run()
}

describe('POST /api/analytics', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = 'user-a'
    mockSessionUserId = 'user-a'
    __resetRateLimitState()
  })
  afterEach(() => testInstance.close())

  it('records a post known through another user bookmark', async () => {
    testInstance.db.insert(bookmarks).values(createTestBookmark('owner-b', '123')).run()

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

  it('requires a complete bounded post identity', async () => {
    const missingPlatform = await post({ name: 'post.copy', id: '1' })
    const missingId = await post({ name: 'post.copy', platform: 'twitter' })
    const blankId = await post({ name: 'post.copy', platform: 'twitter', id: '   ' })
    const oversizedId = await post({
      name: 'post.copy',
      platform: 'twitter',
      id: 'x'.repeat(81),
    })

    expect([missingPlatform.status, missingId.status, blankId.status, oversizedId.status]).toEqual([
      400, 400, 400, 400,
    ])
    expect(testInstance.db.select().from(analyticsEvents).all()).toHaveLength(0)
  })

  it('rejects unknown events and invalid platforms', async () => {
    const unknown = await post({ name: 'post.explode', platform: 'twitter', id: '1' })
    const invalidPlatform = await post({ name: 'post.copy', platform: 'myspace', id: '1' })
    expect(unknown.status).toBe(400)
    expect(invalidPlatform.status).toBe(400)
    expect(testInstance.db.select().from(analyticsEvents).all()).toHaveLength(0)
  })

  it('ignores client content and resolves content type from trusted data', async () => {
    seedActivity('1', { contentType: 'text' })
    const res = await post({
      name: 'post.copy',
      platform: 'twitter',
      id: '1',
      contentType: 'video',
      text: '<script>invented</script>',
      thumbnailUrl: 'https://evil.example/image.jpg',
    })
    expect(res.status).toBe(204)
    const rows = testInstance.db.select().from(analyticsEvents).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].contentType).toBe('text')
  })

  it('silently ignores an unknown post', async () => {
    const res = await post({ name: 'post.open', platform: 'twitter', id: 'unknown' })
    expect(res.status).toBe(204)
    expect(testInstance.db.select().from(analyticsEvents).all()).toHaveLength(0)
  })

  it('silently ignores a moderated post', async () => {
    seedActivity('hidden')
    testInstance.db
      .insert(moderatedPosts)
      .values({
        platform: 'twitter',
        bookmarkId: 'hidden',
        hidden: 1,
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
      })
      .run()

    const res = await post({ name: 'post.send', platform: 'twitter', id: 'hidden' })
    expect(res.status).toBe(204)
    expect(testInstance.db.select().from(analyticsEvents).all()).toHaveLength(0)
  })

  it('fails closed when the moderation store is unavailable', async () => {
    seedActivity('store-down')
    testInstance.sqlite.exec('DROP TABLE moderated_posts')

    const res = await post({ name: 'post.copy', platform: 'twitter', id: 'store-down' })
    expect(res.status).toBe(204)
    expect(testInstance.db.select().from(analyticsEvents).all()).toHaveLength(0)
  })

  it('does not record a banned session as anonymous', async () => {
    seedActivity('banned-click')
    testInstance.db
      .insert(userBans)
      .values({
        userId: 'banned-user',
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
      })
      .run()
    mockSessionUserId = 'banned-user'
    mockUserId = null

    const res = await post({ name: 'post.open', platform: 'twitter', id: 'banned-click' })
    const shortcut = await post({ name: 'shortcut.install', source: 'shortcut' })
    expect(res.status).toBe(204)
    expect(shortcut.status).toBe(204)
    expect(testInstance.db.select().from(analyticsEvents).all()).toHaveLength(0)
  })

  it('records valid anonymous post use', async () => {
    seedActivity('anonymous')
    mockSessionUserId = null
    mockUserId = null

    const res = await post({ name: 'post.send', platform: 'twitter', id: 'anonymous' })
    expect(res.status).toBe(204)
    expect(testInstance.db.select().from(analyticsEvents).all()).toMatchObject([
      {
        name: 'post.send',
        platform: 'twitter',
        bookmarkId: 'anonymous',
        userId: null,
      },
    ])
  })

  it('dedupes repeated anonymous events by post identity', async () => {
    seedActivity('dedupe')
    mockSessionUserId = null
    mockUserId = null

    await post({ name: 'post.copy', platform: 'twitter', id: 'dedupe' })
    await post({ name: 'post.copy', platform: 'twitter', id: 'dedupe' })

    expect(testInstance.db.select().from(analyticsEvents).all()).toHaveLength(1)
  })

  it('keeps an anonymous event after an authenticated event for the same post', async () => {
    seedActivity('mixed-auth-first')

    await post({ name: 'post.open', platform: 'twitter', id: 'mixed-auth-first' })
    mockSessionUserId = null
    mockUserId = null
    await post({ name: 'post.open', platform: 'twitter', id: 'mixed-auth-first' })

    expect(testInstance.db.select().from(analyticsEvents).all()).toMatchObject([
      { bookmarkId: 'mixed-auth-first', userId: 'user-a' },
      { bookmarkId: 'mixed-auth-first', userId: null },
    ])
  })

  it('keeps an authenticated event after an anonymous event for the same post', async () => {
    seedActivity('mixed-anonymous-first')
    mockSessionUserId = null
    mockUserId = null

    await post({ name: 'post.open', platform: 'twitter', id: 'mixed-anonymous-first' })
    mockSessionUserId = 'user-a'
    mockUserId = 'user-a'
    await post({ name: 'post.open', platform: 'twitter', id: 'mixed-anonymous-first' })

    expect(testInstance.db.select().from(analyticsEvents).all()).toMatchObject([
      { bookmarkId: 'mixed-anonymous-first', userId: null },
      { bookmarkId: 'mixed-anonymous-first', userId: 'user-a' },
    ])
  })

  it('keeps shortcut installs identity-free', async () => {
    const res = await post({
      name: 'shortcut.install',
      platform: 'twitter',
      id: 'not-a-post',
      contentType: 'video',
      source: 'shortcut',
    })
    expect(res.status).toBe(204)
    expect(testInstance.db.select().from(analyticsEvents).all()).toMatchObject([
      {
        name: 'shortcut.install',
        platform: null,
        bookmarkId: null,
        contentType: null,
        source: 'shortcut',
      },
    ])
  })

  it('allows native/server-style calls without Origin', async () => {
    seedActivity('native')
    const res = await post({ name: 'post.open', platform: 'twitter', id: 'native' })
    expect(res.status).toBe(204)
  })

  it('rate-limits analytics writes', async () => {
    seedActivity('limited')
    mockSessionUserId = null
    mockUserId = null

    for (let i = 0; i < 30; i++) {
      const res = await post({ name: 'post.open', platform: 'twitter', id: 'limited' })
      expect(res.status).toBe(204)
    }
    const limited = await post({ name: 'post.open', platform: 'twitter', id: 'limited' })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBeTruthy()
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
    mockSessionUserId = null
    __resetRateLimitState()
  })
  afterEach(() => testInstance.close())

  it('returns aggregates and never includes userId', async () => {
    seedActivity('v1', { platform: 'tiktok', contentType: 'video' })
    mockUserId = 'hidden'
    mockSessionUserId = 'hidden'
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
