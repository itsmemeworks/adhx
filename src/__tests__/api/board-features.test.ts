import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestBookmark, createTestDb, type TestDbInstance } from './setup'

/**
 * The board features over HTTP (docs/specs/friends-feed.md):
 * - Send straight to your people: `GET|POST /api/posts/send`, `/api/app/send`,
 *   and the recipient's "Pete sent you this" in New.
 * - "Tell me when it's live": the forming bell and alerts.
 * - The thumbnail beside "Like … you kept".
 * - "Keep this channel" on a From everyone channel.
 *
 * Pete, Ana, Ben and Jo are members; Mum is banned. Ana keeps one post just
 * for herself; Pete keeps one just for himself.
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
  clearSessionCookie: vi.fn(),
}))
vi.mock('@/lib/sentry', () => ({
  metrics: new Proxy({}, { get: () => vi.fn() }),
  captureException: vi.fn(),
}))
vi.mock('@/lib/semantic/supervisor', () => ({
  embedQuery: async () => {
    throw new Error('no model')
  },
  embedQueries: async () => {
    throw new Error('no model')
  },
  wakeJobs: () => {},
  jobActivity: () => null,
  startSemanticProcesses: () => {},
}))

import { __resetRateLimitState } from '@/lib/rate-limit'
import { __resetBlendSnapshots } from '@/lib/feed/blend-db'
import { createAccessKey } from '@/lib/auth/access-keys'
import { saveEmbedding } from '@/lib/semantic/store'
import { __resetVectorIndex } from '@/lib/semantic/vector-index'
import { normalize } from '@/lib/moments/group'
import { __moments, __resetMoments, getMomentsSnapshot } from '@/lib/moments/engine'
import { groupKeepTag } from '@/lib/channels/group-keep'

const PETE = 'u_pete'
const ANA = 'u_ana'
const BEN = 'u_ben'
const JO = 'u_jo'
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

function json(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function targets(platform: string, id: string) {
  const { GET } = await import('@/app/api/posts/send/route')
  const res = await GET(json(`/api/posts/send?platform=${platform}&id=${id}`, 'GET'))
  return { status: res.status, body: await res.json() }
}

async function send(body: unknown) {
  const { POST } = await import('@/app/api/posts/send/route')
  const res = await POST(json('/api/posts/send', 'POST', body))
  return { status: res.status, body: await res.json(), headers: res.headers }
}

type Reason = {
  kind: string
  text: string
  username?: string
  note?: string
  post?: { platform: string; id: string; posterUrl: string | null }
}
type Item = {
  id: string
  why: string
  whyReasons: Reason[]
  savers: { username: string; note?: string }[]
}

async function newFeed(): Promise<Item[]> {
  const { GET } = await import('@/app/api/feed/blend/route')
  const res = await GET(
    new NextRequest(`${BASE}/api/feed/blend?mode=new&limit=50&types=video,photo,text,article`),
  )
  expect(res.status).toBe(200)
  return (await res.json()).items
}

beforeEach(() => {
  testInstance = createTestDb()
  viewer = null
  __resetRateLimitState()
  __resetBlendSnapshots()
  __resetVectorIndex()
  __resetMoments()
  vi.stubEnv('MOMENT_MIN_SAVERS', '2')
  vi.stubEnv('TYPESAFE_API_KEY', '')
  testInstance.db
    .insert(schema.users)
    .values([
      { id: PETE, username: 'pete', displayName: 'Pete' },
      { id: ANA, username: 'ana', displayName: 'Ana' },
      { id: BEN, username: 'ben', displayName: 'Ben' },
      { id: JO, username: 'jo', displayName: 'Jo' },
      { id: MUM, username: 'mum', displayName: 'Mum' },
    ])
    .run()
  testInstance.db
    .insert(schema.userBans)
    .values({ userId: MUM, createdAt: new Date().toISOString(), createdBy: PETE })
    .run()
})

afterEach(() => {
  vi.unstubAllEnvs()
  __resetMoments()
})

describe('send straight to your people', () => {
  beforeEach(() => {
    save(PETE, 'sauce', 2)
    save(JO, 'sauce', 1)
    save(ANA, 'secret', 1, { isPrivate: true })
    save(PETE, 'mine-only', 1, { isPrivate: true })
    save(ANA, 'shared', 3)
    save(PETE, 'shared', 3, { isPrivate: true })
  })

  it('lists every other member with has and sent, never you or a banned account', async () => {
    viewer = PETE
    const { status, body } = await targets('twitter', 'sauce')
    expect(status).toBe(200)
    expect(body.sendable).toBe(true)
    const people = body.people as { username: string; has: boolean; sent: boolean }[]
    expect(people.map((p) => p.username).sort()).toEqual(['ana', 'ben', 'jo'])
    expect(people.find((p) => p.username === 'jo')).toMatchObject({ has: true, sent: false })
    expect(people.find((p) => p.username === 'ana')).toMatchObject({ has: false, sent: false })
    expect(Object.keys(people[0]).sort()).toEqual(['avatarUrl', 'has', 'name', 'sent', 'username'])
  })

  it('never reveals a Just for me save: a private holder is offered and can be sent it', async () => {
    save(BEN, 'sauce', 1, { isPrivate: true })
    viewer = PETE
    const { body } = await targets('twitter', 'sauce')
    expect(body.people.find((p: { username: string }) => p.username === 'ben')).toMatchObject({
      has: false,
    })
    const sent = await send({ platform: 'twitter', id: 'sauce', to: ['ben'] })
    expect(sent.body).toEqual({ sent: ['ben'], skipped: [] })
  })

  it('sends, skips who has it, who already got it and who isn’t a member', async () => {
    viewer = PETE
    const first = await send({
      platform: 'twitter',
      id: 'sauce',
      to: ['ana', 'jo', 'mum', 'nobody', 'pete'],
      note: '  making this  Sunday ',
    })
    expect(first.status).toBe(200)
    expect(first.body.sent).toEqual(['ana'])
    expect(first.body.skipped).toEqual([
      { username: 'jo', reason: 'has' },
      { username: 'mum', reason: 'unknown' },
      { username: 'nobody', reason: 'unknown' },
      { username: 'pete', reason: 'unknown' },
    ])
    const again = await send({ platform: 'twitter', id: 'sauce', to: ['ana'] })
    expect(again.body).toEqual({ sent: [], skipped: [{ username: 'ana', reason: 'sent' }] })
    const { body } = await targets('twitter', 'sauce')
    expect(body.people.find((p: { username: string }) => p.username === 'ana').sent).toBe(true)
    const [row] = testInstance.db.select().from(schema.postSends).all()
    expect(row).toMatchObject({ fromUserId: PETE, toUserId: ANA, note: 'making this Sunday' })
  })

  it('never sends another person’s private post', async () => {
    viewer = PETE
    expect((await targets('twitter', 'secret')).status).toBe(404)
    const sent = await send({ platform: 'twitter', id: 'secret', to: ['ben'] })
    expect(sent.status).toBe(404)
    expect(sent.body.code).toBe('not_found')
    expect(testInstance.db.select().from(schema.postSends).all()).toHaveLength(0)
  })

  it('never sends your own private-only post, and says so', async () => {
    viewer = PETE
    expect(await targets('twitter', 'mine-only')).toEqual({
      status: 200,
      body: { sendable: false, people: [] },
    })
    const sent = await send({ platform: 'twitter', id: 'mine-only', to: ['ben'] })
    expect(sent.status).toBe(403)
    expect(sent.body.code).toBe('private')
    expect(testInstance.db.select().from(schema.postSends).all()).toHaveLength(0)
  })

  it('sends a post you keep privately when a friend shared it', async () => {
    viewer = PETE
    expect((await targets('twitter', 'shared')).body.sendable).toBe(true)
    expect((await send({ platform: 'twitter', id: 'shared', to: ['ben'] })).body.sent).toEqual([
      'ben',
    ])
  })

  it('rejects a bad body and needs sign-in', async () => {
    expect((await send({ platform: 'twitter', id: 'sauce', to: ['ana'] })).status).toBe(401)
    viewer = PETE
    expect((await send({ platform: 'twitter', id: 'sauce' })).status).toBe(400)
    expect((await send({ platform: 'twitter', id: 'sauce', to: ['a b'] })).status).toBe(400)
    expect((await targets('twitter', '')).status).toBe(400)
  })

  it('is rate limited to 60 a minute, with Retry-After', async () => {
    viewer = PETE
    for (let i = 0; i < 60; i++) await send({ platform: 'twitter', id: 'sauce', to: ['ben'] })
    const busy = await send({ platform: 'twitter', id: 'sauce', to: ['ben'] })
    expect(busy.status).toBe(429)
    expect(busy.body.code).toBe('busy')
    expect(Number(busy.headers.get('Retry-After'))).toBeGreaterThan(0)
  })

  it('leads Ana’s New with "Pete sent you this" until she sees it, with his note', async () => {
    // Older than New's window, and already seen by Ana once: a send brings it back.
    save(BEN, 'old', 24 * 30)
    save(PETE, 'old', 24 * 30)
    testInstance.db
      .insert(schema.postViews)
      .values({ userId: ANA, platform: 'twitter', postId: 'old', seenAt: new Date().toISOString() })
      .run()
    save(BEN, 'fresh1', 0.1)
    save(JO, 'fresh2', 0.2)
    viewer = PETE
    await send({ platform: 'twitter', id: 'old', to: ['ana'], note: 'this is so you' })

    viewer = ANA
    const items = await newFeed()
    expect(items[0].id).toBe('old')
    expect(items[0].why).toBe('Pete sent you this')
    expect(items[0].whyReasons[0]).toMatchObject({
      kind: 'sent',
      text: 'Pete sent you this',
      username: 'pete',
    })
    expect(items[0].savers.find((s) => s.username === 'pete')?.note).toBe('this is so you')

    // Seen: it stops leading (and, already seen, leaves New).
    const { POST } = await import('@/app/api/views/route')
    await POST(json('/api/views', 'POST', { posts: [{ platform: 'twitter', id: 'old' }] }))
    __resetBlendSnapshots()
    expect((await newFeed()).map((i) => i.id)).not.toContain('old')
  })

  it('shows a sent text post even to someone who only watches videos and photos', async () => {
    save(BEN, 'words', 1)
    save(JO, 'clip', 0.5, {
      category: 'video',
    })
    viewer = PETE
    await send({ platform: 'twitter', id: 'words', to: ['ana'] })

    viewer = ANA
    const { GET } = await import('@/app/api/feed/blend/route')
    const res = await GET(
      new NextRequest(`${BASE}/api/feed/blend?mode=new&limit=50&types=video,photo`),
    )
    const ids = ((await res.json()).items as Item[]).map((i) => i.id)
    expect(ids[0]).toBe('words')
  })

  it('reaches the phone the same way', async () => {
    save(BEN, 'fresh1', 0.1)
    const pete = createAccessKey(PETE, 'Phone', 'phone')!.key
    const ana = createAccessKey(ANA, 'Phone', 'phone')!.key
    const { GET, POST } = await import('@/app/api/app/send/route')
    const auth = (key: string) => ({ authorization: `Bearer ${key}` })
    const got = await GET(
      json('/api/app/send?platform=twitter&id=sauce', 'GET', undefined, auth(pete)),
    )
    expect(got.status).toBe(200)
    expect((await got.json()).sendable).toBe(true)
    const sent = await POST(
      json('/api/app/send', 'POST', { platform: 'twitter', id: 'sauce', to: ['ana'] }, auth(pete)),
    )
    expect(await sent.json()).toEqual({ sent: ['ana'], skipped: [] })
    expect((await GET(json('/api/app/send?platform=twitter&id=sauce', 'GET'))).status).toBe(401)

    const feed = await import('@/app/api/app/feed/route')
    const res = await feed.GET(
      json('/api/app/feed?mode=new&types=video,photo,text,article', 'GET', undefined, auth(ana)),
    )
    const body = await res.json()
    expect(body.items[0]).toMatchObject({ id: 'sauce', why: 'Pete sent you this' })
    expect(body.items[0].whyReasons[0]).toEqual({
      kind: 'sent',
      text: 'Pete sent you this',
      username: 'pete',
    })
  })

  it('clears every send to or from an account when it is deleted', async () => {
    viewer = PETE
    await send({ platform: 'twitter', id: 'sauce', to: ['ana', 'ben'] })
    save(ANA, 'steak', 1)
    viewer = ANA
    await send({ platform: 'twitter', id: 'steak', to: ['pete'] })
    expect(testInstance.db.select().from(schema.postSends).all()).toHaveLength(3)
    viewer = PETE
    const { DELETE } = await import('@/app/api/account/route')
    expect((await DELETE(json('/api/account', 'DELETE'))).status).toBe(200)
    expect(testInstance.db.select().from(schema.postSends).all()).toHaveLength(0)
  })
})

// ——— Forming moments ———

function noise(seed: number, dims: number): Float32Array {
  const v = new Float32Array(dims)
  let t = seed * 9973 + 1
  for (let i = 0; i < dims; i++) {
    t = (t * 16807) % 2147483647
    v[i] = (t / 2147483647 - 0.5) * 0.12
  }
  return v
}

function topic(axis: number, seed: number, dims = 768): Float32Array {
  const v = noise(seed, dims)
  v[axis] += 1
  return normalize(v)
}

async function understood(id: string, vector: Float32Array) {
  await saveEmbedding({
    platform: 'twitter',
    postId: id,
    kind: 'text',
    contentHash: `h-${id}`,
    status: 'ok',
    vector,
  })
}

/** Background posts so regrouping has something to centre on, and a frog moment. */
async function seedLibrary() {
  for (let i = 0; i < 6; i++) {
    save(ANA, `frog${i}`, 1, { text: `frog video number ${i}` })
    await understood(`frog${i}`, topic(0, i + 1))
  }
  save(BEN, 'frog0', 1, { text: 'frog video number 0' })
  for (let i = 0; i < 50; i++) {
    save(ANA, `bg${i}`, 1, { text: `something else ${i}` })
    await understood(`bg${i}`, topic(10 + i, 200 + i))
  }
}

/** Jo and Ben save two synth posts after the engine has started: a forming group. */
async function seedForming() {
  await seedLibrary()
  await __moments.recompute()
  save(JO, 'synth1', 0, { text: 'kitchen synth patch one' })
  await understood('synth1', topic(3, 401))
  await __moments.processNewSaves()
  save(JO, 'synth2', 0, { text: 'kitchen synth patch two' })
  await understood('synth2', topic(3, 402))
  // Ben's own save is private: never a face.
  save(BEN, 'synth2', 0, { text: 'kitchen synth patch two', isPrivate: true })
  await __moments.processNewSaves()
}

async function moments(): Promise<{
  forming: { id: string; people?: { username: string }[]; alert?: boolean }[]
}> {
  const { GET } = await import('@/app/api/moments/route')
  const res = await GET(new NextRequest(`${BASE}/api/moments`))
  return res.json()
}

async function bell(id: string, on: boolean) {
  const route = await import('@/app/api/moments/forming/[id]/alert/route')
  const res = await (on ? route.PUT : route.DELETE)(
    json(`/api/moments/forming/${id}/alert`, on ? 'PUT' : 'DELETE'),
    { params: Promise.resolve({ id }) },
  )
  return { status: res.status, body: await res.json() }
}

async function alerts() {
  const { GET } = await import('@/app/api/moments/alerts/route')
  const res = await GET(json('/api/moments/alerts', 'GET'))
  return { status: res.status, body: await res.json() }
}

describe('forming moments: faces and the bell', () => {
  it('names visible savers to members only; strangers get no people or alert', async () => {
    await seedForming()
    viewer = null
    const signedOut = await moments()
    expect(signedOut.forming).toHaveLength(1)
    expect(signedOut.forming[0]).not.toHaveProperty('people')
    expect(signedOut.forming[0]).not.toHaveProperty('alert')
    expect(JSON.stringify(signedOut)).not.toContain('"jo"')

    viewer = PETE
    const [f] = (await moments()).forming
    expect(f.people?.map((p) => p.username)).toEqual(['jo'])
    expect(f.alert).toBe(false)
    expect(Object.keys(f.people![0]).sort()).toEqual(['avatarUrl', 'name', 'username'])
  })

  it('rings per user, and each subscriber gets one alert when it goes live', async () => {
    await seedForming()
    viewer = PETE
    const [f] = (await moments()).forming
    expect(await bell(f.id, true)).toEqual({ status: 200, body: { alert: true } })
    expect((await moments()).forming[0].alert).toBe(true)
    viewer = ANA
    expect((await moments()).forming[0].alert).toBe(false)
    expect((await alerts()).body.alerts).toEqual([])

    // Ana saves one too: two people now, it goes live.
    save(ANA, 'synth3', 0, { text: 'kitchen synth patch three' })
    await understood('synth3', topic(3, 403))
    await __moments.processNewSaves()
    const live = (await getMomentsSnapshot()).moments.find((m) => m.title !== 'Frog')
    expect(live).toBeTruthy()

    expect((await alerts()).body.alerts).toEqual([])
    viewer = PETE
    const mine = (await alerts()).body.alerts
    expect(mine).toEqual([
      {
        id: expect.stringMatching(/^a\d+$/),
        slug: live!.slug,
        title: live!.title,
        at: expect.any(String),
      },
    ])

    // Seen by someone else: nothing changes. Seen by Pete: gone.
    viewer = ANA
    const { POST } = await import('@/app/api/moments/alerts/seen/route')
    await POST(json('/api/moments/alerts/seen', 'POST', { ids: [mine[0].id] }))
    viewer = PETE
    expect((await alerts()).body.alerts).toHaveLength(1)
    const seen = await POST(json('/api/moments/alerts/seen', 'POST', { ids: [mine[0].id] }))
    expect(await seen.json()).toEqual({ ok: true })
    expect((await alerts()).body.alerts).toEqual([])
  })

  it('carries the bell when the group merges, and says forming_gone for a vanished one', async () => {
    await seedForming()
    viewer = PETE
    const [f] = (await moments()).forming
    await bell(f.id, true)
    expect(await bell('fnope-1', true)).toEqual({
      status: 404,
      body: { error: expect.any(String), code: 'forming_gone' },
    })
    const { carryFormingSubscriptions, formingAlertsFor } = await import('@/lib/moments/alerts')
    carryFormingSubscriptions([{ from: f.id, to: 'fnew-2' }])
    expect([...formingAlertsFor(PETE, [f.id, 'fnew-2'])]).toEqual(['fnew-2'])
    expect(await bell(f.id, false)).toEqual({ status: 200, body: { alert: false } })
  })

  it('works from the phone, with people and alert on /api/app/live', async () => {
    await seedForming()
    const key = createAccessKey(PETE, 'Phone', 'phone')!.key
    const auth = { authorization: `Bearer ${key}` }
    const live = await import('@/app/api/app/live/route')
    const body = await (await live.GET(json('/api/app/live', 'GET', undefined, auth))).json()
    expect(body.forming[0]).toMatchObject({ people: [{ username: 'jo' }], alert: false })
    const route = await import('@/app/api/app/live/forming/[id]/alert/route')
    const put = await route.PUT(
      json(`/api/app/live/forming/${body.forming[0].id}/alert`, 'PUT', undefined, auth),
    )
    expect(await put.json()).toEqual({ alert: true })
    const again = await (await live.GET(json('/api/app/live', 'GET', undefined, auth))).json()
    expect(again.forming[0].alert).toBe(true)
    const appAlerts = await import('@/app/api/app/alerts/route')
    expect(
      await (await appAlerts.GET(json('/api/app/alerts', 'GET', undefined, auth))).json(),
    ).toEqual({ alerts: [] })
  })
})

// ——— Like … you kept ———

describe('the thumbnail beside "Like … you kept"', () => {
  it('names the viewer’s own kept post it’s most like, with a poster address', async () => {
    // Pete's kept posts: frogs. Ana's new frog is like them.
    for (let i = 0; i < 4; i++) {
      save(PETE, `kept${i}`, 48)
      testInstance.db
        .insert(schema.bookmarkMedia)
        .values({
          id: `m${i}`,
          userId: PETE,
          platform: 'twitter',
          bookmarkId: `kept${i}`,
          mediaType: 'photo',
          originalUrl: `https://pbs.twimg.com/media/k${i}.jpg`,
          previewUrl: `https://pbs.twimg.com/media/k${i}.jpg`,
        })
        .run()
      await understood(`kept${i}`, topic(0, 10 + i))
    }
    save(ANA, 'newfrog', 1)
    await understood('newfrog', topic(0, 20))
    for (let i = 0; i < 6; i++) {
      save(BEN, `other${i}`, 1)
      await understood(`other${i}`, topic(20 + i, 30 + i))
    }
    viewer = PETE
    const items = await newFeed()
    const frog = items.find((i) => i.id === 'newfrog')!
    const like = frog.whyReasons.find((r) => r.kind === 'like')
    expect(like?.post).toMatchObject({ platform: 'twitter', id: expect.stringMatching(/^kept\d$/) })
    expect(typeof like?.post?.posterUrl).toBe('string')
    expect(
      like?.post?.posterUrl?.startsWith('/') || like?.post?.posterUrl?.startsWith('http'),
    ).toBe(true)
  })
})

// ——— Keep this channel ———

describe('keep a From everyone channel', () => {
  beforeEach(() => {
    save(MUM, 'banned-post', 1)
    save(ANA, 'steak', 2)
    save(BEN, 'pasta', 3)
    save(PETE, 'pasta', 4)
    save(JO, 'hidden', 1, { isPrivate: true })
    testInstance.db
      .insert(schema.groupChannels)
      .values({
        slug: 'food-x1',
        name: 'Food you’ll cook one day',
        size: 4,
        postKeys: JSON.stringify([
          'twitter:steak',
          'twitter:pasta',
          'twitter:hidden',
          'twitter:banned-post',
        ]),
        savers: '{}',
        position: 0,
        savesAtCompute: 0,
        computedAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        modelVersion: 'x',
      })
      .run()
  })

  it('names the tag after the channel', () => {
    expect(groupKeepTag('Food you’ll cook one day', 'food-x1')).toBe('food-youll-cook')
    expect(groupKeepTag("Food you'll cook one day", 'food-x1')).toBe('food-youll-cook')
  })

  it('saves what you lack (not private), tags only visible posts, and says kept', async () => {
    viewer = PETE
    const { POST } = await import('@/app/api/channels/group/[slug]/keep/route')
    const res = await POST(json('/api/channels/group/food-x1/keep', 'POST'), {
      params: Promise.resolve({ slug: 'food-x1' }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      tag: 'food-youll-cook',
      url: '/t/pete/food-youll-cook',
      added: 2,
    })
    const mine = testInstance.db.all<{ id: string; source: string; is_private: number }>(
      sql`SELECT id, source, is_private FROM bookmarks WHERE user_id = ${PETE} ORDER BY id`,
    )
    expect(mine).toEqual([
      { id: 'pasta', source: 'sync', is_private: 0 },
      { id: 'steak', source: 'channel_keep', is_private: 0 },
    ])
    const tags = testInstance.db.all<{ bookmark_id: string; tag: string }>(
      sql`SELECT bookmark_id, tag FROM bookmark_tags WHERE user_id = ${PETE} ORDER BY bookmark_id`,
    )
    expect(tags).toEqual([
      { bookmark_id: 'pasta', tag: 'food-youll-cook' },
      { bookmark_id: 'steak', tag: 'food-youll-cook' },
    ])
    // Not public.
    expect(testInstance.db.select().from(schema.tagShares).all()).toEqual([])

    const queue = await import('@/app/api/channels/group/[slug]/route')
    const q = await queue.GET(json('/api/channels/group/food-x1', 'GET'), {
      params: Promise.resolve({ slug: 'food-x1' }),
    })
    expect((await q.json()).kept).toEqual({
      tag: 'food-youll-cook',
      url: '/t/pete/food-youll-cook',
    })

    viewer = ANA
    const other = await queue.GET(json('/api/channels/group/food-x1', 'GET'), {
      params: Promise.resolve({ slug: 'food-x1' }),
    })
    expect((await other.json()).kept).toBeNull()
  })

  it("follows the keeper's Just for me by default for new copies", async () => {
    testInstance.db
      .insert(schema.userPreferences)
      .values({ userId: PETE, key: 'save.privateDefault', value: 'true' })
      .run()
    viewer = PETE
    const { POST } = await import('@/app/api/channels/group/[slug]/keep/route')
    const res = await POST(json('/api/channels/group/food-x1/keep', 'POST'), {
      params: Promise.resolve({ slug: 'food-x1' }),
    })
    expect(res.status).toBe(200)
    const mine = testInstance.db.all<{ id: string; is_private: number }>(
      sql`SELECT id, is_private FROM bookmarks WHERE user_id = ${PETE} AND source = 'channel_keep'`,
    )
    expect(mine).toEqual([{ id: 'steak', is_private: 1 }])
  })

  it('skips posts already at five tags, and 404s an unknown channel', async () => {
    for (const t of ['a', 'b', 'c', 'd', 'e']) {
      testInstance.db
        .insert(schema.bookmarkTags)
        .values({ userId: PETE, platform: 'twitter', bookmarkId: 'pasta', tag: t })
        .run()
    }
    viewer = PETE
    const { POST } = await import('@/app/api/channels/group/[slug]/keep/route')
    const res = await POST(json('/api/channels/group/food-x1/keep', 'POST'), {
      params: Promise.resolve({ slug: 'food-x1' }),
    })
    expect((await res.json()).added).toBe(1)
    const missing = await POST(json('/api/channels/group/nope/keep', 'POST'), {
      params: Promise.resolve({ slug: 'nope' }),
    })
    expect(missing.status).toBe(404)
  })

  it('works from the phone, and the phone queue says kept', async () => {
    const key = createAccessKey(PETE, 'Phone', 'phone')!.key
    const auth = { authorization: `Bearer ${key}` }
    const { POST } = await import('@/app/api/app/channels/[kind]/[slug]/keep/route')
    const res = await POST(json('/api/app/channels/group/food-x1/keep', 'POST', undefined, auth))
    expect(await res.json()).toMatchObject({ tag: 'food-youll-cook', added: 2 })
    const friend = await POST(json('/api/app/channels/friend/ana/keep', 'POST', undefined, auth))
    expect(friend.status).toBe(404)
    const { GET } = await import('@/app/api/app/channels/[kind]/[slug]/route')
    const q = await GET(json('/api/app/channels/group/food-x1', 'GET', undefined, auth), {
      params: Promise.resolve({ kind: 'group', slug: 'food-x1' }),
    })
    expect((await q.json()).kept).toEqual({
      tag: 'food-youll-cook',
      url: '/t/pete/food-youll-cook',
    })
  })

  it('leaves from the phone: the channel goes, with only the saves the keep added', async () => {
    const key = createAccessKey(PETE, 'Phone', 'phone')!.key
    const auth = { authorization: `Bearer ${key}` }
    const route = await import('@/app/api/app/channels/[kind]/[slug]/keep/route')
    await route.POST(json('/api/app/channels/group/food-x1/keep', 'POST', undefined, auth))
    const left = await route.DELETE(
      json('/api/app/channels/group/food-x1/keep', 'DELETE', undefined, auth),
    )
    expect(left.status).toBe(200)
    expect(await left.json()).toEqual({ removed: 1 })
    // Pete's own pasta stays; the steak the keep copied for him goes.
    const mine = testInstance.db.all<{ id: string }>(
      sql`SELECT id FROM bookmarks WHERE user_id = ${PETE} ORDER BY id`,
    )
    expect(mine).toEqual([{ id: 'pasta' }])
    expect(
      testInstance.db.all(
        sql`SELECT tag FROM bookmark_tags WHERE user_id = ${PETE} AND tag = 'food-youll-cook'`,
      ),
    ).toEqual([])
    const missing = await route.DELETE(
      json('/api/app/channels/group/nope/keep', 'DELETE', undefined, auth),
    )
    expect(missing.status).toBe(404)
  })
})
