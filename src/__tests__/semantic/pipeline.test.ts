import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from '../api/setup'
import type { FeedItemResponse } from '@/lib/feed/build-item'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction: <R>(fn: () => R): R => testInstance.sqlite.transaction(fn)(),
}))

const embedTexts = vi.fn(async (texts: string[]) => texts.map(() => unit(768)))
const embedImageBytes = vi.fn(async () => unit(768))
const embedVideoFrames = vi.fn(async (_files: string[], _duration: number, _interval: number) =>
  unit(768),
)
vi.mock('@/lib/semantic/model', () => ({
  embedTexts: (texts: string[]) => embedTexts(texts),
  embedImageBytes: () => embedImageBytes(),
  embedVideoFrames: (files: string[], duration: number, interval: number) =>
    embedVideoFrames(files, duration, interval),
}))

const fetchImageBytes = vi.fn(async (_url: string) => new Uint8Array([1, 2, 3]))
const sampleVideoFrames = vi.fn(async (_url: string) => ({
  dir: '/tmp/x',
  files: ['/tmp/x/f001.jpg'],
  duration: 120,
  secondsPerFrame: 15,
  cleanup: async () => {},
}))
vi.mock('@/lib/semantic/media', async (orig) => {
  const actual = await orig<typeof import('@/lib/semantic/media')>()
  return {
    ...actual,
    fetchImageBytes: (url: string) => fetchImageBytes(url),
    sampleVideoFrames: (url: string) => sampleVideoFrames(url),
  }
})

function unit(n: number): Float32Array {
  const v = new Float32Array(n)
  v[0] = 1
  return v
}

import { normalize, toBlob, fromBlob, cosine } from '@/lib/semantic/vectors'
import { buildPostDocument, hashFor, queryPrompt } from '@/lib/semantic/documents'
import { enqueuePosts, enqueueBackfill, nextJob, failJob } from '@/lib/semantic/queue'
import { processJob } from '@/lib/semantic/worker'
import { getUnderstandingStatus } from '@/lib/semantic/status'
import { ownedKeys, retryFailed } from '@/lib/semantic'
import { MediaGoneError, MediaUnavailableError, NotAVideoError } from '@/lib/semantic/media'
import { PRIORITY, SEMANTIC_MODEL_VERSION } from '@/lib/semantic/config'

function feedItem(overrides: Partial<FeedItemResponse> = {}): FeedItemResponse {
  return {
    id: '111',
    platform: 'twitter',
    author: 'alice',
    authorName: 'Alice',
    authorProfileImageUrl: null,
    text: 'squirrels eating caramel wafers',
    tweetUrl: 'https://x.com/alice/status/111',
    createdAt: null,
    processedAt: new Date().toISOString(),
    category: 'tweet',
    isArchived: false,
    isQuote: false,
    quoteContext: null,
    quotedTweetId: null,
    quotedTweet: null,
    isRetweet: false,
    retweetContext: null,
    media: null,
    links: null,
    articlePreview: null,
    articleContent: null,
    isXArticle: false,
    tags: ['private-tag'],
    parentTweets: null,
    summary: null,
    ...overrides,
  }
}

function addMedia(userId: string, bookmarkId: string, mediaType: string, platform = 'twitter') {
  testInstance.db
    .insert(schema.bookmarkMedia)
    .values({
      id: `${bookmarkId}_m1`,
      userId,
      platform,
      bookmarkId,
      mediaType,
      originalUrl: 'https://pbs.twimg.com/media/abc.jpg',
      previewUrl: 'https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg',
    })
    .run()
}

beforeEach(() => {
  testInstance = createTestDb()
  vi.clearAllMocks()
})

describe('vectors', () => {
  it('normalizes and round-trips through a SQLite blob', () => {
    const v = normalize(Array.from({ length: 768 }, (_, i) => (i === 0 ? 3 : i === 1 ? 4 : 0)))
    expect(v[0]).toBeCloseTo(0.6)
    const back = fromBlob(toBlob(v))!
    expect(cosine(v, back)).toBeCloseTo(1)
  })

  it('rejects wrong sizes and non-finite values', () => {
    expect(() => normalize([1, 2, 3])).toThrow(/dimensions/)
    expect(() => normalize(Array.from({ length: 768 }, () => NaN))).toThrow(/non-finite/)
  })
})

describe('documents', () => {
  it('reads the words but never the private tags', () => {
    const doc = buildPostDocument(feedItem())
    expect(doc.text).toContain('squirrels eating caramel wafers')
    expect(doc.text).not.toContain('private-tag')
    expect(doc.text.startsWith('title: none | text: ')).toBe(true)
    expect(doc.image).toBeNull()
    expect(doc.video).toBeNull()
    expect(queryPrompt(' biscuits ')).toBe('task: search result | query: biscuits')
  })

  it('uses the poster for pictures and the kept-file route for X video frames', () => {
    const doc = buildPostDocument(
      feedItem({
        media: [
          {
            id: 'm',
            mediaType: 'video',
            width: 1,
            height: 1,
            durationMs: 1000,
            altText: null,
            url: '/api/files/twitter/111/video-1?a=alice',
            thumbnailUrl: 'https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg',
            shareUrl: '',
            originalUrl: null,
          },
        ],
      }),
    )
    expect(doc.image?.url).toBe('https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg')
    expect(doc.video?.url).toBe('/api/files/twitter/111/video-1?a=alice')
    expect(hashFor(doc, 'video')).toBe(doc.video?.hash)
  })

  it('never samples video frames from a raw off-site URL', () => {
    const doc = buildPostDocument(
      feedItem({
        media: [
          {
            id: 'm',
            mediaType: 'video',
            width: 1,
            height: 1,
            durationMs: 1000,
            altText: null,
            url: 'https://d.fxtwitter.com/alice/status/111.mp4',
            thumbnailUrl: 'https://pbs.twimg.com/amplify_video_thumb/1/img/a.jpg',
            shareUrl: '',
            originalUrl: null,
          },
        ],
      }),
    )
    expect(doc.video).toBeNull()
  })
})

describe('queue', () => {
  it('promotes an existing job when a higher priority arrives', async () => {
    await enqueuePosts([{ platform: 'twitter', postId: '1' }], PRIORITY.backfill, ['video'])
    await enqueuePosts([{ platform: 'twitter', postId: '2' }], PRIORITY.backfill, ['video'])
    await enqueuePosts([{ platform: 'twitter', postId: '2' }], PRIORITY.urgent, ['video'])
    const job = await nextJob(new Date(Date.now() + 1000))
    expect(job?.postId).toBe('2')
    expect(job?.priority).toBe(PRIORITY.urgent)
  })

  it('runs words before pictures before videos at the same priority', async () => {
    await enqueuePosts([{ platform: 'twitter', postId: '1' }], PRIORITY.sync, [
      'video',
      'image',
      'text',
    ])
    expect((await nextJob(new Date(Date.now() + 1000)))?.kind).toBe('text')
  })

  it('backs off on failure and gives up after three attempts', async () => {
    await enqueuePosts([{ platform: 'twitter', postId: '1' }], PRIORITY.sync, ['image'])
    let job = (await nextJob(new Date(Date.now() + 1000)))!
    expect(await failJob(job, 'boom')).toBe(false)
    expect(await nextJob()).toBeUndefined() // not due yet
    job = (await nextJob(new Date(Date.now() + 10 * 60_000)))!
    expect(job.attempts).toBe(1)
    expect(await failJob(job, 'boom')).toBe(false)
    job = (await nextJob(new Date(Date.now() + 60 * 60_000)))!
    expect(await failJob(job, 'boom')).toBe(true)
    expect(await nextJob(new Date(Date.now() + 2 * 60 * 60_000))).toBeUndefined()
  })

  it('refreshes only old video sampling for the signed-in saver and reports accurate progress', async () => {
    const { saveEmbedding } = await import('@/lib/semantic/store')
    const { VIDEO_SAMPLING } = await import('@/lib/semantic/config')
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, '71')).run()
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_B, '72')).run()
    addMedia(USER_A, '71', 'video')
    for (const kind of ['text', 'image', 'video'] as const)
      await saveEmbedding({
        platform: 'twitter',
        postId: '71',
        kind,
        status: 'ok',
        contentHash: 'legacy-hash',
        vector: unit(768),
      })
    expect((await getUnderstandingStatus(USER_A)).groups.find((g) => g.id === 'videos')?.done).toBe(
      0,
    )
    expect(await enqueueBackfill(USER_A)).toBe(1)
    expect(await enqueueBackfill(USER_A)).toBe(0)
    const queued = testInstance.db.select().from(schema.understandingQueue).all()
    expect(queued.map((q) => [q.postId, q.kind])).toEqual([['71', 'video']])
    await saveEmbedding({
      platform: 'twitter',
      postId: '71',
      kind: 'video',
      status: 'ok',
      contentHash: `${VIDEO_SAMPLING}|new-hash`,
      vector: unit(768),
    })
    await testInstance.db.delete(schema.understandingQueue)
    expect(await enqueueBackfill(USER_A)).toBe(0)
    expect((await getUnderstandingStatus(USER_A)).groups.find((g) => g.id === 'videos')?.done).toBe(
      1,
    )
  })

  it('backfills only what is missing', async () => {
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, '1')).run()
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_B, '1')).run()
    expect(await enqueueBackfill()).toBe(3) // one post (shared by two savers) × three kinds
    expect(await enqueueBackfill()).toBe(0)
  })
})

describe('worker', () => {
  it('understands words and marks missing media as none', async () => {
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, '1')).run()
    await enqueuePosts([{ platform: 'twitter', postId: '1' }], PRIORITY.urgent)
    for (let i = 0; i < 3; i++) await processJob((await nextJob(new Date(Date.now() + 1000)))!)
    const rows = testInstance.db.select().from(schema.postEmbeddings).all()
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.status]))
    expect(byKind).toEqual({ text: 'ok', image: 'none', video: 'none' })
    expect(rows.every((r) => r.model === SEMANTIC_MODEL_VERSION)).toBe(true)
    expect(embedTexts).toHaveBeenCalledTimes(1)
  })

  it('samples video frames and skips unchanged content on a second pass', async () => {
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, '2')).run()
    addMedia(USER_A, '2', 'video')
    await enqueuePosts([{ platform: 'twitter', postId: '2' }], PRIORITY.urgent, ['video'])
    expect(await processJob((await nextJob(new Date(Date.now() + 1000)))!)).toBe('done')
    expect(sampleVideoFrames).toHaveBeenCalledWith('/api/files/twitter/2/video-1?a=testauthor')
    await enqueuePosts([{ platform: 'twitter', postId: '2' }], PRIORITY.urgent, ['video'])
    expect(await processJob((await nextJob(new Date(Date.now() + 1000)))!)).toBe('skipped')
    expect(embedVideoFrames).toHaveBeenCalledTimes(1)
    expect(embedVideoFrames).toHaveBeenCalledWith(['/tmp/x/f001.jpg'], 120, 15)
  })

  it('records a permanent media refusal as failed without retrying', async () => {
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, '3')).run()
    addMedia(USER_A, '3', 'photo')
    fetchImageBytes.mockRejectedValueOnce(new MediaUnavailableError('Image host not allowed: x'))
    await enqueuePosts([{ platform: 'twitter', postId: '3' }], PRIORITY.urgent, ['image'])
    expect(await processJob((await nextJob(new Date(Date.now() + 1000)))!)).toBe('failed')
    expect(await nextJob(new Date(Date.now() + 2 * 60 * 60_000))).toBeUndefined()
  })

  it('records a "video" that is really a photo as nothing to understand', async () => {
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, '4')).run()
    addMedia(USER_A, '4', 'video')
    sampleVideoFrames.mockRejectedValueOnce(new NotAVideoError('Post is a photo, not a video'))
    await enqueuePosts([{ platform: 'twitter', postId: '4' }], PRIORITY.urgent, ['video'])
    expect(await processJob((await nextJob(new Date(Date.now() + 1000)))!)).toBe('skipped')
    const [row] = testInstance.db.select().from(schema.postEmbeddings).all()
    expect(row).toMatchObject({ kind: 'video', status: 'none' })
    expect(await nextJob(new Date(Date.now() + 2 * 60 * 60_000))).toBeUndefined()
    // A later save of the same content does not sample again.
    await enqueuePosts([{ platform: 'twitter', postId: '4' }], PRIORITY.urgent, ['video'])
    expect(await processJob((await nextJob(new Date(Date.now() + 1000)))!)).toBe('skipped')
    expect(sampleVideoFrames).toHaveBeenCalledTimes(1)
  })
})

describe('media deleted upstream', () => {
  it('records it as nothing to understand, not as a failure to retry', async () => {
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, '5')).run()
    addMedia(USER_A, '5', 'video')
    sampleVideoFrames.mockRejectedValueOnce(new MediaGoneError('Video is gone: 410'))
    await enqueuePosts([{ platform: 'twitter', postId: '5' }], PRIORITY.urgent, ['video'])
    expect(await processJob((await nextJob(new Date(Date.now() + 1000)))!)).toBe('skipped')
    const [row] = testInstance.db.select().from(schema.postEmbeddings).all()
    expect(row).toMatchObject({ kind: 'video', status: 'none', error: 'Video is gone: 410' })
    expect(await nextJob(new Date(Date.now() + 2 * 60 * 60_000))).toBeUndefined()
  })
})

describe('status and ownership', () => {
  it('counts words, photos and videos per user and retries only their failures', async () => {
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, '10')).run()
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, '11')).run()
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_B, '12')).run()
    addMedia(USER_A, '11', 'video')
    addMedia(USER_B, '12', 'photo')
    fetchImageBytes.mockRejectedValue(new MediaUnavailableError('Image host not allowed: x'))
    await enqueuePosts(
      [
        { platform: 'twitter', postId: '10' },
        { platform: 'twitter', postId: '11' },
        { platform: 'twitter', postId: '12' },
      ],
      PRIORITY.urgent,
    )
    for (
      let job = await nextJob(new Date(Date.now() + 1000));
      job;
      job = await nextJob(new Date(Date.now() + 1000))
    ) {
      await processJob(job)
    }
    fetchImageBytes.mockReset()

    const a = await getUnderstandingStatus(USER_A)
    expect(a.totalSaves).toBe(2)
    expect(a.groups.find((g) => g.id === 'words')).toMatchObject({ done: 2, total: 2 })
    expect(a.groups.find((g) => g.id === 'videos')).toMatchObject({ done: 1, total: 1 })
    // The video's poster counts as a picture, so its failure is visible here.
    expect(a.groups.find((g) => g.id === 'photos')).toMatchObject({ done: 1, total: 1, failed: 1 })
    expect(a.failed).toBe(1)
    expect(a.current).toBeNull()

    const b = await getUnderstandingStatus(USER_B)
    expect(b.groups.find((g) => g.id === 'photos')).toMatchObject({ done: 1, total: 1, failed: 1 })

    // USER_A's failed poster image (post 11) is retried; USER_B's is not touched.
    expect(await retryFailed(USER_A)).toBe(1)
    const queued = testInstance.db.select().from(schema.understandingQueue).all()
    expect(queued.map((q) => q.postId)).toEqual(['11'])
  })

  it('only prioritizes posts the user actually saved', async () => {
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, '20')).run()
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_B, '21')).run()
    const owned = await ownedKeys(USER_A, [
      { platform: 'twitter', postId: '20' },
      { platform: 'twitter', postId: '21' },
      { platform: 'tiktok', postId: '20' },
    ])
    expect(owned).toEqual([{ platform: 'twitter', postId: '20' }])
  })
})

describe('gone posts are never shown', () => {
  it('drops posts whose media was deleted upstream, keeping the order', async () => {
    const { withoutGone } = await import('@/lib/semantic/gone')
    testInstance.db.insert(schema.bookmarks).values(createTestBookmark(USER_A, '20')).run()
    addMedia(USER_A, '20', 'video')
    sampleVideoFrames.mockRejectedValueOnce(new MediaGoneError('Video is gone: 410'))
    await enqueuePosts([{ platform: 'twitter', postId: '20' }], PRIORITY.urgent, ['video'])
    await processJob((await nextJob(new Date(Date.now() + 1000)))!)
    const items = [{ key: 'twitter:21' }, { key: 'twitter:20' }, { key: 'twitter:22' }]
    expect((await withoutGone(items)).map((i) => i.key)).toEqual(['twitter:21', 'twitter:22'])
  })
})
