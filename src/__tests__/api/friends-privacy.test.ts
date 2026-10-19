import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, type TestDbInstance } from './setup'

/**
 * Named to friends, never to strangers (docs/specs/friends-feed.md).
 *
 * Ana and Ben are members. Ben keeps one post "just for me". Ana must never
 * see it, count it or learn Ben saved it — signed in or out — and nothing a
 * signed-out caller gets carries anyone's name.
 */

let testInstance: TestDbInstance
let viewer: string | null = null

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction: <R>(fn: () => R): R => testInstance.sqlite.transaction(fn)(),
}))
vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(async () => viewer),
  getSession: vi.fn(async () => (viewer ? { userId: viewer, username: 'x' } : null)),
}))
vi.mock('@/lib/sentry', () => ({
  metrics: new Proxy({}, { get: () => vi.fn() }),
  captureException: vi.fn(),
}))
const QUERY = unit({ 0: 1 })
vi.mock('@/lib/semantic/supervisor', () => ({
  embedQuery: async () => QUERY,
  wakeJobs: () => {},
  jobActivity: () => null,
  startSemanticProcesses: () => {},
}))

import { saveEmbedding } from '@/lib/semantic/store'
import { __resetVectorIndex, __setBackgroundPrior } from '@/lib/semantic/vector-index'
import { __resetRateLimitState } from '@/lib/rate-limit'
import { recordActivity, recordPreviewPulse } from '@/lib/activity/record'
import { getTrendingItems } from '@/lib/trending/query'

const ANA = 'u_ana'
const BEN = 'u_ben'

function unit(weights: Record<number, number>): Float32Array {
  const v = new Float32Array(768)
  for (const [i, w] of Object.entries(weights)) v[Number(i)] = w
  const n = Math.hypot(...v)
  return v.map((x) => x / n)
}

function save(userId: string, id: string, extra: Partial<schema.NewBookmark> = {}) {
  testInstance.db
    .insert(schema.bookmarks)
    .values(createTestBookmark(userId, id, { text: `frog post ${id}`, ...extra }))
    .run()
}

async function understood(id: string, vector: Float32Array) {
  await saveEmbedding({
    platform: 'twitter',
    postId: id,
    kind: 'text',
    contentHash: id,
    status: 'ok',
    vector,
  })
}

type Item = { saved: boolean; post: { id: string; savers?: unknown; isPrivate?: unknown } }

async function search(query: string): Promise<{ status: number; items: Item[] }> {
  const { GET } = await import('@/app/api/search/route')
  const res = await GET(new NextRequest(`http://localhost/api/search?${query}`), undefined as never)
  const body = res.status === 200 ? await res.json() : { items: [] }
  return { status: res.status, items: body.items }
}

async function similar(query: string): Promise<{ status: number; items: Item[] }> {
  const { GET } = await import('@/app/api/search/similar/route')
  const res = await GET(new NextRequest(`http://localhost/api/search/similar?${query}`))
  const body = res.status === 200 ? await res.json() : { items: [] }
  return { status: res.status, items: body.items }
}

async function setPrivate(id: string, value: unknown, platform = 'twitter') {
  const { PATCH } = await import('@/app/api/bookmarks/[id]/private/route')
  const res = await PATCH(
    new NextRequest(`http://localhost/api/bookmarks/${id}/private`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, private: value }),
    }),
    { params: Promise.resolve({ id }) },
  )
  return { status: res.status, body: await res.json() }
}

const ids = (items: Item[]) => items.map((i) => i.post.id).sort()

beforeEach(async () => {
  testInstance = createTestDb()
  viewer = null
  __resetVectorIndex()
  __setBackgroundPrior({ mean: 0.05, std: 0.01 })
  __resetRateLimitState()
  testInstance.db
    .insert(schema.users)
    .values([
      { id: ANA, username: 'ana', displayName: 'Ana' },
      { id: BEN, username: 'ben', displayName: 'Ben' },
    ] as never)
    .run()
  // Background posts so similarity spread is realistic.
  for (let i = 0; i < 8; i++) {
    save(ANA, `bg${i}`, { text: `unrelated ${i}` })
    await understood(`bg${i}`, unit({ [2 + i]: 1, 0: 0.05 }))
  }
  save(ANA, 'shared', { processedAt: '2026-10-01T10:00:00.000Z' })
  save(BEN, 'shared', { processedAt: '2026-10-02T10:00:00.000Z' })
  save(BEN, 'secret', { isPrivate: true })
  save(ANA, 'mineprivate', { isPrivate: true })
  save(BEN, 'public2')
  await understood('shared', unit({ 0: 1, 1: 0.2 }))
  await understood('secret', unit({ 0: 1, 1: 0.25 }))
  await understood('mineprivate', unit({ 0: 1, 1: 0.3 }))
  await understood('public2', unit({ 0: 1, 1: 0.35 }))
})

afterEach(() => testInstance.close())

describe('search across everyone’s saves', () => {
  it('names members on Everyone results and never shows Ben’s private save to Ana', async () => {
    viewer = ANA
    const { status, items } = await search('q=frog&scope=everyone')
    expect(status).toBe(200)
    expect(ids(items)).toEqual(['mineprivate', 'public2', 'shared'])
    const shared = items.find((i) => i.post.id === 'shared')!
    expect(shared.post.savers).toEqual([
      expect.objectContaining({ username: 'ben', name: 'Ben', isYou: false }),
      expect.objectContaining({ username: 'ana', name: 'Ana', isYou: true }),
    ])
    expect(shared.post.isPrivate).toBe(false)
    const mine = items.find((i) => i.post.id === 'mineprivate')!
    expect(mine.post.isPrivate).toBe(true)
    expect(mine.post.savers).toEqual([expect.objectContaining({ username: 'ana', isYou: true })])
  })

  it('lets Ben find his own private save, marked private', async () => {
    viewer = BEN
    const { items } = await search('q=frog&scope=mine')
    const secret = items.find((i) => i.post.id === 'secret')!
    expect(secret.post.isPrivate).toBe(true)
    expect(ids(items)).not.toContain('mineprivate')
  })

  it('never lists Ben in savers for Ana once he makes his save private', async () => {
    viewer = BEN
    expect(await setPrivate('shared', true)).toEqual({ status: 200, body: { private: true } })
    viewer = ANA
    const { items } = await search('q=frog&scope=everyone')
    const shared = items.find((i) => i.post.id === 'shared')!
    expect(JSON.stringify(shared)).not.toContain('ben')
  })
})

describe('similar posts', () => {
  it('signed out: no private saves and no names', async () => {
    const { status, items } = await similar('platform=twitter&id=shared&scope=everyone')
    expect(status).toBe(200)
    expect(ids(items)).toEqual(['public2'])
    for (const item of items) {
      expect(item.post.savers).toBeUndefined()
      expect(item.post.isPrivate).toBeUndefined()
    }
    expect(JSON.stringify(items)).not.toMatch(/"(ana|ben)"/)
  })

  it('signed out: a private-only post is not even "understood"', async () => {
    const { GET } = await import('@/app/api/search/similar/route')
    const res = await GET(
      new NextRequest(
        'http://localhost/api/search/similar?platform=twitter&id=secret&scope=everyone',
      ),
    )
    expect(await res.json()).toMatchObject({ items: [], understood: false })
  })

  it('signed in: Ana gets names, but never Ben’s private save', async () => {
    viewer = ANA
    const { items } = await similar('platform=twitter&id=shared&scope=everyone')
    expect(ids(items)).toEqual(['mineprivate', 'public2'])
    const pub = items.find((i) => i.post.id === 'public2')!
    expect(pub.post.savers).toEqual([expect.objectContaining({ username: 'ben', isYou: false })])
  })
})

describe('PATCH /api/bookmarks/[id]/private', () => {
  it('needs sign-in, a boolean and your own save', async () => {
    expect((await setPrivate('shared', true)).status).toBe(401)
    viewer = ANA
    expect((await setPrivate('shared', 'yes')).status).toBe(400)
    expect((await setPrivate('secret', true)).status).toBe(404) // Ben's, not Ana's
    expect((await setPrivate('shared', true, 'tiktok')).status).toBe(404)
    expect(await setPrivate('shared', true)).toEqual({ status: 200, body: { private: true } })
    expect(await setPrivate('shared', false)).toEqual({ status: 200, body: { private: false } })
  })

  it('takes the save out of the public pulse', async () => {
    recordActivity({
      action: 'save',
      platform: 'twitter',
      bookmarkId: 'shared',
      author: 'testauthor',
      text: 'frog',
      url: '/testauthor/status/shared',
      userId: BEN,
    })
    viewer = BEN
    await setPrivate('shared', true)
    const rows = testInstance.db.select().from(schema.activity).all()
    expect(rows.filter((r) => r.userId === BEN && r.action === 'save')).toHaveLength(0)
  })
})

describe('public surfaces', () => {
  it('trending never counts a private save', async () => {
    recordActivity({
      action: 'preview',
      platform: 'twitter',
      bookmarkId: 'shared',
      author: 'testauthor',
      text: 'frog',
      url: '/testauthor/status/shared',
    })
    viewer = BEN
    await setPrivate('shared', true)
    const { items } = await getTrendingItems({ limit: 10 })
    // Ana's save counts; Ben's private one doesn't.
    expect(items.find((i) => i.bookmarkId === 'shared')?.saveCount).toBe(1)
    expect(JSON.stringify(items)).not.toMatch(/"(ana|ben)"/)
  })

  it('playing your own private save never puts it in the pulse', () => {
    recordPreviewPulse({ platform: 'twitter', bookmarkId: 'secret', userId: BEN })
    expect(testInstance.db.select().from(schema.activity).all()).toHaveLength(0)
  })
})

describe('your own feed and saves', () => {
  it('/api/feed names who else saved each post and flags your private ones', async () => {
    viewer = ANA
    const { GET } = await import('@/app/api/feed/route')
    const res = await GET(new NextRequest('http://localhost/api/feed?limit=50'), undefined as never)
    expect(res.status).toBe(200)
    const { items } = (await res.json()) as {
      items: { id: string; savers: { username: string }[]; isPrivate: boolean }[]
    }
    const shared = items.find((i) => i.id === 'shared')!
    expect(shared.savers.map((s) => s.username)).toEqual(['ben', 'ana'])
    expect(shared.isPrivate).toBe(false)
    expect(items.find((i) => i.id === 'mineprivate')!.isPrivate).toBe(true)
    expect(items.map((i) => i.id)).not.toContain('secret')
  })

  it('a repeat save with private updates the flag and writes no pulse', async () => {
    viewer = ANA
    save(ANA, '12345')
    const { POST } = await import('@/app/api/tweets/add/route')
    const res = await POST(
      new NextRequest('http://localhost/api/tweets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://x.com/testauthor/status/12345', private: true }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ isDuplicate: true, bookmark: { isPrivate: true } })
    expect(testInstance.db.select().from(schema.activity).all()).toHaveLength(0)

    // Without `private`, a repeat save leaves the flag alone.
    await POST(
      new NextRequest('http://localhost/api/tweets/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://x.com/testauthor/status/12345' }),
      }),
    )
    const rows = testInstance.db.select().from(schema.bookmarks).all()
    expect(rows.find((r) => r.userId === ANA && r.id === '12345')!.isPrivate).toBe(true)
    expect(testInstance.db.select().from(schema.activity).all()).toHaveLength(0)
  })
})

describe('notes on saves', () => {
  beforeEach(() => {
    testInstance.sqlite.exec(`
      UPDATE bookmarks SET note = 'you’re welcome' WHERE user_id = 'u_ben' AND id = 'shared';
      UPDATE bookmarks SET note = 'whisper words' WHERE user_id = 'u_ben' AND id = 'secret';
      UPDATE bookmarks SET note = 'Ana’s own aside' WHERE user_id = 'u_ana' AND id = 'mineprivate';
    `)
  })

  it('search: members see a note on the saver’s face, never a private save’s', async () => {
    viewer = ANA
    const { items } = await search('q=frog&scope=everyone')
    const shared = items.find((i) => i.post.id === 'shared')!
    expect(shared.post.savers).toContainEqual(
      expect.objectContaining({ username: 'ben', note: 'you’re welcome' }),
    )
    expect(JSON.stringify(items)).not.toContain('whisper')
    // Your own private save's note is yours to see.
    const mine = items.find((i) => i.post.id === 'mineprivate')!
    expect(mine.post.savers).toEqual([
      expect.objectContaining({ isYou: true, note: 'Ana’s own aside' }),
    ])
  })

  it('search and similar: signed out never sees a note', async () => {
    const everyone = await search('q=frog&scope=everyone')
    expect(everyone.status).toBe(401)
    const like = await similar('platform=twitter&id=shared&scope=everyone')
    expect(like.status).toBe(200)
    expect(like.items.length).toBeGreaterThan(0)
    expect(JSON.stringify(like.items)).not.toMatch(/welcome|whisper|aside/)
  })

  it('similar: members see notes, never a private save’s', async () => {
    viewer = ANA
    const { items } = await similar('platform=twitter&id=public2&scope=everyone')
    const shared = items.find((i) => i.post.id === 'shared')!
    expect(shared.post.savers).toContainEqual(
      expect.objectContaining({ username: 'ben', note: 'you’re welcome' }),
    )
    expect(JSON.stringify(items)).not.toContain('whisper')
  })

  it('/api/feed carries notes for members, without anyone else’s private ones', async () => {
    viewer = ANA
    const { GET } = await import('@/app/api/feed/route')
    const res = await GET(new NextRequest('http://localhost/api/feed?limit=50'), undefined as never)
    const body = await res.text()
    expect(body).toContain('you’re welcome')
    expect(body).not.toContain('whisper')
    viewer = BEN
    const own = await GET(new NextRequest('http://localhost/api/feed?limit=50'), undefined as never)
    const text = await own.text()
    expect(text).toContain('whisper')
    expect(text).not.toContain('aside')
  })

  it('trending never carries a note', async () => {
    recordActivity({
      action: 'save',
      platform: 'twitter',
      bookmarkId: 'shared',
      author: 'testauthor',
      text: 'frog',
      url: '/testauthor/status/shared',
      userId: BEN,
    })
    const { items } = await getTrendingItems({ limit: 10 })
    expect(items.length).toBeGreaterThan(0)
    expect(JSON.stringify(items)).not.toMatch(/welcome|whisper|aside/)
  })
})
