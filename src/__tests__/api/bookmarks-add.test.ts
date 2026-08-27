import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestBookmark, createTestDb, type TestDbInstance } from './setup'
import { and, eq } from 'drizzle-orm'
import { tiktokCreatedAtFromId } from '@/lib/media/tiktok-id'
import { metrics } from '@/lib/sentry'

/**
 * API Route Tests: /api/bookmarks/add — YouTube Shorts dispatch.
 *
 * Verifies the platform-agnostic add endpoint resolves a YouTube URL via
 * mocked metadata, stores a youtube bookmark + poster media row,
 * and pushes an anonymous activity-pulse event.
 */

let testInstance: TestDbInstance
let mockUserId: string | null = 'user-123'
let beforeTransaction: (() => void) | null = null

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    const interleave = beforeTransaction
    beforeTransaction = null
    interleave?.()
    return testInstance.sqlite.transaction(fn)()
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

const mockFetchReelMetadata = vi.fn()
vi.mock('@/lib/media/instafix', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/media/instafix')>('@/lib/media/instafix')
  return {
    ...actual,
    fetchInstagramMetadata: (...args: unknown[]) => mockFetchReelMetadata(...args),
  }
})

const mockFetchTikTokMetadata = vi.fn()
vi.mock('@/lib/media/tnktok', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/tnktok')>('@/lib/media/tnktok')
  return {
    ...actual,
    fetchTikTokMetadata: (...args: unknown[]) => mockFetchTikTokMetadata(...args),
  }
})

const mockFetchYouTubeMetadata = vi.fn()
vi.mock('@/lib/media/youtube', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/youtube')>('@/lib/media/youtube')
  return {
    ...actual,
    fetchYouTubeMetadata: (...args: unknown[]) => mockFetchYouTubeMetadata(...args),
  }
})

import { POST } from '@/app/api/bookmarks/add/route'

function createRequest(body: object): NextRequest {
  return new NextRequest('http://localhost:3000/api/bookmarks/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deleteSavedParent(platform: string, id: string): void {
  testInstance.db
    .delete(schema.bookmarks)
    .where(
      and(
        eq(schema.bookmarks.userId, 'user-123'),
        eq(schema.bookmarks.platform, platform),
        eq(schema.bookmarks.id, id),
      ),
    )
    .run()
}

function mockOembed() {
  mockFetchYouTubeMetadata.mockResolvedValue({
    videoId: 'Y9aytLYBajw',
    title: 'June 5, 2026',
    authorName: 'BassForge',
    author: '@BassForge_us',
    thumbnailUrl: 'https://i.ytimg.com/vi/Y9aytLYBajw/hqdefault.jpg',
  })
}

describe('POST /api/bookmarks/add — Instagram', () => {
  const REEL_ID = 'Cwnj8o6pKbn'
  const REEL_URL = `https://www.instagram.com/reels/${REEL_ID}/`

  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = 'user-123'
    beforeTransaction = null
    vi.clearAllMocks()
    mockFetchReelMetadata.mockResolvedValue({
      imageUrl: 'https://scontent.cdninstagram.com/reel.jpg',
      caption: 'a reel',
      author: '@reel-maker',
      authorName: 'Reel Maker',
      contentType: 'video',
      media: [
        {
          type: 'video',
          imageUrl: 'https://scontent.cdninstagram.com/reel.jpg',
          width: 1080,
          height: 1920,
        },
      ],
    })
  })
  afterEach(() => testInstance.close())

  it('writes the bookmark and expected media together', async () => {
    const res = await POST(createRequest({ url: REEL_URL, source: 'url_prefix' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      success: true,
      isDuplicate: false,
      platform: 'instagram',
    })

    expect(
      testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(
          and(
            eq(schema.bookmarks.userId, 'user-123'),
            eq(schema.bookmarks.platform, 'instagram'),
            eq(schema.bookmarks.id, REEL_ID),
          ),
        )
        .all(),
    ).toHaveLength(1)
    expect(
      testInstance.db
        .select()
        .from(schema.bookmarkMedia)
        .where(
          and(
            eq(schema.bookmarkMedia.userId, 'user-123'),
            eq(schema.bookmarkMedia.platform, 'instagram'),
            eq(schema.bookmarkMedia.bookmarkId, REEL_ID),
          ),
        )
        .all(),
    ).toHaveLength(1)
    expect(mockFetchReelMetadata).toHaveBeenCalledWith(REEL_ID, 'reel')
  })

  it('saves a tracked /p/ carousel as ordered photo media', async () => {
    const postId = 'DcHXej3lt5W'
    const images = Array.from({ length: 11 }, (_, index) => ({
      type: 'photo' as const,
      imageUrl: `https://scontent.cdninstagram.com/slide-${index + 1}.jpg`,
      width: 1440,
      height: 1920 + index,
      altText: `Slide ${index + 1}`,
    }))
    mockFetchReelMetadata.mockResolvedValueOnce({
      imageUrl: images[0].imageUrl,
      caption: 'Good news carousel',
      author: '@goodnews',
      authorName: 'Good News',
      contentType: 'photo',
      media: images,
    })

    const res = await POST(
      createRequest({
        url: `https://www.instagram.com/p/${postId}/?utm_source=ig_web_copy_link&igsi=abc`,
        source: 'manual',
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      success: true,
      platform: 'instagram',
      bookmark: {
        category: 'photo',
        tweetUrl: `https://www.instagram.com/p/${postId}/`,
      },
    })

    const stored = testInstance.db
      .select()
      .from(schema.bookmarkMedia)
      .where(
        and(
          eq(schema.bookmarkMedia.userId, 'user-123'),
          eq(schema.bookmarkMedia.platform, 'instagram'),
          eq(schema.bookmarkMedia.bookmarkId, postId),
        ),
      )
      .all()
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))

    expect(stored).toHaveLength(11)
    expect(stored[0]).toMatchObject({
      id: `${postId}_photo_0`,
      mediaType: 'photo',
      width: 1440,
      height: 1920,
      altText: 'Slide 1',
    })
    expect(stored[10]).toMatchObject({
      id: `${postId}_photo_10`,
      altText: 'Slide 11',
    })
    expect(testInstance.db.select().from(schema.activity).all()[0]).toMatchObject({
      contentType: 'photo',
      url: `/p/${postId}`,
    })
    expect(mockFetchReelMetadata).toHaveBeenCalledWith(postId, 'post')
  })

  it('repairs a duplicate parent missing media without inflating saves', async () => {
    testInstance.db
      .insert(schema.bookmarks)
      .values(
        createTestBookmark('user-123', REEL_ID, {
          platform: 'instagram',
          author: 'reel-maker',
          tweetUrl: REEL_URL,
          category: 'video',
        }),
      )
      .run()

    const res = await POST(createRequest({ url: REEL_URL }))
    expect(await res.json()).toMatchObject({ success: false, isDuplicate: true })
    expect(
      testInstance.db
        .select()
        .from(schema.bookmarkMedia)
        .where(
          and(
            eq(schema.bookmarkMedia.userId, 'user-123'),
            eq(schema.bookmarkMedia.platform, 'instagram'),
            eq(schema.bookmarkMedia.bookmarkId, REEL_ID),
          ),
        )
        .all(),
    ).toHaveLength(1)
    expect(metrics.bookmarkAdded).not.toHaveBeenCalled()
    expect(testInstance.db.select().from(schema.activity).all()).toHaveLength(0)
  })

  it('preserves healthy Reel media when a duplicate refresh has no poster', async () => {
    expect((await POST(createRequest({ url: REEL_URL }))).status).toBe(200)
    mockFetchReelMetadata.mockResolvedValueOnce({
      caption: 'a degraded refresh',
      author: '@reel-maker',
      authorName: 'Reel Maker',
      contentType: 'video',
      media: [{ type: 'video' }],
    })

    const duplicate = await POST(createRequest({ url: REEL_URL }))
    expect(await duplicate.json()).toMatchObject({ success: false, isDuplicate: true })

    const stored = testInstance.db
      .select()
      .from(schema.bookmarkMedia)
      .where(
        and(
          eq(schema.bookmarkMedia.userId, 'user-123'),
          eq(schema.bookmarkMedia.platform, 'instagram'),
          eq(schema.bookmarkMedia.bookmarkId, REEL_ID),
        ),
      )
      .all()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      previewUrl: 'https://scontent.cdninstagram.com/reel.jpg',
      originalUrl: 'https://scontent.cdninstagram.com/reel.jpg',
    })
  })

  it('recreates a duplicate deleted before repair and counts the actual insert', async () => {
    testInstance.db
      .insert(schema.bookmarks)
      .values(
        createTestBookmark('user-123', REEL_ID, {
          platform: 'instagram',
          author: 'reel-maker',
          tweetUrl: REEL_URL,
          category: 'video',
        }),
      )
      .run()
    beforeTransaction = () => deleteSavedParent('instagram', REEL_ID)

    const res = await POST(createRequest({ url: REEL_URL }))
    expect(await res.json()).toMatchObject({ success: true, isDuplicate: false })
    expect(
      testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(
          and(
            eq(schema.bookmarks.userId, 'user-123'),
            eq(schema.bookmarks.platform, 'instagram'),
            eq(schema.bookmarks.id, REEL_ID),
          ),
        )
        .all(),
    ).toHaveLength(1)
    expect(testInstance.db.select().from(schema.bookmarkMedia).all()).toHaveLength(1)
    expect(metrics.bookmarkAdded).toHaveBeenCalledTimes(1)
    expect(testInstance.db.select().from(schema.activity).all()).toHaveLength(1)
  })

  it('repairs media and returns the competing parent when another insert wins', async () => {
    const initial = createTestBookmark('user-123', REEL_ID, {
      platform: 'instagram',
      author: 'reel-maker',
      tweetUrl: REEL_URL,
      category: 'video',
    })
    testInstance.db.insert(schema.bookmarks).values(initial).run()
    beforeTransaction = () => {
      deleteSavedParent('instagram', REEL_ID)
      testInstance.db
        .insert(schema.bookmarks)
        .values({ ...initial, text: 'won by another request' })
        .run()
    }

    const res = await POST(createRequest({ url: REEL_URL }))
    const body = await res.json()
    expect(body).toMatchObject({
      success: false,
      isDuplicate: true,
      bookmark: { text: 'won by another request' },
    })
    expect(testInstance.db.select().from(schema.bookmarkMedia).all()).toHaveLength(1)
    expect(metrics.bookmarkAdded).not.toHaveBeenCalled()
    expect(testInstance.db.select().from(schema.activity).all()).toHaveLength(0)
  })

  it('rolls back the parent when the media write fails', async () => {
    testInstance.sqlite.exec(`
      CREATE TRIGGER fail_instagram_media
      BEFORE INSERT ON bookmark_media
      WHEN NEW.platform = 'instagram'
      BEGIN
        SELECT RAISE(ABORT, 'injected media failure');
      END;
    `)

    const res = await POST(createRequest({ url: REEL_URL }))
    expect(res.status).toBe(500)
    expect(
      testInstance.db
        .select()
        .from(schema.bookmarks)
        .where(
          and(
            eq(schema.bookmarks.userId, 'user-123'),
            eq(schema.bookmarks.platform, 'instagram'),
            eq(schema.bookmarks.id, REEL_ID),
          ),
        )
        .all(),
    ).toHaveLength(0)
    expect(testInstance.db.select().from(schema.bookmarkMedia).all()).toHaveLength(0)
  })
})

describe('POST /api/bookmarks/add — YouTube', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = 'user-123'
    beforeTransaction = null
    vi.clearAllMocks()
    mockFetch.mockReset()
    mockFetchYouTubeMetadata.mockReset()
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
    expect(mockFetchYouTubeMetadata).not.toHaveBeenCalled()
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

  it('repairs a duplicate parent missing media without inflating saves', async () => {
    testInstance.db
      .insert(schema.bookmarks)
      .values(
        createTestBookmark('user-123', 'Y9aytLYBajw', {
          platform: 'youtube',
          author: 'BassForge_us',
          tweetUrl: 'https://www.youtube.com/shorts/Y9aytLYBajw',
          category: 'video',
        }),
      )
      .run()

    const res = await POST(createRequest({ url: 'https://youtube.com/shorts/Y9aytLYBajw' }))
    expect(await res.json()).toMatchObject({ success: false, isDuplicate: true })
    expect(
      testInstance.db
        .select()
        .from(schema.bookmarkMedia)
        .where(
          and(
            eq(schema.bookmarkMedia.userId, 'user-123'),
            eq(schema.bookmarkMedia.platform, 'youtube'),
            eq(schema.bookmarkMedia.bookmarkId, 'Y9aytLYBajw'),
          ),
        )
        .all(),
    ).toHaveLength(1)
    expect(mockFetchYouTubeMetadata).not.toHaveBeenCalled()
    expect(metrics.bookmarkAdded).not.toHaveBeenCalled()
    expect(testInstance.db.select().from(schema.activity).all()).toHaveLength(0)
  })

  it('recreates a duplicate deleted before repair and counts the actual insert', async () => {
    testInstance.db
      .insert(schema.bookmarks)
      .values(
        createTestBookmark('user-123', 'Y9aytLYBajw', {
          platform: 'youtube',
          author: 'BassForge_us',
          tweetUrl: 'https://www.youtube.com/shorts/Y9aytLYBajw',
          category: 'video',
        }),
      )
      .run()
    beforeTransaction = () => deleteSavedParent('youtube', 'Y9aytLYBajw')

    const res = await POST(createRequest({ url: 'https://youtube.com/shorts/Y9aytLYBajw' }))
    expect(await res.json()).toMatchObject({ success: true, isDuplicate: false })
    expect(testInstance.db.select().from(schema.bookmarks).all()).toHaveLength(1)
    expect(testInstance.db.select().from(schema.bookmarkMedia).all()).toHaveLength(1)
    expect(mockFetchYouTubeMetadata).not.toHaveBeenCalled()
    expect(metrics.bookmarkAdded).toHaveBeenCalledTimes(1)
    expect(testInstance.db.select().from(schema.activity).all()).toHaveLength(1)
  })

  it('counts only the request that wins a concurrent parent insert', async () => {
    mockOembed()

    const responses = await Promise.all([
      POST(createRequest({ url: 'https://youtube.com/shorts/Y9aytLYBajw' })),
      POST(createRequest({ url: 'https://youtube.com/shorts/Y9aytLYBajw' })),
    ])
    const bodies = await Promise.all(responses.map((response) => response.json()))

    expect(bodies.filter((body) => body.success)).toHaveLength(1)
    expect(bodies.filter((body) => body.isDuplicate)).toHaveLength(1)
    expect(metrics.bookmarkAdded).toHaveBeenCalledTimes(1)
    expect(testInstance.db.select().from(schema.bookmarks).all()).toHaveLength(1)
    expect(testInstance.db.select().from(schema.bookmarkMedia).all()).toHaveLength(1)
    expect(testInstance.db.select().from(schema.activity).all()).toHaveLength(1)
  })

  it('rolls back the parent when the media write fails', async () => {
    mockOembed()
    testInstance.sqlite.exec(`
      CREATE TRIGGER fail_youtube_media
      BEFORE INSERT ON bookmark_media
      WHEN NEW.platform = 'youtube'
      BEGIN
        SELECT RAISE(ABORT, 'injected media failure');
      END;
    `)

    const res = await POST(createRequest({ url: 'https://youtube.com/shorts/Y9aytLYBajw' }))
    expect(res.status).toBe(500)
    expect(testInstance.db.select().from(schema.bookmarks).all()).toHaveLength(0)
    expect(testInstance.db.select().from(schema.bookmarkMedia).all()).toHaveLength(0)
    expect(metrics.bookmarkAdded).not.toHaveBeenCalled()
  })

  it('404s when the video cannot be resolved', async () => {
    mockFetchYouTubeMetadata.mockResolvedValue(null)
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
describe('POST /api/bookmarks/add — TikTok', () => {
  const REAL_SNOWFLAKE_ID = '7673414867981831440'

  beforeEach(() => {
    testInstance = createTestDb()
    mockUserId = 'user-123'
    beforeTransaction = null
    vi.clearAllMocks()
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

  it('repairs a duplicate parent missing media without inflating saves', async () => {
    mockFetchTikTokMetadata.mockResolvedValue({
      videoUrl: 'https://cdn.tiktokv.com/video.mp4',
      description: 'a cool video',
      authorName: 'Some Creator',
    })
    testInstance.db
      .insert(schema.bookmarks)
      .values(
        createTestBookmark('user-123', REAL_SNOWFLAKE_ID, {
          platform: 'tiktok',
          author: 'someuser',
          tweetUrl: `https://www.tiktok.com/@someuser/video/${REAL_SNOWFLAKE_ID}`,
          category: 'video',
        }),
      )
      .run()

    const res = await POST(
      createRequest({
        url: `https://www.tiktok.com/@someuser/video/${REAL_SNOWFLAKE_ID}`,
      }),
    )
    expect(await res.json()).toMatchObject({ success: false, isDuplicate: true })
    expect(
      testInstance.db
        .select()
        .from(schema.bookmarkMedia)
        .where(
          and(
            eq(schema.bookmarkMedia.userId, 'user-123'),
            eq(schema.bookmarkMedia.platform, 'tiktok'),
            eq(schema.bookmarkMedia.bookmarkId, REAL_SNOWFLAKE_ID),
          ),
        )
        .all(),
    ).toHaveLength(1)
    expect(metrics.bookmarkAdded).not.toHaveBeenCalled()
    expect(testInstance.db.select().from(schema.activity).all()).toHaveLength(0)
  })

  it('recreates a TikTok duplicate deleted before repair and counts the actual insert', async () => {
    mockFetchTikTokMetadata.mockResolvedValue({
      videoUrl: 'https://cdn.tiktokv.com/video.mp4',
      description: 'a cool video',
      authorName: 'Some Creator',
    })
    testInstance.db
      .insert(schema.bookmarks)
      .values(
        createTestBookmark('user-123', REAL_SNOWFLAKE_ID, {
          platform: 'tiktok',
          author: 'someuser',
          tweetUrl: `https://www.tiktok.com/@someuser/video/${REAL_SNOWFLAKE_ID}`,
          category: 'video',
        }),
      )
      .run()
    beforeTransaction = () => deleteSavedParent('tiktok', REAL_SNOWFLAKE_ID)

    const res = await POST(
      createRequest({
        url: `https://www.tiktok.com/@someuser/video/${REAL_SNOWFLAKE_ID}`,
      }),
    )
    expect(await res.json()).toMatchObject({ success: true, isDuplicate: false })
    expect(testInstance.db.select().from(schema.bookmarks).all()).toHaveLength(1)
    expect(testInstance.db.select().from(schema.bookmarkMedia).all()).toHaveLength(1)
    expect(metrics.bookmarkAdded).toHaveBeenCalledTimes(1)
    expect(testInstance.db.select().from(schema.activity).all()).toHaveLength(1)
  })

  it('rolls back the parent when the media write fails', async () => {
    mockFetchTikTokMetadata.mockResolvedValue({
      videoUrl: 'https://cdn.tiktokv.com/video.mp4',
      description: 'a cool video',
    })
    testInstance.sqlite.exec(`
      CREATE TRIGGER fail_tiktok_media
      BEFORE INSERT ON bookmark_media
      WHEN NEW.platform = 'tiktok'
      BEGIN
        SELECT RAISE(ABORT, 'injected media failure');
      END;
    `)

    const res = await POST(
      createRequest({
        url: `https://www.tiktok.com/@someuser/video/${REAL_SNOWFLAKE_ID}`,
      }),
    )
    expect(res.status).toBe(500)
    expect(testInstance.db.select().from(schema.bookmarks).all()).toHaveLength(0)
    expect(testInstance.db.select().from(schema.bookmarkMedia).all()).toHaveLength(0)
    expect(metrics.bookmarkAdded).not.toHaveBeenCalled()
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
