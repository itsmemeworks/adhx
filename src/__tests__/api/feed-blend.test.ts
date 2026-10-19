import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestBookmark, createTestDb, type TestDbInstance } from './setup'

/**
 * The blended feed and the seen list over HTTP: `GET /api/feed/blend`,
 * `POST /api/views`, `GET|PUT /api/feed/weights`, and the phone's
 * `/api/app/feed` and `/api/app/seen`.
 *
 * Pete is watching. Ana and Ben are his people; Ben keeps one post just for
 * himself; Mum is banned. Nobody but Ben ever gets Ben's private post.
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

import { saveEmbedding } from '@/lib/semantic/store'
import { __resetRateLimitState } from '@/lib/rate-limit'
import { __resetBlendSnapshots } from '@/lib/feed/blend-db'
import { createAccessKey } from '@/lib/auth/access-keys'

const PETE = 'u_pete'
const ANA = 'u_ana'
const BEN = 'u_ben'
const MUM = 'u_mum'
const H = 3_600_000
const BASE = 'http://localhost'

function save(
  userId: string,
  id: string,
  hoursAgo: number,
  extra: Partial<schema.NewBookmark> = {},
) {
  testInstance.db
    .insert(schema.bookmarks)
    .values(
      createTestBookmark(userId, id, {
        processedAt: new Date(Date.now() - hoursAgo * H).toISOString(),
        text: `post ${id}`,
        ...extra,
      }),
    )
    .run()
}

type Item = {
  id: string
  why: string
  whyReasons: { kind: string; text: string; username?: string }[]
  savers: { username: string; isYou: boolean }[]
  isPrivate: boolean
}
type Page = {
  items: Item[]
  nextCursor: string | null
  caughtUp: boolean
  nothingYet: boolean
  total: number
}

async function feed(query: string): Promise<{ status: number; body: Page & { error?: string } }> {
  const { GET } = await import('@/app/api/feed/blend/route')
  const res = await GET(new NextRequest(`${BASE}/api/feed/blend?${query}`))
  return {
    status: res.status,
    body: res.status === 200 || res.status === 400 ? await res.json() : null,
  }
}

/** Every page of a mode, following the cursor. */
async function allOf(mode: string, limit = 50): Promise<Item[]> {
  const out: Item[] = []
  let cursor: string | null = null
  do {
    const { status, body } = await feed(
      `mode=${mode}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    )
    expect(status).toBe(200)
    out.push(...body.items)
    cursor = body.nextCursor
  } while (cursor)
  return out
}

async function views(posts: unknown): Promise<number> {
  const { POST } = await import('@/app/api/views/route')
  const res = await POST(
    new NextRequest(`${BASE}/api/views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts }),
    }),
  )
  return res.status
}

const ids = (items: Item[]) => items.map((i) => i.id).sort()

beforeEach(async () => {
  testInstance = createTestDb()
  viewer = null
  __resetRateLimitState()
  __resetBlendSnapshots()
  testInstance.db
    .insert(schema.users)
    .values([
      { id: PETE, username: 'pete', displayName: 'Pete' },
      { id: ANA, username: 'ana', displayName: 'Ana' },
      { id: BEN, username: 'ben', displayName: 'Ben' },
      { id: MUM, username: 'mum', displayName: 'Mum' },
    ])
    .run()
  testInstance.db
    .insert(schema.userBans)
    .values({ userId: MUM, createdAt: new Date().toISOString(), createdBy: PETE })
    .run()
  save(ANA, 'p1', 1) // Ana's, fresh
  save(BEN, 'p2', 1, { isPrivate: true }) // just for Ben
  save(ANA, 'p3', 3) // saved together
  save(BEN, 'p3', 2)
  save(MUM, 'p4', 1) // banned saver only
  save(ANA, 'p5', 1, { source: 'quoted' }) // a quoted copy, nobody chose it
  save(ANA, 'p6', 1) // hidden by an admin
  testInstance.db
    .insert(schema.moderatedPosts)
    .values({
      platform: 'twitter',
      bookmarkId: 'p6',
      hidden: 1,
      createdAt: new Date().toISOString(),
      createdBy: PETE,
    })
    .run()
  save(ANA, 'p7', 1) // deleted upstream
  await saveEmbedding({
    platform: 'twitter',
    postId: 'p7',
    kind: 'video',
    contentHash: null,
    status: 'none',
    error: 'gone (404)',
  })
  save(PETE, 'p8', 1) // only Pete's
  save(ANA, 'p9', 20 * 24) // older than New looks
})

afterEach(() => testInstance.close())

describe('GET /api/feed/blend', () => {
  it('needs a member', async () => {
    expect((await feed('mode=new')).status).toBe(401)
    expect(await views([{ platform: 'twitter', id: 'p1' }])).toBe(401)
    const { GET } = await import('@/app/api/feed/weights/route')
    expect((await GET(new NextRequest(`${BASE}/api/feed/weights`))).status).toBe(401)
  })

  it('New: what your people saved lately, never private, banned, quoted, hidden or gone', async () => {
    viewer = PETE
    const { status, body } = await feed('mode=new')
    expect(status).toBe(200)
    expect(ids(body.items)).toEqual(['p1', 'p3'])
    expect(body.caughtUp).toBe(true)
    expect(body.nothingYet).toBe(false)
    const together = body.items.find((i) => i.id === 'p3')!
    expect(together.why).toMatch(/^(Ben and Ana|Ana and Ben) saved this$/)
    expect(together.whyReasons[0].kind).toBe('together')
    expect(together.savers.map((s) => s.username).sort()).toEqual(['ana', 'ben'])
    expect(body.items.find((i) => i.id === 'p1')!.why).toBe('Ana saved this · 1h')
    // Nothing on the wire says who anyone is beyond their name.
    expect(JSON.stringify(body)).not.toMatch(/u_(ana|ben|mum|pete)/)
  })

  it('Ana never sees or hears of Ben’s private save, in any mode', async () => {
    viewer = ANA
    for (const mode of ['new', 'everyone', 'friends', 'mine']) {
      const items = await allOf(mode)
      expect(items.map((i) => i.id)).not.toContain('p2')
      for (const item of items) {
        expect(item.savers.map((s) => s.username)).not.toContain('mum')
      }
    }
    viewer = BEN
    const mine = await allOf('mine')
    expect(mine.find((i) => i.id === 'p2')).toMatchObject({ isPrivate: true })
  })

  it('Everyone, Friends only and Mine', async () => {
    viewer = PETE
    expect(ids(await allOf('everyone'))).toEqual(['p1', 'p3', 'p8', 'p9'])
    expect(ids(await allOf('friends'))).toEqual(['p1', 'p3', 'p9'])
    const mine = await allOf('mine')
    expect(ids(mine)).toEqual(['p8'])
    expect(mine[0].why).toBe('You saved this · 1h')
  })

  it('New leaves out what you have seen, then says you are caught up', async () => {
    viewer = PETE
    expect(await views([{ platform: 'twitter', id: 'p1' }])).toBe(204)
    let page = (await feed('mode=new')).body
    expect(ids(page.items)).toEqual(['p3'])
    expect(page.caughtUp).toBe(true)

    expect(await views([{ platform: 'twitter', id: 'p3' }])).toBe(204)
    page = (await feed('mode=new')).body
    expect(page.items).toEqual([])
    expect(page.caughtUp).toBe(true)
    expect(page.nothingYet).toBe(false)
    // Seen posts are still in Everyone.
    expect(ids(await allOf('everyone'))).toContain('p1')
  })

  it('pages through one snapshot without reshuffling', async () => {
    viewer = PETE
    for (let i = 0; i < 7; i++) save(i % 2 ? ANA : BEN, `q${i}`, 4 + i)
    const first = (await feed('mode=new&limit=3')).body
    expect(first.items).toHaveLength(3)
    expect(first.nextCursor).toEqual(expect.any(String))
    expect(first.caughtUp).toBe(false)
    expect(first.total).toBe(9)
    // Watching between pages doesn't move anything around.
    await views(first.items.map((i) => ({ platform: 'twitter', id: i.id })))
    const rest: Item[] = []
    let cursor = first.nextCursor
    while (cursor) {
      const page = (await feed(`mode=new&limit=3&cursor=${encodeURIComponent(cursor)}`)).body
      rest.push(...page.items)
      cursor = page.nextCursor
      if (!cursor) expect(page.caughtUp).toBe(true)
    }
    const all = [...first.items, ...rest].map((i) => i.id)
    expect(new Set(all).size).toBe(9)
    expect(all.sort()).toEqual(['p1', 'p3', 'q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6'])
  })

  it('says “nothing yet” on a server where nobody else has saved anything', async () => {
    testInstance.sqlite.exec('DELETE FROM bookmarks')
    save(PETE, 'mine1', 1)
    viewer = PETE
    const { body } = await feed('mode=new')
    expect(body).toMatchObject({ items: [], caughtUp: true, nothingYet: true })
  })

  it('like what you keep: close to your saves, named after the channel it’s in', async () => {
    const unit = (weights: Record<number, number>) => {
      const v = new Float32Array(768)
      for (const [i, w] of Object.entries(weights)) v[Number(i)] = w
      const n = Math.hypot(...v)
      return v.map((x) => x / n)
    }
    const understood = (id: string, vector: Float32Array) =>
      saveEmbedding({
        platform: 'twitter',
        postId: id,
        kind: 'text',
        contentHash: id,
        status: 'ok',
        vector,
      })
    save(PETE, 'k1', 30)
    await understood('k1', unit({ 0: 1 }))
    testInstance.db
      .insert(schema.autoChannels)
      .values({
        userId: PETE,
        slug: 'frog-videos',
        name: 'Frog videos',
        postKeys: JSON.stringify(['twitter:k1']),
        size: 1,
        position: 0,
        model: 'm',
        savesAtCompute: 1,
        computedAt: new Date().toISOString(),
      })
      .run()
    const near = {
      c1: unit({ 0: 1 }),
      c2: unit({ 0: 0.6, 1: 0.8 }),
      c3: unit({ 0: 0.3, 1: 0.95 }),
      c4: unit({ 2: 1 }),
    }
    for (const [id, vector] of Object.entries(near)) {
      save(BEN, id, 48)
      await understood(id, vector)
    }
    viewer = PETE
    const items = await allOf('new')
    const why = (id: string) => items.find((i) => i.id === id)!.whyReasons.map((r) => r.text)
    expect(why('c1')).toContain('Like the frog videos you kept')
    expect(why('c4')).not.toContain('Like the frog videos you kept')
    expect(items.findIndex((i) => i.id === 'c1')).toBeLessThan(
      items.findIndex((i) => i.id === 'c4'),
    )
  })

  it('refuses a bad mode or cursor', async () => {
    viewer = PETE
    expect((await feed('mode=trending')).status).toBe(400)
    expect((await feed('mode=new&cursor=nope')).status).toBe(400)
  })
})

describe('POST /api/views', () => {
  it('is idempotent and keeps when a post was first seen', async () => {
    viewer = PETE
    expect(await views([{ platform: 'twitter', id: 'p1' }])).toBe(204)
    const [first] = testInstance.db.select().from(schema.postViews).all()
    await new Promise((r) => setTimeout(r, 5))
    expect(
      await views([
        { platform: 'twitter', id: 'p1' },
        { platform: 'twitter', id: 'p1' },
      ]),
    ).toBe(204)
    const rows = testInstance.db.select().from(schema.postViews).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      userId: PETE,
      platform: 'twitter',
      postId: 'p1',
      seenAt: first.seenAt,
    })
  })

  it('takes at most 50, and only well-formed posts', async () => {
    viewer = PETE
    const many = Array.from({ length: 51 }, (_, i) => ({ platform: 'twitter', id: `x${i}` }))
    expect(await views(many)).toBe(400)
    expect(await views(many.slice(0, 50))).toBe(204)
    expect(await views([{ platform: 'Twitter!', id: 'p1' }])).toBe(400)
    expect(await views([{ platform: 'twitter', id: '../p1' }])).toBe(400)
    expect(await views('p1')).toBe(400)
  })

  it('only ever marks for the viewer', async () => {
    viewer = ANA
    await views([{ platform: 'twitter', id: 'p3' }])
    viewer = PETE
    expect(ids((await feed('mode=new')).body.items)).toEqual(['p1', 'p3'])
  })
})

describe('feed weights', () => {
  async function put(body: unknown) {
    const { PUT } = await import('@/app/api/feed/weights/route')
    const res = await PUT(
      new NextRequest(`${BASE}/api/feed/weights`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
    return { status: res.status, body: await res.json() }
  }

  it('show more / less from a friend, and back to normal', async () => {
    viewer = PETE
    expect(await put({ username: 'ana', weight: 1 })).toEqual({
      status: 200,
      body: { weights: { ana: 1 } },
    })
    expect((await put({ username: 'ben', weight: -1 })).body.weights).toEqual({ ana: 1, ben: -1 })
    const { GET } = await import('@/app/api/feed/weights/route')
    expect(await (await GET(new NextRequest(`${BASE}/api/feed/weights`))).json()).toEqual({
      weights: { ana: 1, ben: -1 },
    })
    const p1 = (await feed('mode=new')).body.items.find((i) => i.id === 'p1')!
    expect(p1.whyReasons.map((r) => r.text)).toContain('You asked for more from Ana')
    expect((await put({ username: 'ana', weight: 0 })).body.weights).toEqual({ ben: -1 })
  })

  it('only for other members, with a real weight', async () => {
    viewer = PETE
    expect((await put({ username: 'pete', weight: 1 })).status).toBe(404)
    expect((await put({ username: 'nobody', weight: 1 })).status).toBe(404)
    expect((await put({ username: 'ana', weight: 2 })).status).toBe(400)
    expect((await put({ weight: 1 })).status).toBe(400)
  })
})

describe('phone: /api/app/feed and /api/app/seen', () => {
  const key = (scope: 'phone' | 'search') => createAccessKey(PETE, 'Phone', scope)!.key
  const call = async (path: string, auth?: string, body?: unknown) => {
    const headers: Record<string, string> = auth ? { authorization: `Bearer ${auth}` } : {}
    if (body !== undefined) {
      const { POST } = await import('@/app/api/app/seen/route')
      return POST(
        new NextRequest(`${BASE}${path}`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
    }
    const { GET } = await import('@/app/api/app/feed/route')
    return GET(new NextRequest(`${BASE}${path}`, { headers }))
  }

  it('plays New as phone posts with why, and marks seen', async () => {
    const phone = key('phone')
    const res = await call('/api/app/feed?mode=new', phone)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: { id: string; why: string; kind: string; savers: unknown[]; openPath: string }[]
      caughtUp: boolean
      nextCursor: string | null
    }
    expect(body.items.map((i) => i.id).sort()).toEqual(['p1', 'p3'])
    expect(body.items.find((i) => i.id === 'p1')).toMatchObject({
      why: 'Ana saved this · 1h',
      kind: 'text',
      savers: [expect.objectContaining({ username: 'ana', isYou: false })],
    })
    expect(body.caughtUp).toBe(true)

    expect(
      (await call('/api/app/seen', phone, { posts: [{ platform: 'twitter', id: 'p1' }] })).status,
    ).toBe(204)
    const after = await (await call('/api/app/feed?mode=new', phone)).json()
    expect(after.items.map((i: { id: string }) => i.id)).toEqual(['p3'])
    expect(
      testInstance.db
        .select()
        .from(schema.postViews)
        .where(and(eq(schema.postViews.userId, PETE), eq(schema.postViews.postId, 'p1')))
        .all(),
    ).toHaveLength(1)
  })

  it('refuses no key, a search key and bad input', async () => {
    expect((await call('/api/app/feed?mode=new')).status).toBe(401)
    const search = key('search')
    expect((await call('/api/app/feed?mode=new', search)).status).toBe(401)
    expect((await call('/api/app/seen', search, { posts: [] })).status).toBe(401)
    const phone = key('phone')
    expect((await call('/api/app/feed?mode=everything', phone)).status).toBe(400)
    expect((await call('/api/app/seen', phone, { posts: 'p1' })).status).toBe(400)
  })
})
