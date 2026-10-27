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
  types: string[]
  waiting: Record<string, number>
}

/** Most posts here are words only; ask for every kind unless a test says otherwise. */
const ALL_KINDS = 'types=video,photo,text,article'

async function feed(query: string): Promise<{ status: number; body: Page & { error?: string } }> {
  const { GET } = await import('@/app/api/feed/blend/route')
  const q = query.includes('types=') || query.includes('notypes') ? query : `${query}&${ALL_KINDS}`
  const res = await GET(new NextRequest(`${BASE}/api/feed/blend?${q.replace('&notypes', '')}`))
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

  it('Everyone, Friends and Mine', async () => {
    viewer = PETE
    expect(ids(await allOf('everyone'))).toEqual(['p1', 'p3', 'p8', 'p9'])
    expect(ids(await allOf('friends'))).toEqual(['p1', 'p3', 'p9'])
    const mine = await allOf('mine')
    expect(ids(mine)).toEqual(['p8'])
    expect(mine[0].why).toBe('You saved this · 1h')
  })

  it('Everyone, Friends and Mine play the latest saves first, seen or not', async () => {
    viewer = PETE
    save(BEN, 'n1', 0.2)
    save(ANA, 'n2', 0.4)
    save(PETE, 'n3', 0.3)
    expect(await views([{ platform: 'twitter', id: 'n2' }])).toBe(204)
    const order = (items: Item[]) => items.map((i) => i.id).slice(0, 3)
    expect(order(await allOf('everyone'))).toEqual(['n1', 'n3', 'n2'])
    expect(order(await allOf('friends'))).toEqual(['n1', 'n2', 'p1'])
    expect((await allOf('mine')).map((i) => i.id)).toEqual(['n3', 'p8'])
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

describe('phone: /api/app/feed/weights', () => {
  const req = (key: string | null, body?: unknown) =>
    new NextRequest(`${BASE}/api/app/feed/weights`, {
      method: body === undefined ? 'GET' : 'PUT',
      headers: {
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })

  it('reads and sets the same choice as the web, and it moves the feed', async () => {
    const phone = createAccessKey(PETE, 'Phone', 'phone')!.key
    const { GET, PUT } = await import('@/app/api/app/feed/weights/route')
    const get = await GET(req(phone))
    expect(get.status).toBe(200)
    expect(get.headers.get('Cache-Control')).toBe('no-store')
    expect(await get.json()).toEqual({ weights: {} })
    expect(await (await PUT(req(phone, { username: 'ana', weight: 1 }))).json()).toEqual({
      weights: { ana: 1 },
    })
    expect(await (await PUT(req(phone, { username: ' ben ', weight: -1 }))).json()).toEqual({
      weights: { ana: 1, ben: -1 },
    })
    // The web sees the phone's choice, and New says why.
    viewer = PETE
    const { GET: webGet } = await import('@/app/api/feed/weights/route')
    expect(await (await webGet(new NextRequest(`${BASE}/api/feed/weights`))).json()).toEqual({
      weights: { ana: 1, ben: -1 },
    })
    const p1 = (await feed('mode=new')).body.items.find((i) => i.id === 'p1')!
    expect(p1.whyReasons.map((r) => r.text)).toContain('You asked for more from Ana')
    expect(await (await PUT(req(phone, { username: 'ana', weight: 0 }))).json()).toEqual({
      weights: { ben: -1 },
    })
  })

  it('is per account: one member’s choice never reaches another', async () => {
    const pete = createAccessKey(PETE, 'Phone', 'phone')!.key
    const ana = createAccessKey(ANA, 'Phone', 'phone')!.key
    const { GET, PUT } = await import('@/app/api/app/feed/weights/route')
    await PUT(req(pete, { username: 'ben', weight: -1 }))
    expect(await (await GET(req(ana))).json()).toEqual({ weights: {} })
  })

  it('refuses no key, a search key, yourself, strangers and bad weights', async () => {
    const phone = createAccessKey(PETE, 'Phone', 'phone')!.key
    const search = createAccessKey(PETE, 'Claude', 'search')!.key
    const { GET, PUT } = await import('@/app/api/app/feed/weights/route')
    expect((await GET(req(null))).status).toBe(401)
    expect((await GET(req(search))).status).toBe(401)
    expect((await PUT(req(search, { username: 'ana', weight: 1 }))).status).toBe(401)
    const self = await PUT(req(phone, { username: 'pete', weight: 1 }))
    expect(self.status).toBe(404)
    expect(await self.json()).toMatchObject({ code: 'no_member' })
    expect((await PUT(req(phone, { username: 'nobody', weight: 1 }))).status).toBe(404)
    const bad = await PUT(req(phone, { username: 'ana', weight: 2 }))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ code: 'bad_weight' })
    expect((await PUT(req(phone, { weight: 1 }))).status).toBe(400)
    expect(await (await GET(req(phone))).json()).toEqual({ weights: {} })
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
    const res = await call(`/api/app/feed?mode=new&${ALL_KINDS}`, phone)
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
    const after = await (await call(`/api/app/feed?mode=new&${ALL_KINDS}`, phone)).json()
    expect(after.items.map((i: { id: string }) => i.id)).toEqual(['p3'])
    expect(
      testInstance.db
        .select()
        .from(schema.postViews)
        .where(and(eq(schema.postViews.userId, PETE), eq(schema.postViews.postId, 'p1')))
        .all(),
    ).toHaveLength(1)
  })

  it('plays the lineup: Just saved since you last looked, Not seen yet, then For you', async () => {
    // Pete last looked an hour and a half ago, at the old post p9.
    testInstance.db
      .insert(schema.postViews)
      .values({
        userId: PETE,
        platform: 'twitter',
        postId: 'p9',
        seenAt: new Date(Date.now() - 1.5 * H).toISOString(),
      })
      .run()
    const res = await call(`/api/app/feed?mode=lineup&${ALL_KINDS}`, key('phone'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      items: { id: string; section: string; why: string }[]
      sections: Record<string, number>
      caughtUp: boolean
    }
    expect(body.items.map((i) => [i.id, i.section])).toEqual([
      ['p1', 'just'],
      ['p3', 'unseen'],
      ['p9', 'foryou'],
    ])
    expect(body.sections).toEqual({ just: 1, unseen: 1, foryou: 1 })
    expect(body.caughtUp).toBe(true)
  })

  it('For you opens on what Pete watched longest ago, counting replays', async () => {
    const ago = (h: number) => new Date(Date.now() - h * H).toISOString()
    testInstance.db
      .insert(schema.postViews)
      .values([
        { userId: PETE, platform: 'twitter', postId: 'p1', seenAt: ago(5) },
        { userId: PETE, platform: 'twitter', postId: 'p3', seenAt: ago(3) },
        { userId: PETE, platform: 'twitter', postId: 'p9', seenAt: ago(10) },
      ])
      .run()
    // p9 was first seen longest ago, but Pete played it again a moment ago.
    testInstance.db
      .insert(schema.postWatchCounts)
      .values({
        userId: PETE,
        platform: 'twitter',
        postId: 'p9',
        year: new Date().getUTCFullYear(),
        plays: 2,
        finishes: 1,
        seconds: 30,
        firstAt: ago(10),
        lastAt: ago(0.1),
      })
      .run()
    const res = await call(`/api/app/feed?mode=lineup&${ALL_KINDS}`, key('phone'))
    const body = (await res.json()) as { items: { id: string; section: string }[] }
    expect(body.items.map((i) => [i.id, i.section])).toEqual([
      ['p1', 'foryou'],
      ['p3', 'foryou'],
      ['p9', 'foryou'],
    ])
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

describe("what's in your feed", () => {
  function media(userId: string, id: string, type: string, platform = 'twitter') {
    testInstance.db
      .insert(schema.bookmarkMedia)
      .values({
        id: `${userId}-${id}`,
        userId,
        platform,
        bookmarkId: id,
        mediaType: type,
        originalUrl: `https://example.com/${id}`,
      })
      .run()
  }

  beforeEach(() => {
    save(ANA, 'v1', 2)
    media(ANA, 'v1', 'video')
    save(BEN, 'g1', 2)
    media(BEN, 'g1', 'animated_gif')
    save(ANA, 'ph1', 2)
    media(ANA, 'ph1', 'photo')
    save(BEN, 'a1', 2, { category: 'article' })
    save(ANA, 'a2', 2)
    testInstance.db
      .insert(schema.bookmarkLinks)
      .values({ userId: ANA, bookmarkId: 'a2', expandedUrl: 'https://x.com/i/article/123' })
      .run()
    save(BEN, 'sc1', 2, { platform: 'soundcloud' })
    media(BEN, 'sc1', 'video', 'soundcloud')
  })

  async function types(method: 'GET' | 'PUT', body?: unknown) {
    const { GET, PUT } = await import('@/app/api/feed/types/route')
    const req = new NextRequest(`${BASE}/api/feed/types`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
    const res = await (method === 'GET' ? GET(req) : PUT(req))
    return { status: res.status, body: res.status === 401 ? null : await res.json() }
  }

  it('defaults to videos and photos; sound plays with video', async () => {
    viewer = PETE
    const { body } = await feed('mode=new&notypes')
    expect(body.types).toEqual(['video', 'photo'])
    expect(ids(body.items)).toEqual(['g1', 'ph1', 'sc1', 'v1'])
  })

  it('filters to the kinds asked for, the same kinds the phone shows', async () => {
    viewer = PETE
    expect(ids((await feed('mode=new&types=article')).body.items)).toEqual(['a1', 'a2'])
    expect(ids((await feed('mode=new&types=text')).body.items)).toEqual(['p1', 'p3'])
    expect(ids((await feed('mode=everyone&types=photo,audio')).body.items)).toEqual([
      'g1',
      'ph1',
      'sc1',
      'v1',
    ])
    const phone = createAccessKey(PETE, 'Phone', 'phone')!.key
    const { GET } = await import('@/app/api/app/feed/route')
    const res = await GET(
      new NextRequest(`${BASE}/api/app/feed?mode=new&${ALL_KINDS}`, {
        headers: { authorization: `Bearer ${phone}` },
      }),
    )
    const phoneKinds = Object.fromEntries(
      ((await res.json()).items as { id: string; kind: string }[]).map((i) => [i.id, i.kind]),
    )
    expect(phoneKinds).toMatchObject({
      v1: 'video',
      g1: 'video',
      sc1: 'audio',
      ph1: 'photo',
      a1: 'article',
      a2: 'article',
      p1: 'text',
    })
  })

  it('caught up within the filter, saying what else is waiting', async () => {
    viewer = PETE
    await views(
      ['v1', 'g1', 'ph1', 'sc1'].map((id) => ({
        platform: id === 'sc1' ? 'soundcloud' : 'twitter',
        id,
      })),
    )
    const { body } = await feed('mode=new&types=video,photo')
    expect(body.items).toEqual([])
    expect(body.caughtUp).toBe(true)
    expect(body.nothingYet).toBe(false)
    expect(body.waiting).toEqual({ text: 2, article: 2 })
    // Seen ones don't count as waiting.
    await views([{ platform: 'twitter', id: 'a1' }])
    expect((await feed('mode=new&types=video,photo')).body.waiting).toEqual({ text: 2, article: 1 })
  })

  it('tells the phone what is waiting under the name the apps read, hidden', async () => {
    viewer = PETE
    const phone = createAccessKey(PETE, 'Phone', 'phone')!.key
    const { GET } = await import('@/app/api/app/feed/route')
    const res = await GET(
      new NextRequest(`${BASE}/api/app/feed?mode=new&types=video,photo`, {
        headers: { authorization: `Bearer ${phone}` },
      }),
    )
    const body = await res.json()
    expect(body.waiting).toEqual({ text: 2, article: 2 })
    expect(body.hidden).toEqual(body.waiting)
  })

  it('remembers the choice and uses it when types is left out', async () => {
    expect((await types('GET')).status).toBe(401)
    viewer = PETE
    expect(await types('GET')).toEqual({ status: 200, body: { types: ['video', 'photo'] } })
    expect(await types('PUT', { types: ['article', 'text'] })).toEqual({
      status: 200,
      body: { types: ['text', 'article'] },
    })
    expect((await types('GET')).body).toEqual({ types: ['text', 'article'] })
    const { body } = await feed('mode=new&notypes')
    expect(body.types).toEqual(['text', 'article'])
    expect(ids(body.items)).toEqual(['a1', 'a2', 'p1', 'p3'])
    // The choice is Pete's alone.
    viewer = ANA
    expect((await types('GET')).body).toEqual({ types: ['video', 'photo'] })
  })

  it('keeps at least one kind and refuses unknown ones', async () => {
    viewer = PETE
    expect((await types('PUT', { types: [] })).status).toBe(400)
    expect((await types('PUT', { types: ['video', 'memes'] })).status).toBe(400)
    expect((await types('PUT', {})).status).toBe(400)
    expect((await feed('mode=new&types=')).status).toBe(400)
    expect((await feed('mode=new&types=memes')).status).toBe(400)
  })

  it('the phone reads and sets the same choice', async () => {
    const phone = createAccessKey(PETE, 'Phone', 'phone')!.key
    const search = createAccessKey(PETE, 'Claude', 'search')!.key
    const { GET, PUT } = await import('@/app/api/app/feed/types/route')
    const req = (key: string, body?: unknown) =>
      new NextRequest(`${BASE}/api/app/feed/types`, {
        method: body === undefined ? 'GET' : 'PUT',
        headers: { authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    expect((await GET(req(search))).status).toBe(401)
    expect(await (await GET(req(phone))).json()).toEqual({ types: ['video', 'photo'] })
    expect(await (await PUT(req(phone, { types: ['audio', 'text'] }))).json()).toEqual({
      types: ['video', 'text'],
    })
    expect((await PUT(req(phone, { types: [] }))).status).toBe(400)
    viewer = PETE
    expect((await types('GET')).body).toEqual({ types: ['video', 'text'] })
  })
})

describe('notes on the blended feed', () => {
  beforeEach(() => {
    testInstance.sqlite.exec(`
      UPDATE bookmarks SET note = 'you’re welcome' WHERE user_id = 'u_ben' AND id = 'p3';
      UPDATE bookmarks SET note = 'whisper words' WHERE user_id = 'u_ben' AND id = 'p2';
      UPDATE bookmarks SET note = 'banned words' WHERE user_id = 'u_mum' AND id = 'p4';
    `)
  })

  it('members see each saver’s note in every mode; never a private or banned one', async () => {
    viewer = PETE
    for (const mode of ['new', 'everyone', 'friends']) {
      const items = await allOf(mode)
      const p3 = items.find((i) => i.id === 'p3')!
      expect(p3.savers).toContainEqual(
        expect.objectContaining({ username: 'ben', note: 'you’re welcome' }),
      )
      expect(JSON.stringify(items)).not.toMatch(/whisper|banned words/)
    }
    // Ben sees his own private note in Mine.
    viewer = BEN
    const mine = await allOf('mine')
    expect(mine.find((i) => i.id === 'p2')!.savers).toEqual([
      expect.objectContaining({ isYou: true, note: 'whisper words' }),
    ])
  })

  it('a changed note shows on the next page of the same snapshot', async () => {
    viewer = PETE
    const first = await feed('mode=everyone&limit=1')
    expect(first.status).toBe(200)
    testInstance.sqlite.exec(
      "UPDATE bookmarks SET note = 'changed my mind' WHERE user_id = 'u_ben' AND id = 'p3'",
    )
    const rest = await allOf('everyone')
    expect(JSON.stringify(rest)).toContain('changed my mind')
    expect(JSON.stringify(rest)).not.toContain('you’re welcome')
  })

  it('the phone’s feed carries them as PhonePost savers; no key, no feed', async () => {
    const key = createAccessKey(PETE, 'Phone', 'phone')!.key
    const { GET } = await import('@/app/api/app/feed/route')
    const res = await GET(
      new NextRequest(`${BASE}/api/app/feed?mode=everyone&${ALL_KINDS}`, {
        headers: { authorization: `Bearer ${key}` },
      }),
    )
    const body = (await res.json()) as { items: Item[] }
    expect(body.items.find((i) => i.id === 'p3')!.savers).toContainEqual(
      expect.objectContaining({ username: 'ben', note: 'you’re welcome' }),
    )
    expect(JSON.stringify(body)).not.toMatch(/whisper|banned words/)
    const anon = await GET(new NextRequest(`${BASE}/api/app/feed?mode=everyone`))
    expect(anon.status).toBe(401)
    expect(await anon.text()).not.toMatch(/welcome|whisper/)
    const search = createAccessKey(PETE, 'Script', 'search')!.key
    const wrong = await GET(
      new NextRequest(`${BASE}/api/app/feed?mode=everyone`, {
        headers: { authorization: `Bearer ${search}` },
      }),
    )
    expect(wrong.status).toBe(401)
  })
})
