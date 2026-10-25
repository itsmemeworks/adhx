import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
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

// No model, no ffmpeg, no child process: what the extract process would say is scripted.
const embedTexts = vi.fn(async (texts: string[]) => texts.map(() => unit(768)))
vi.mock('@/lib/semantic/model', () => ({
  embedTexts: (texts: string[]) => embedTexts(texts),
  embedImageBytes: vi.fn(async () => unit(768)),
  embedVideoFrames: vi.fn(async () => unit(768)),
}))
const transcribeSource = vi.fn()
const readScreenText = vi.fn()
vi.mock('@/lib/semantic/extract-media', () => ({
  transcribeSource: (...args: unknown[]) => transcribeSource(...args),
  readScreenText: (...args: unknown[]) => readScreenText(...args),
  sweepScratch: vi.fn(async () => undefined),
}))
vi.mock('@/lib/semantic/extractor', () => ({
  sharedExtractor: () => ({
    run: vi.fn(async () => {
      throw new Error('The extract process must never start in tests')
    }),
  }),
}))
const soundSource = vi.fn(async (url: string) => ({ source: `/kept${url}`, local: true }))
const frameSource = vi.fn(async (url: string) => ({ source: `/kept${url}`, local: true }))
const fetchImageBytes = vi.fn(async (_url: string) => new Uint8Array([1, 2, 3]))
const keptSoundFile = vi.fn(async (_url: string): Promise<string | null> => null)
vi.mock('@/lib/semantic/media', async (orig) => {
  const actual = await orig<typeof import('@/lib/semantic/media')>()
  return {
    ...actual,
    soundSource: (url: string) => soundSource(url),
    frameSource: (url: string) => frameSource(url),
    fetchImageBytes: (url: string) => fetchImageBytes(url),
    keptLocalFile: vi.fn(async () => null),
    keptSoundFile: (url: string) => keptSoundFile(url),
  }
})

function unit(n: number): Float32Array {
  const v = new Float32Array(n)
  v[0] = 1
  return v
}

import { buildPostDocument, hashFor } from '@/lib/semantic/documents'
import { enqueueBackfill, enqueuePosts, nextJob } from '@/lib/semantic/queue'
import { processJob } from '@/lib/semantic/worker'
import { extractedWords, getExtracted, saveExtracted } from '@/lib/semantic/extracted'
import { keywordSearch } from '@/lib/semantic/keywords'
import { labelExtractedMatches, searchPosts } from '@/lib/semantic/search'
import { __resetVectorIndex } from '@/lib/semantic/vector-index'
import { retryFailed } from '@/lib/semantic'
import { MediaGoneError } from '@/lib/semantic/media'
import { PRIORITY, SPEECH_VERSION, jobKinds } from '@/lib/semantic/config'

function feedItem(overrides: Partial<FeedItemResponse> = {}): FeedItemResponse {
  return {
    id: '1',
    platform: 'twitter',
    author: 'alice',
    authorName: 'Alice',
    authorProfileImageUrl: null,
    text: 'look at her go',
    tweetUrl: 'https://x.com/alice/status/1',
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
    tags: [],
    parentTweets: null,
    summary: null,
    ...overrides,
  }
}

const media = (mediaType: string, url: string, extra: Record<string, unknown> = {}) => ({
  id: `m-${url}`,
  mediaType,
  width: 1,
  height: 1,
  durationMs: mediaType === 'video' ? 41_000 : null,
  altText: null,
  url,
  thumbnailUrl: `${url}-thumb`,
  shareUrl: `${url}?download=1`,
  originalUrl: null,
  ...extra,
})

function savePost(userId: string, id: string, text = 'look at her go', type?: 'video' | 'photo') {
  testInstance.db
    .insert(schema.bookmarks)
    .values(createTestBookmark(userId, id, { text }))
    .run()
  if (type)
    testInstance.db
      .insert(schema.bookmarkMedia)
      .values({
        id: `${id}_m1`,
        userId,
        platform: 'twitter',
        bookmarkId: id,
        mediaType: type,
        originalUrl: 'https://pbs.twimg.com/media/a.jpg',
        previewUrl: 'https://pbs.twimg.com/media/a.jpg',
        durationMs: type === 'video' ? 41_000 : null,
      })
      .run()
}

async function drain(): Promise<string[]> {
  const ran: string[] = []
  for (
    let job = await nextJob(new Date(Date.now() + 1000));
    job;
    job = await nextJob(new Date(Date.now() + 1000))
  ) {
    ran.push(job.kind)
    await processJob(job)
  }
  return ran
}

function ftsBody(id: string): string | undefined {
  return testInstance.db.all<{ body: string }>(
    sql`SELECT body FROM post_text_fts WHERE post_id = ${id}`,
  )[0]?.body
}

const CAT = 'Okay so my cat just saw a cucumber behind her and she screamed.'

beforeEach(() => {
  testInstance = createTestDb()
  __resetVectorIndex()
  vi.clearAllMocks()
  keptSoundFile.mockResolvedValue(null)
  transcribeSource.mockResolvedValue({ text: CAT, language: 'en' })
  readScreenText.mockResolvedValue('CAT VS CUCUMBER')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the text document', () => {
  it('adds labelled speech and on-screen text after the post’s own words', () => {
    const plain = buildPostDocument(feedItem())
    const doc = buildPostDocument(feedItem(), { speech: CAT, screen: 'CAT VS\nCUCUMBER' })
    expect(doc.text).toBe(
      `title: none | text: look at her go\nPosted by Alice @alice\nSaid in the video: ${CAT}\nText on screen: CAT VS CUCUMBER`,
    )
    // Keywords carry the words without the labels.
    expect(doc.keywords).toContain(CAT)
    expect(doc.keywords).toContain('CAT VS CUCUMBER')
    expect(doc.keywords).not.toContain('Said in the video')
    expect(doc.keywords).not.toContain('Text on screen')
    // Only posts with extracted words get a new text hash.
    expect(doc.textHash).not.toBe(plain.textHash)
    expect(buildPostDocument(feedItem(), { speech: null, screen: '' }).textHash).toBe(
      plain.textHash,
    )
  })

  it('gives a wordless meme a text vector through its caption', () => {
    const meme = feedItem({ text: '', media: [media('photo', '/api/files/twitter/1/photo-1?v=2')] })
    expect(buildPostDocument(meme).hasWords).toBe(false)
    expect(hashFor(buildPostDocument(meme), 'text')).toBeNull()
    const read = buildPostDocument(meme, { screen: 'WHEN THE WIFI GOES DOWN' })
    expect(read.hasWords).toBe(true)
    expect(hashFor(read, 'text')).toBe(read.textHash)
  })

  it('reads speech from the video stream and text from photos and frames', () => {
    const text = buildPostDocument(feedItem())
    expect(hashFor(text, 'speech')).toBeNull()
    expect(hashFor(text, 'screen')).toBeNull()

    const video = buildPostDocument(
      feedItem({ media: [media('video', '/api/files/twitter/1/video-1?v=2')] }),
    )
    expect(video.speech?.url).toBe('/api/files/twitter/1/video-1?v=2')
    expect(video.screen).toMatchObject({
      images: [],
      video: '/api/files/twitter/1/video-1?v=2',
      videoSeconds: 41,
    })

    const album = buildPostDocument(
      feedItem({
        media: [1, 2, 3, 4, 5].map((n) => media('photo', `/api/files/twitter/1/photo-${n}?v=2`)),
      }),
    )
    expect(album.speech).toBeNull()
    expect(album.screen?.images).toHaveLength(4)
    // The screen hash follows the media, not the words.
    expect(
      hashFor(
        buildPostDocument(
          feedItem({ text: 'other', media: album.screen!.images.map((u) => media('photo', u)) }),
        ),
        'screen',
      ),
    ).toBe(hashFor(album, 'screen'))
  })
})

describe('the queue', () => {
  it('backfills speech and on-screen text once per post, unless switched off', async () => {
    savePost(USER_A, '1')
    savePost(USER_B, '1')
    expect(jobKinds()).toEqual(['text', 'image', 'video', 'speech', 'screen'])
    expect(await enqueueBackfill()).toBe(5)
    expect(await enqueueBackfill()).toBe(0)
    await drain()
    // Done (as "nothing here") with the current extractor: not queued again.
    expect(getExtracted('twitter', '1', 'speech')).toMatchObject({
      status: 'none',
      model: SPEECH_VERSION,
    })
    expect(await enqueueBackfill()).toBe(0)

    savePost(USER_A, '2')
    vi.stubEnv('SEMANTIC_SPEECH', 'off')
    vi.stubEnv('SEMANTIC_SCREEN_TEXT', 'off')
    expect(jobKinds()).toEqual(['text', 'image', 'video'])
    expect(await enqueueBackfill()).toBe(3)
  })

  it('runs cheap work first: words, picture, speech, text on screen, then the video', async () => {
    savePost(USER_A, '1', 'look', 'video')
    await enqueuePosts([{ platform: 'twitter', postId: '1' }], PRIORITY.urgent)
    const order: string[] = []
    for (let job = await nextJob(); job; job = await nextJob()) {
      order.push(job.kind)
      testInstance.db
        .delete(schema.understandingQueue)
        .where(
          and(
            eq(schema.understandingQueue.postId, '1'),
            eq(schema.understandingQueue.kind, job.kind),
          ),
        )
        .run()
    }
    expect(order).toEqual(['text', 'image', 'speech', 'screen', 'video'])
  })
})

describe('the worker', () => {
  it('transcribes a video, indexes the words and re-learns only its text', async () => {
    savePost(USER_A, '1', 'look at her go', 'video')
    savePost(USER_A, '2', 'a quiet post')
    await enqueuePosts(
      [
        { platform: 'twitter', postId: '1' },
        { platform: 'twitter', postId: '2' },
      ],
      PRIORITY.urgent,
      ['text', 'speech', 'screen'],
    )
    await drain()
    expect(transcribeSource).toHaveBeenCalledTimes(1)
    expect(transcribeSource.mock.calls[0][0]).toBe(
      '/kept/api/files/twitter/1/video-1?a=testauthor&v=2',
    )
    expect(readScreenText).toHaveBeenCalledTimes(1)
    expect(readScreenText.mock.calls[0][1]).toEqual({
      source: '/kept/api/files/twitter/1/video-1?a=testauthor&v=2',
      duration: 41,
    })
    expect(getExtracted('twitter', '1', 'speech')).toMatchObject({
      status: 'ok',
      text: CAT,
      language: 'en',
    })
    expect(extractedWords('twitter', '1')).toEqual({ speech: CAT, screen: 'CAT VS CUCUMBER' })
    // The text vector was learned again as each part's words landed; the
    // quiet post (nothing said, nothing on screen) only once.
    const prompts = embedTexts.mock.calls.map((c) => c[0][0])
    expect(prompts.filter((p) => p.includes('look at her go'))).toHaveLength(3)
    expect(prompts.at(-1)).toContain(`Said in the video: ${CAT}\nText on screen: CAT VS CUCUMBER`)
    expect(prompts.filter((p) => p.includes('a quiet post'))).toHaveLength(1)
    expect(ftsBody('1')).toContain('cucumber behind her')
    expect(ftsBody('1')).toContain('CAT VS CUCUMBER')
    expect(ftsBody('2')).not.toContain('Said')

    // A second pass changes nothing and runs nothing.
    await enqueuePosts([{ platform: 'twitter', postId: '1' }], PRIORITY.urgent, [
      'speech',
      'screen',
    ])
    expect(await drain()).toEqual(['speech', 'screen'])
    expect(transcribeSource).toHaveBeenCalledTimes(1)
    expect(embedTexts).toHaveBeenCalledTimes(4)
  })

  it('stores silence as nothing, without re-learning the text', async () => {
    savePost(USER_A, '1', 'look', 'video')
    transcribeSource.mockResolvedValue(null)
    await enqueuePosts([{ platform: 'twitter', postId: '1' }], PRIORITY.urgent, ['speech'])
    expect(await drain()).toEqual(['speech'])
    expect(getExtracted('twitter', '1', 'speech')).toMatchObject({ status: 'none', text: null })
  })

  it('reads a meme’s caption so the meme becomes findable by it', async () => {
    savePost(USER_A, '1', '', 'photo')
    readScreenText.mockResolvedValue('WHEN THE WIFI\nGOES DOWN FOR 5 SECONDS')
    await enqueuePosts([{ platform: 'twitter', postId: '1' }], PRIORITY.urgent, ['text', 'screen'])
    expect(await drain()).toEqual(['text', 'screen', 'text'])
    const [images, video] = readScreenText.mock.calls[0]
    expect(images).toHaveLength(1)
    expect(video).toBeNull()
    expect(fetchImageBytes).toHaveBeenCalledWith('/api/files/twitter/1/photo-1?a=testauthor&v=2')
    const text = testInstance.db
      .select()
      .from(schema.postEmbeddings)
      .where(eq(schema.postEmbeddings.kind, 'text'))
      .all()
    expect(text).toMatchObject([{ status: 'ok' }])
    expect(keywordSearch('wifi goes down', 10).map((h) => h.key)).toEqual(['twitter:1'])
  })

  it('does nothing new while switched off, and treats deleted media as nothing', async () => {
    savePost(USER_A, '1', 'look', 'video')
    vi.stubEnv('SEMANTIC_SPEECH', 'off')
    await enqueuePosts([{ platform: 'twitter', postId: '1' }], PRIORITY.urgent, ['speech'])
    expect(await drain()).toEqual(['speech'])
    expect(transcribeSource).not.toHaveBeenCalled()
    expect(getExtracted('twitter', '1', 'speech')).toBeUndefined()

    vi.unstubAllEnvs()
    soundSource.mockRejectedValueOnce(new MediaGoneError('Its video couldn’t be downloaded'))
    await enqueuePosts([{ platform: 'twitter', postId: '1' }], PRIORITY.urgent, ['speech'])
    await drain()
    expect(getExtracted('twitter', '1', 'speech')).toMatchObject({ status: 'none' })
  })

  it('keeps earlier words when a later run fails, and Retry tries again', async () => {
    savePost(USER_A, '1', 'look', 'video')
    saveExtracted({
      platform: 'twitter',
      postId: '1',
      kind: 'speech',
      contentHash: 'old',
      status: 'ok',
      text: CAT,
    })
    transcribeSource.mockRejectedValue(new Error('Extraction timed out'))
    await enqueuePosts([{ platform: 'twitter', postId: '1' }], PRIORITY.urgent, ['speech'])
    for (let i = 0; i < 3; i++) {
      const job = (await nextJob(new Date(Date.now() + 3 * 60 * 60_000)))!
      await processJob(job)
    }
    expect(getExtracted('twitter', '1', 'speech')).toMatchObject({ status: 'failed', text: CAT })
    expect(extractedWords('twitter', '1').speech).toBe(CAT)
    expect(await nextJob(new Date(Date.now() + 3 * 60 * 60_000))).toBeUndefined()

    expect(await retryFailed(USER_A)).toBe(1)
    transcribeSource.mockResolvedValue({
      text: 'a new transcript of the cat video',
      language: 'en',
    })
    await drain()
    expect(extractedWords('twitter', '1').speech).toBe('a new transcript of the cat video')
    expect(await retryFailed(USER_B)).toBe(0)
  })

  it('listens again once a sound is kept, after giving up on it before', async () => {
    savePost(USER_A, '1', 'a track', 'video')
    transcribeSource.mockRejectedValue(new Error('Not downloaded yet'))
    await enqueuePosts([{ platform: 'twitter', postId: '1' }], PRIORITY.urgent, ['speech'])
    for (let i = 0; i < 3; i++)
      await processJob((await nextJob(new Date(Date.now() + 3 * 60 * 60_000)))!)
    expect(getExtracted('twitter', '1', 'speech')).toMatchObject({ status: 'failed' })
    // The download finishes (a sound-only post keeps audio-1) and saving notes it again.
    keptSoundFile.mockResolvedValue('/media/twitter/1/audio-1.m4a')
    transcribeSource.mockResolvedValue({
      text: 'the lyrics of the whole song here',
      language: 'en',
    })
    await enqueuePosts([{ platform: 'twitter', postId: '1' }], PRIORITY.sync, ['speech'])
    await drain()
    expect(extractedWords('twitter', '1').speech).toBe('the lyrics of the whole song here')
  })

  it('forgets the words when nobody has the post saved any more', async () => {
    savePost(USER_A, '1', 'look', 'video')
    savePost(USER_B, '1', 'look', 'video')
    saveExtracted({
      platform: 'twitter',
      postId: '1',
      kind: 'speech',
      contentHash: 'h',
      status: 'ok',
      text: CAT,
    })
    testInstance.db.delete(schema.bookmarks).where(eq(schema.bookmarks.userId, USER_A)).run()
    expect(extractedWords('twitter', '1').speech).toBe(CAT)
    testInstance.db.delete(schema.bookmarks).run()
    expect(extractedWords('twitter', '1').speech).toBeNull()
  })
})

describe('search', () => {
  it('finds a video by what is said in it and says so', async () => {
    savePost(USER_A, '1', 'look at her go', 'video')
    savePost(USER_A, '2', 'cucumber salad recipe')
    await enqueuePosts(
      [
        { platform: 'twitter', postId: '1' },
        { platform: 'twitter', postId: '2' },
      ],
      PRIORITY.urgent,
      ['text', 'speech'],
    )
    await drain()
    const result = await searchPosts(
      {
        q: 'the cat that screams at the cucumber',
        userId: USER_A,
        scope: 'mine',
        type: 'all',
        wordsOnly: false,
        limit: 10,
        offset: 0,
      },
      { embed: async () => Promise.reject(new Error('keywords only')) },
    )
    expect(result.hits[0]).toMatchObject({ key: 'twitter:1', matched: ['speech', 'keywords'] })
    // The salad post matched on its own word only.
    expect(result.hits.find((h) => h.key === 'twitter:2')?.matched).toEqual(['keywords'])
  })

  it('labels speech and on-screen matches, leading only when the media holds the words', () => {
    const words = new Map([
      ['twitter:1', { speech: CAT, screen: null }],
      ['twitter:2', { speech: null, screen: 'WHEN THE WIFI GOES DOWN' }],
      ['twitter:3', { speech: 'my cucumber review', screen: null }],
    ])
    const bodies = new Map([
      ['twitter:1', `look at her go\n${CAT}`],
      ['twitter:2', 'WHEN THE WIFI GOES DOWN'],
      ['twitter:3', 'cucumber cat\nmy cucumber review'],
    ])
    const lookup = { words: () => words, bodies: () => bodies }
    const hits = labelExtractedMatches(
      [
        { key: 'twitter:1', matched: ['keywords'] as const },
        { key: 'twitter:2', matched: ['words'] as const },
        { key: 'twitter:3', matched: ['words', 'keywords'] as const },
        { key: 'twitter:4', matched: ['picture', 'words'] as const },
      ].map((h) => ({ ...h, matched: [...h.matched] })),
      'cat cucumber ',
      lookup,
    )
    expect(hits.map((h) => h.matched)).toEqual([
      ['speech', 'keywords'],
      // A wordless meme that matched on meaning: it matched on its caption.
      ['screen', 'words'],
      // Its own words have both query words; its speech only one: named, not leading.
      ['words', 'keywords', 'speech'],
      ['picture', 'words'],
    ])
  })
})
