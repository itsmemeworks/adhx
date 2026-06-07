import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'
import { and, eq } from 'drizzle-orm'

/**
 * API Route Tests: /api/bookmarks/add — YouTube Shorts dispatch.
 *
 * Verifies the platform-agnostic add endpoint resolves a YouTube URL via
 * oEmbed (mocked through fetch), stores a youtube bookmark + poster media row,
 * and pushes an anonymous activity-pulse event.
 */

let testInstance: TestDbInstance
let mockUserId: string | null = 'user-123'

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
}))

vi.mock('@/lib/sentry', () => ({
  metrics: { bookmarkAdded: vi.fn() },
  captureException: vi.fn(),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

import { POST } from '@/app/api/bookmarks/add/route'

function createRequest(body: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/bookmarks/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockOembed() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      title: 'June 5, 2026',
      author_name: 'BassForge',
      author_url: 'https://www.youtube.com/@BassForge_us',
    }),
  })
}

describe('POST /api/bookmarks/add — YouTube', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = 'user-123'
    mockFetch.mockReset()
  })
  afterEach(() => testInstance.close())

  it('saves a Short from a /shorts/ URL (with ?si tracking param)', async () => {
    mockOembed()
    const res = await POST(
      createRequest({ url: 'https://youtube.com/shorts/Y9aytLYBajw?si=abc', source: 'url_prefix' }),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.platform).toBe('youtube')

    const [row] = testInstance.db
      .select()
      .from(schema.bookmarks)
      .where(
        and(
          eq(schema.bookmarks.userId, 'user-123'),
          eq(schema.bookmarks.platform, 'youtube'),
          eq(schema.bookmarks.id, 'Y9aytLYBajw'),
        ),
      )
      .all()
    expect(row).toMatchObject({
      platform: 'youtube',
      author: 'BassForge_us',
      text: 'June 5, 2026',
      tweetUrl: 'https://www.youtube.com/shorts/Y9aytLYBajw',
      category: 'video',
    })

    // poster stored as a video media row pointing at i.ytimg.com
    const [media] = testInstance.db
      .select()
      .from(schema.bookmarkMedia)
      .where(
        and(
          eq(schema.bookmarkMedia.userId, 'user-123'),
          eq(schema.bookmarkMedia.platform, 'youtube'),
          eq(schema.bookmarkMedia.bookmarkId, 'Y9aytLYBajw'),
        ),
      )
      .all()
    expect(media.mediaType).toBe('video')
    expect(media.previewUrl).toBe('https://i.ytimg.com/vi/Y9aytLYBajw/hqdefault.jpg')
  })

  it('also accepts youtu.be and watch?v= forms', async () => {
    mockOembed()
    const a = await (await POST(createRequest({ url: 'https://youtu.be/Y9aytLYBajw' }))).json()
    expect(a.success).toBe(true)

    const b = await (
      await POST(createRequest({ url: 'https://www.youtube.com/watch?v=Y9aytLYBajw' }))
    ).json()
    // same id → duplicate on the second insert
    expect(b.isDuplicate).toBe(true)
  })

  it('records an anonymous activity-pulse save event', async () => {
    mockOembed()
    await POST(createRequest({ url: 'https://youtube.com/shorts/Y9aytLYBajw' }))

    const [evt] = testInstance.db.select().from(schema.activity).all()
    expect(evt).toMatchObject({
      action: 'save',
      platform: 'youtube',
      bookmarkId: 'Y9aytLYBajw',
      url: '/shorts/Y9aytLYBajw',
    })
  })

  it('404s when the video cannot be resolved', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    const res = await POST(createRequest({ url: 'https://youtube.com/shorts/Y9aytLYBajw' }))
    expect(res.status).toBe(404)
  })

  it('requires auth', async () => {
    mockUserId = null
    const res = await POST(createRequest({ url: 'https://youtube.com/shorts/Y9aytLYBajw' }))
    expect(res.status).toBe(401)
  })
})
