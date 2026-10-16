import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from '../api/setup'

let testInstance: TestDbInstance
let mockUserId: string | null = USER_A

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction: <R>(fn: () => R): R => testInstance.sqlite.transaction(fn)(),
}))

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(() => Promise.resolve(mockUserId)),
  getSession: vi.fn(() =>
    Promise.resolve(mockUserId ? { userId: mockUserId, username: 'tester' } : null),
  ),
}))

const embedQuery = vi.fn(async (_prompt: string) => QUERY)
vi.mock('@/lib/semantic/supervisor', () => ({
  embedQuery: (prompt: string) => embedQuery(prompt),
  wakeJobs: () => {},
  jobActivity: () => null,
  startSemanticProcesses: () => {},
}))

import { saveEmbedding } from '@/lib/semantic/store'
import { indexPostText, ftsQuery, keywordSearch } from '@/lib/semantic/keywords'
import { searchPosts, similarPosts, fuse, type SearchRequest } from '@/lib/semantic/search'
import { loadSearchItems } from '@/lib/semantic/items'
import { stillLearning } from '@/lib/semantic/status'
import { blend, describe as describePost, rerank } from '@/lib/semantic/rerank'
import { __resetVectorIndex } from '@/lib/semantic/vector-index'
import { __resetRateLimitState } from '@/lib/rate-limit'
import type { UnderstandingKind } from '@/lib/semantic/config'
import type { FeedItemResponse } from '@/lib/feed/build-item'

const USER_C = 'user-c-banned'

/** Unit vector along a mix of the first few dimensions (all inside the index's 256). */
function vec(weights: Record<number, number>): Float32Array {
  const v = new Float32Array(768)
  for (const [i, w] of Object.entries(weights)) v[Number(i)] = w
  let norm = 0
  for (const x of v) norm += x * x
  norm = Math.sqrt(norm)
  return v.map((x) => x / norm)
}

const QUERY = vec({ 0: 1 })
const CLOSE = vec({ 0: 0.95, 1: 0.3 })
const FAR = (i: number) => vec({ [2 + i]: 1, 0: 0.05 })

function save(userId: string, id: string, overrides: Partial<schema.NewBookmark> = {}) {
  testInstance.db
    .insert(schema.bookmarks)
    .values(createTestBookmark(userId, id, overrides))
    .run()
}

async function understood(id: string, kind: UnderstandingKind, vector: Float32Array) {
  await saveEmbedding({
    platform: 'twitter',
    postId: id,
    kind,
    contentHash: `${id}-${kind}`,
    status: 'ok',
    vector,
  })
}

function request(overrides: Partial<SearchRequest> = {}): SearchRequest {
  return {
    q: 'squirrels ',
    scope: 'mine',
    type: 'all',
    wordsOnly: false,
    userId: USER_A,
    limit: 20,
    offset: 0,
    ...overrides,
  }
}

/** Background posts so similarity spread is realistic. */
async function background(userId: string, count = 8) {
  for (let i = 0; i < count; i++) {
    save(userId, `bg${userId}${i}`)
    await understood(`bg${userId}${i}`, 'text', FAR(i))
  }
}

beforeEach(() => {
  testInstance = createTestDb()
  mockUserId = USER_A
  __resetVectorIndex()
  __resetRateLimitState()
  vi.clearAllMocks()
  embedQuery.mockImplementation(async () => QUERY)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('keywords', () => {
  it('quotes every token so input can never use FTS syntax', () => {
    expect(ftsQuery('frog mugs ')).toBe('"frog" OR "mugs"')
    expect(ftsQuery('frog mu')).toBe('"frog" OR "mu"*')
    expect(ftsQuery('foo" OR bar* NEAR(')).toBe('"foo" OR "or" OR "bar" OR "near"*')
    expect(ftsQuery('  ...  ')).toBeNull()
  })

  it('matches post words, and only the viewer saves when asked', () => {
    save(USER_A, '1')
    save(USER_B, '2')
    indexPostText('twitter', '1', 'squirrels eating caramel wafers')
    indexPostText('twitter', '2', 'more squirrels, different saver')
    expect(
      keywordSearch('squirrels ', 10)
        .map((h) => h.key)
        .sort(),
    ).toEqual(['twitter:1', 'twitter:2'])
    expect(keywordSearch('squirrels ', 10, USER_A).map((h) => h.key)).toEqual(['twitter:1'])
    indexPostText('twitter', '1', 'replaced text')
    expect(keywordSearch('caramel ', 10)).toEqual([])
  })
})

describe('fuse', () => {
  it('standardises each list and lets the best signal lead', () => {
    const ranked = fuse(
      {
        words: { hits: [{ key: 'a', score: 0.7 }], mean: 0.6, std: 0.02 }, // z = 5
        picture: { hits: [{ key: 'b', score: 0.8 }], mean: 0.6, std: 0.1 }, // z = 2 × 0.9
      },
      [{ key: 'b', score: 10 }],
    )
    expect(ranked.map((r) => r.key)).toEqual(['a', 'b'])
    expect(ranked[0].matched).toEqual(['words'])
    expect(ranked[1].matched).toEqual(['keywords'])
  })
})

describe('searchPosts', () => {
  it('searches only the viewer saves in mine', async () => {
    await background(USER_A)
    save(USER_A, 'mine')
    save(USER_B, 'theirs')
    await understood('mine', 'text', CLOSE)
    await understood('theirs', 'text', CLOSE)

    const result = await searchPosts(request())
    expect(result.understood).toBe(true)
    expect(result.close).toBe(true)
    expect(result.hits[0].key).toBe('twitter:mine')
    expect(result.hits.map((h) => h.key)).not.toContain('twitter:theirs')
  })

  it('searches everyone but hides banned-only and moderated posts', async () => {
    await background(USER_A)
    save(USER_B, 'public')
    save(USER_C, 'banned-only')
    save(USER_B, 'hidden')
    for (const id of ['public', 'banned-only', 'hidden']) await understood(id, 'text', CLOSE)
    testInstance.db
      .insert(schema.userBans)
      .values({ userId: USER_C, createdAt: new Date().toISOString(), createdBy: 'admin' })
      .run()
    testInstance.db
      .insert(schema.moderatedPosts)
      .values({
        platform: 'twitter',
        bookmarkId: 'hidden',
        hidden: 1,
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
      })
      .run()

    const keys = (await searchPosts(request({ scope: 'everyone' }))).hits.map((h) => h.key)
    expect(keys).toContain('twitter:public')
    expect(keys).not.toContain('twitter:banned-only')
    expect(keys).not.toContain('twitter:hidden')
  })

  it('matches pictures unless asked for words only', async () => {
    await background(USER_A)
    save(USER_A, 'pic')
    await understood('pic', 'text', FAR(7))
    await understood('pic', 'image', CLOSE)
    for (let i = 0; i < 6; i++) {
      save(USER_A, `img${i}`)
      await understood(`img${i}`, 'image', FAR(i))
    }

    const withPictures = await searchPosts(request())
    expect(withPictures.hits[0]).toMatchObject({ key: 'twitter:pic', matched: ['picture'] })
    const wordsOnly = await searchPosts(request({ wordsOnly: true }))
    expect(wordsOnly.hits.map((h) => h.key)).not.toContain('twitter:pic')
  })

  it('filters by content type', async () => {
    await background(USER_A)
    save(USER_A, 'clip')
    save(USER_A, 'words')
    await understood('clip', 'text', CLOSE)
    await understood('words', 'text', CLOSE)
    testInstance.db
      .insert(schema.bookmarkMedia)
      .values({
        id: 'clip_m1',
        userId: USER_A,
        platform: 'twitter',
        bookmarkId: 'clip',
        mediaType: 'video',
        originalUrl: 'https://video.twimg.com/a.mp4',
      })
      .run()

    const videos = await searchPosts(request({ type: 'videos' }))
    expect(videos.hits.map((h) => h.key)).toEqual(['twitter:clip'])
    const text = await searchPosts(request({ type: 'text' }))
    expect(text.hits.map((h) => h.key)).toContain('twitter:words')
    expect(text.hits.map((h) => h.key)).not.toContain('twitter:clip')
  })

  it('falls back to keywords when meaning is unavailable', async () => {
    save(USER_A, 'kw')
    indexPostText('twitter', 'kw', 'squirrels eating caramel wafers')
    const result = await searchPosts(request(), {
      embed: () => Promise.reject(new Error('down')),
    })
    expect(result.understood).toBe(false)
    expect(result.hits.map((h) => h.key)).toEqual(['twitter:kw'])
  })
})

describe('similarPosts', () => {
  it('finds posts like this one, never itself, within the scope', async () => {
    await background(USER_A)
    save(USER_A, 'seed')
    save(USER_A, 'twin')
    save(USER_B, 'their-twin')
    for (const id of ['seed', 'twin', 'their-twin']) await understood(id, 'text', CLOSE)
    const base = {
      platform: 'twitter',
      postId: 'seed',
      type: 'all' as const,
      userId: USER_A,
      limit: 10,
    }

    const mine = (await similarPosts({ ...base, scope: 'mine' })).hits.map((h) => h.key)
    expect(mine[0]).toBe('twitter:twin')
    expect(mine).not.toContain('twitter:seed')
    expect(mine).not.toContain('twitter:their-twin')
    const everyone = (await similarPosts({ ...base, scope: 'everyone' })).hits.map((h) => h.key)
    expect(everyone).toContain('twitter:their-twin')
  })

  it('is empty for a post that is not understood yet', async () => {
    save(USER_A, 'new')
    const result = await similarPosts({
      platform: 'twitter',
      postId: 'new',
      scope: 'mine',
      type: 'all',
      userId: USER_A,
      limit: 10,
    })
    expect(result).toMatchObject({ hits: [], understood: false })
  })
})

describe('stillLearning', () => {
  it('flags posts whose picture or video is not understood yet', async () => {
    for (const id of ['vid', 'pic', 'words']) save(USER_A, id)
    testInstance.db
      .insert(schema.bookmarkMedia)
      .values([
        {
          id: 'vid_m1',
          userId: USER_A,
          platform: 'twitter',
          bookmarkId: 'vid',
          mediaType: 'video',
          originalUrl: 'x',
        },
        {
          id: 'pic_m1',
          userId: USER_A,
          platform: 'twitter',
          bookmarkId: 'pic',
          mediaType: 'photo',
          originalUrl: 'x',
        },
      ])
      .run()
    await understood('vid', 'image', CLOSE) // poster done, video not yet
    await understood('pic', 'image', CLOSE)
    const learning = await stillLearning(['twitter:vid', 'twitter:pic', 'twitter:words'])
    expect([...learning]).toEqual(['twitter:vid'])
  })
})

describe('loadSearchItems', () => {
  it('never reveals anything about another saver', async () => {
    const createdAt = '2026-01-02T03:04:05.000Z'
    save(USER_B, 'theirs', { createdAt, summary: 'private summary' })
    save(USER_A, 'mine')
    testInstance.db
      .insert(schema.bookmarkTags)
      .values([
        { userId: USER_B, platform: 'twitter', bookmarkId: 'theirs', tag: 'secret' },
        { userId: USER_A, platform: 'twitter', bookmarkId: 'mine', tag: 'mytag' },
      ])
      .run()
    testInstance.db
      .insert(schema.bookmarkLinks)
      .values({
        userId: USER_B,
        platform: 'twitter',
        bookmarkId: 'theirs',
        expandedUrl: 'https://example.com/post',
      })
      .run()

    const items = await loadSearchItems(
      [
        {
          key: 'twitter:theirs',
          platform: 'twitter',
          postId: 'theirs',
          score: 3,
          matched: ['words'],
        },
        { key: 'twitter:mine', platform: 'twitter', postId: 'mine', score: 2, matched: ['words'] },
      ],
      USER_A,
    )
    const [theirs, mine] = items
    expect(theirs.saved).toBe(false)
    expect(theirs.post).toMatchObject({
      tags: [],
      isArchived: false,
      summary: null,
      processedAt: createdAt,
    })
    expect(theirs.post.links?.[0]).toMatchObject({ userId: '', id: 0 })
    expect(JSON.stringify(theirs)).not.toContain(USER_B)
    expect(JSON.stringify(theirs)).not.toContain('secret')
    expect(mine).toMatchObject({ saved: true, post: { tags: ['mytag'] } })
  })
})

describe('rerank', () => {
  const item = (id: string, text: string) =>
    ({
      id,
      platform: 'twitter',
      text,
      author: 'a',
      authorName: 'A',
      media: [],
      links: [],
      tags: ['private-tag'],
    }) as unknown as FeedItemResponse

  it('blends Jev relevance with the fused order, protecting visual matches', () => {
    const cands = [
      { key: 'a', item: item('a', 'x'), visual: true },
      { key: 'b', item: item('b', 'y'), visual: false },
      { key: 'c', item: item('c', 'z'), visual: false },
    ]
    const order = blend(
      cands,
      new Map([
        ['a', 1],
        ['b', 0],
        ['c', 4],
      ]),
    )
    expect(order.map((c) => c.key)).toEqual(['c', 'a', 'b'])
  })

  it('sends only the query and public words, well-formed', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key')
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { questions: Record<string, unknown> }
      return new Response(
        JSON.stringify({
          answers: Object.fromEntries(
            Object.keys(body.questions).map((id, i) => [id, { score: i * 3 }]),
          ),
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const broken = 'x'.repeat(595) + '😀😀'
    const order = await rerank('frogs \uD83D', [
      { key: 'a', item: item('a', broken), visual: false },
      { key: 'b', item: item('b', 'frog mug'), visual: false },
    ])
    expect(order?.map((c) => c.key)).toEqual(['b', 'a'])
    const sent = String(fetchMock.mock.calls[0][1].body)
    expect(sent).not.toContain('private-tag')
    expect(sent.isWellFormed()).toBe(true)
    expect(describePost(item('a', broken)).isWellFormed()).toBe(true)
  })

  it('returns null without a key or when Jev fails', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', '')
    const cands = [
      { key: 'a', item: item('a', 'x'), visual: false },
      { key: 'b', item: item('b', 'y'), visual: false },
    ]
    expect(await rerank('q', cands)).toBeNull()
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    )
    expect(await rerank('another q', cands)).toBeNull()
  })
})

describe('GET /api/search', () => {
  async function call(query: string) {
    const { GET } = await import('@/app/api/search/route')
    return GET(new NextRequest(`http://localhost/api/search?${query}`), undefined as never)
  }

  it('requires sign-in and validates its parameters', async () => {
    mockUserId = null
    expect((await call('q=frog')).status).toBe(401)
    mockUserId = USER_A
    expect((await call('q=frog&scope=all-users')).status).toBe(400)
    expect((await call('q=frog&type=gifs')).status).toBe(400)
    const empty = await call('q=')
    expect(await empty.json()).toMatchObject({ items: [], total: 0 })
    expect(empty.headers.get('Cache-Control')).toBe('no-store')
  })

  it('returns feed-shaped posts with what matched', async () => {
    await background(USER_A)
    save(USER_A, 'mine', { text: 'squirrels eating caramel wafers' })
    await understood('mine', 'text', CLOSE)
    const response = await call('q=squirrels&limit=3')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.understood).toBe(true)
    expect(body.items[0]).toMatchObject({
      saved: true,
      matched: ['words'],
      post: { id: 'mine', text: 'squirrels eating caramel wafers' },
    })
  })
})
