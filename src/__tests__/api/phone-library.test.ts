import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestBookmark, createTestDb, type TestDbInstance } from './setup'

/**
 * The phone app's player and search: /api/app/saves and /api/app/search,
 * signed with a phone key and only ever about that key's own saves.
 */

let testInstance: TestDbInstance
let sessionUser: string | null = 'user-1'

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))
vi.mock('@/lib/auth/session', () => ({ getCurrentUserId: vi.fn(async () => sessionUser) }))
vi.mock('@/lib/sentry', () => ({ captureException: vi.fn(), metrics: {} }))

const findPosts = vi.fn()
vi.mock('@/lib/semantic/find', () => ({ findPosts: (...args: unknown[]) => findPosts(...args) }))

const BASE = 'https://adhx.test'
const get = (path: string, key?: string) =>
  new NextRequest(`${BASE}${path}`, key ? { headers: { authorization: `Bearer ${key}` } } : {})

/** Pair a phone for `user` and return its key. */
async function phoneKey(user: string): Promise<string> {
  sessionUser = user
  const { POST: pairing } = await import('@/app/api/app/pairing/route')
  const { code } = await (
    await pairing(new NextRequest(`${BASE}/api/app/pairing`, { method: 'POST' }))
  ).json()
  const { POST: pair } = await import('@/app/api/app/pair/route')
  const res = await pair(
    new NextRequest(`${BASE}/api/app/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name: 'Phone' }),
    }),
  )
  sessionUser = null
  return (await res.json()).key
}

function saveFor(
  user: string,
  id: string,
  at: string,
  overrides: Partial<schema.NewBookmark> = {},
  media: { type: string; n?: number }[] = [],
) {
  testInstance.db
    .insert(schema.bookmarks)
    .values(createTestBookmark(user, id, { processedAt: at, ...overrides }))
    .run()
  media.forEach((m, i) =>
    testInstance.db
      .insert(schema.bookmarkMedia)
      .values({
        id: `${id}_${i}`,
        userId: user,
        platform: overrides.platform ?? 'twitter',
        bookmarkId: id,
        mediaType: m.type,
        originalUrl: `https://example.com/${id}/${i}`,
        width: 720,
        height: 1280,
      })
      .run(),
  )
}

async function saves(query: string, key?: string) {
  const { GET } = await import('@/app/api/app/saves/route')
  const res = await GET(get(`/api/app/saves${query}`, key))
  return { status: res.status, body: await res.json() }
}

async function search(query: string, key?: string) {
  const { GET } = await import('@/app/api/app/search/route')
  const res = await GET(get(`/api/app/search${query}`, key))
  return { status: res.status, body: await res.json(), res }
}

beforeEach(async () => {
  testInstance = createTestDb()
  sessionUser = null
  vi.clearAllMocks()
  const { __resetRateLimitState } = await import('@/lib/rate-limit')
  __resetRateLimitState()
  await testInstance.db.insert(schema.users).values([
    { id: 'user-1', username: 'ana' },
    { id: 'user-2', username: 'ben' },
  ])
})

afterEach(() => testInstance.close())

describe('GET /api/app/saves', () => {
  it('leaves a save out until its copy is kept, and says how many are on their way', async () => {
    saveFor('user-1', '100', '2026-10-01T00:00:00.000Z', {}, [{ type: 'video' }])
    saveFor('user-1', '200', '2026-10-02T00:00:00.000Z', {}, [{ type: 'video' }])
    saveFor('user-1', '300', '2026-10-03T00:00:00.000Z', { text: 'just words' })
    const job = (id: string, status: string) =>
      testInstance.db
        .insert(schema.keepJobs)
        .values({ platform: 'twitter', postId: id, status, updatedAt: new Date().toISOString() })
        .onConflictDoUpdate({
          target: [schema.keepJobs.platform, schema.keepJobs.postId],
          set: { status },
        })
        .run()
    job('100', 'done')
    job('200', 'running')
    const key = await phoneKey('user-1')

    const now = await saves('', key)
    expect(now.body.items.map((i: { id: string }) => i.id)).toEqual(['300', '100'])
    expect(now.body).toMatchObject({ total: 2, preparing: 1 })

    job('200', 'done')
    const later = await saves('', key)
    expect(later.body.items.map((i: { id: string }) => i.id)).toEqual(['300', '200', '100'])
    expect(later.body.preparing).toBe(0)
  })

  it('lists your saves newest first, ready to play, and pages through them', async () => {
    saveFor('user-1', '100', '2026-10-01T00:00:00.000Z', {}, [{ type: 'video' }])
    saveFor('user-1', '200', '2026-10-02T00:00:00.000Z', {}, [{ type: 'photo' }, { type: 'photo' }])
    saveFor('user-1', '300', '2026-10-03T00:00:00.000Z', { text: 'just words' })
    saveFor(
      'user-1',
      'abc',
      '2026-10-04T00:00:00.000Z',
      { platform: 'soundcloud', author: 'forss', tweetUrl: 'https://soundcloud.com/forss/x' },
      [{ type: 'video' }],
    )
    const key = await phoneKey('user-1')

    const first = await saves('?limit=2', key)
    expect(first.status).toBe(200)
    expect(first.body.total).toBe(4)
    expect(first.body.nextOffset).toBe(2)
    expect(first.body.items.map((i: { id: string }) => i.id)).toEqual(['abc', '300'])
    const [sound, words] = first.body.items
    expect(sound.kind).toBe('audio')
    expect(words).toMatchObject({ kind: 'text', text: 'just words', media: [] })

    const second = await saves('?offset=2&limit=2', key)
    expect(second.body.nextOffset).toBeNull()
    const [album, video] = second.body.items
    expect(album.kind).toBe('photo')
    expect(album.media.map((m: { url: string }) => m.url)).toEqual([
      '/api/files/twitter/200/photo-1?a=testauthor',
      '/api/files/twitter/200/photo-2?a=testauthor',
    ])
    expect(video).toMatchObject({
      platform: 'twitter',
      id: '100',
      kind: 'video',
      author: { handle: 'testauthor', name: 'Test Author' },
      sourceUrl: 'https://x.com/testauthor/status/100',
      openPath: '/testauthor/status/100',
      media: [
        {
          kind: 'video',
          url: '/api/files/twitter/100/video-1?a=testauthor',
          posterUrl: '/api/files/twitter/100/poster?a=testauthor',
          width: 720,
          height: 1280,
        },
      ],
    })
    expect(video.match).toBeUndefined()
  })

  it('leaves out archived saves, but opens one by id', async () => {
    saveFor('user-1', '100', '2026-10-01T00:00:00.000Z')
    saveFor('user-1', '200', '2026-10-02T00:00:00.000Z')
    testInstance.db
      .insert(schema.archivedPosts)
      .values({
        userId: 'user-1',
        bookmarkId: '200',
        platform: 'twitter',
        archivedAt: new Date().toISOString(),
      })
      .run()
    const key = await phoneKey('user-1')
    const list = await saves('', key)
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual(['100'])
    const one = await saves('?platform=twitter&id=200', key)
    expect(one.status).toBe(200)
    expect(one.body.item.id).toBe('200')
  })

  it('only ever shows the key owner’s saves', async () => {
    saveFor('user-1', '100', '2026-10-01T00:00:00.000Z')
    saveFor('user-2', '900', '2026-10-01T00:00:00.000Z')
    const ben = await phoneKey('user-2')
    const list = await saves('', ben)
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual(['900'])
    const theirs = await saves('?platform=twitter&id=100', ben)
    expect(theirs.status).toBe(404)
    expect(theirs.body.code).toBe('not_saved')
  })

  it('needs a phone key: not a session, not a Claude key', async () => {
    sessionUser = 'user-1'
    expect((await saves('')).status).toBe(401)
    const { POST } = await import('@/app/api/access-keys/route')
    const searchKey = (
      await (
        await POST(
          new NextRequest(`${BASE}/api/access-keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          }),
        )
      ).json()
    ).key
    sessionUser = null
    const res = await saves('', searchKey)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('bad_key')
  })
})

describe('GET /api/app/search', () => {
  const found = (id: string) => ({
    post: {
      id,
      platform: 'reddit',
      author: 'videos',
      authorName: 'u/someone',
      authorProfileImageUrl: null,
      text: 'That small heart attack.',
      tweetUrl: `https://www.reddit.com/r/videos/comments/${id}/`,
      createdAt: null,
      processedAt: '2026-10-01T00:00:00.000Z',
      category: 'video',
      isXArticle: false,
      articlePreview: null,
      media: [
        {
          id: `${id}_0`,
          mediaType: 'video',
          width: 352,
          height: 640,
          durationMs: 11_000,
          altText: null,
          url: `/api/files/reddit/${id}/video-1`,
          thumbnailUrl: `/api/files/reddit/${id}/poster`,
          shareUrl: '',
          originalUrl: null,
        },
      ],
    },
    saved: true,
    matched: ['video'],
    strength: 'good',
  })

  it('searches the key owner’s saves by meaning and says how it matched', async () => {
    findPosts.mockResolvedValue({
      items: [found('6rrwyj')],
      total: 1,
      understood: true,
      close: true,
      refined: true,
      nextOffset: null,
    })
    const key = await phoneKey('user-2')
    const { status, body } = await search('?q=a%20baby%20and%20a%20hamster', key)
    expect(status).toBe(200)
    expect(findPosts).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'a baby and a hamster',
        scope: 'mine',
        userId: 'user-2',
        offset: 0,
        refine: true,
      }),
    )
    expect(body).toMatchObject({ total: 1, understood: true, close: true, nextOffset: null })
    expect(body.items[0]).toMatchObject({
      platform: 'reddit',
      id: '6rrwyj',
      kind: 'video',
      media: [{ kind: 'video', url: '/api/files/reddit/6rrwyj/video-1' }],
      match: { strength: 'good', on: ['video'] },
    })
  })

  it('asks for words, a known type, and a phone key', async () => {
    const key = await phoneKey('user-1')
    expect((await search('?q=%20', key)).body.code).toBe('no_query')
    expect((await search('?q=frog&type=gifs', key)).body.code).toBe('bad_type')
    expect((await search('?q=frog')).status).toBe(401)
    expect(findPosts).not.toHaveBeenCalled()
  })

  it('slows down a phone that searches too often', async () => {
    findPosts.mockResolvedValue({
      items: [],
      total: 0,
      understood: true,
      close: false,
      refined: false,
      nextOffset: null,
    })
    const key = await phoneKey('user-1')
    for (let i = 0; i < 120; i++) await search(`?q=frog${i}`, key)
    const { status, body, res } = await search('?q=frog', key)
    expect(status).toBe(429)
    expect(body.code).toBe('busy')
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })
})
