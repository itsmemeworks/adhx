import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'
import { and, eq } from 'drizzle-orm'
import { tiktokCreatedAtFromId } from '@/lib/media/tiktok-id'

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

  it('rejects youtu.be and watch?v= forms — those are regular videos', async () => {
    const a = await POST(createRequest({ url: 'https://youtu.be/Y9aytLYBajw' }))
    expect(a.status).toBe(400)
    expect(await a.json()).toMatchObject({ error: expect.stringContaining('Unsupported URL') })

    const b = await POST(createRequest({ url: 'https://www.youtube.com/watch?v=Y9aytLYBajw' }))
    expect(b.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
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

/**
 * API Route Tests: /api/bookmarks/add — TikTok dispatch.
 *
 * Owner report: saved TikToks showed "56y" as the post age on the
 * collection theater — tnktok's metadata carries no date field, so the
 * inserted bookmark's `createdAt` was left null. Since TikTok ids are
 * Snowflake-style (the real post time is encoded in the id), the add flow
 * now derives it via `tiktokCreatedAtFromId` at insert time.
 *
 * `resolveTikTokUrl`/`isTikTokShortLink` run for real (a canonical
 * `@user/video/{id}` URL is parsed locally, no network call) — only
 * `fetchTikTokMetadata` is mocked.
 */
const mockFetchTikTokMetadata = vi.fn()
vi.mock('@/lib/media/tnktok', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/tnktok')>('@/lib/media/tnktok')
  return {
    ...actual,
    fetchTikTokMetadata: (...args: unknown[]) => mockFetchTikTokMetadata(...args),
  }
})

describe('POST /api/bookmarks/add — TikTok', () => {
  const REAL_SNOWFLAKE_ID = '7673414867981831440'

  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = 'user-123'
    mockFetchTikTokMetadata.mockReset()
  })
  afterEach(() => testInstance.close())

  it('derives createdAt from the TikTok Snowflake id (tnktok metadata carries no date)', async () => {
    mockFetchTikTokMetadata.mockResolvedValue({
      videoUrl: 'https://cdn.tiktokv.com/video.mp4',
      description: 'a cool video',
      authorName: 'Some Creator',
    })

    const res = await POST(
      createRequest({
        url: `https://www.tiktok.com/@someuser/video/${REAL_SNOWFLAKE_ID}`,
        source: 'url_prefix',
      }),
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.platform).toBe('tiktok')

    const [row] = testInstance.db
      .select()
      .from(schema.bookmarks)
      .where(
        and(
          eq(schema.bookmarks.userId, 'user-123'),
          eq(schema.bookmarks.platform, 'tiktok'),
          eq(schema.bookmarks.id, REAL_SNOWFLAKE_ID),
        ),
      )
      .all()

    expect(row).toMatchObject({
      platform: 'tiktok',
      author: 'someuser',
      text: 'a cool video',
      category: 'video',
    })
    expect(row.createdAt).toBe(tiktokCreatedAtFromId(REAL_SNOWFLAKE_ID))
    expect(row.createdAt).toBe('2026-08-13T07:28:42.000Z')
  })

  it('stores a null createdAt when the id does not parse as a Snowflake id (never a fabricated date)', async () => {
    mockFetchTikTokMetadata.mockResolvedValue({
      videoUrl: 'https://cdn.tiktokv.com/video.mp4',
      description: 'weird id',
    })
    // Below the ~2014 sanity floor tiktokCreatedAtFromId enforces.
    const tinyId = '123456'
    await POST(createRequest({ url: `https://www.tiktok.com/@someuser/video/${tinyId}` }))

    const [row] = testInstance.db
      .select()
      .from(schema.bookmarks)
      .where(
        and(
          eq(schema.bookmarks.userId, 'user-123'),
          eq(schema.bookmarks.platform, 'tiktok'),
          eq(schema.bookmarks.id, tinyId),
        ),
      )
      .all()
    expect(row.createdAt).toBe(null)
  })

  it('404s when the video cannot be resolved', async () => {
    mockFetchTikTokMetadata.mockResolvedValue(null)
    const res = await POST(
      createRequest({ url: `https://www.tiktok.com/@someuser/video/${REAL_SNOWFLAKE_ID}` }),
    )
    expect(res.status).toBe(404)
  })

  it('requires auth', async () => {
    mockUserId = null
    const res = await POST(
      createRequest({ url: `https://www.tiktok.com/@someuser/video/${REAL_SNOWFLAKE_ID}` }),
    )
    expect(res.status).toBe(401)
  })
})
