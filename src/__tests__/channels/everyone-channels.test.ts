import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, type TestDbInstance } from '../api/setup'

/**
 * Channels from everyone (docs/specs/friends-feed.md): From everyone (the
 * server's saves grouped) and Your people (one channel per friend), for
 * members only. Ben keeps some posts just for himself and Cal is banned;
 * neither may surface anywhere, and Ana never gets her own channel as a
 * friend.
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
vi.mock('@/lib/semantic/supervisor', () => ({
  embedQueries: async (prompts: string[]) => nameVectors(prompts),
  embedQuery: vi.fn(),
  wakeJobs: () => {},
  jobActivity: () => null,
  startSemanticProcesses: () => {},
}))

import { saveEmbedding } from '@/lib/semantic/store'
import {
  __resetGroupChannels,
  computeGroupChannels,
  getGroupChannels,
  groupChannelKeys,
  groupChannelsFor,
} from '@/lib/channels/group'
import { friendChannelKeys, friendChannels } from '@/lib/channels/friends'
import { listMembers } from '@/lib/people/members'
import { markSeen } from '@/lib/feed/views'
import { __resetRateLimitState } from '@/lib/rate-limit'

const ANA = 'u_ana'
const BEN = 'u_ben'
const CAL = 'u_cal'
const BASE = 'https://adhx.test'

function unit(weights: Record<number, number>): Float32Array {
  const v = new Float32Array(768)
  for (const [i, w] of Object.entries(weights)) v[Number(i)] = w
  const n = Math.hypot(...v)
  return v.map((x) => x / n)
}

/** Two clear topics: dimension 0 ("cats") and dimension 1 ("synths"). */
const topic = (t: 0 | 1, i: number) => unit({ [t]: 1, [10 + (i % 7)]: 0.15 })

function nameVectors(prompts: string[]): Float32Array[] {
  return prompts.map((p, i) =>
    p.endsWith(': Cats')
      ? unit({ 0: 1 })
      : p.endsWith(': Synths')
        ? unit({ 1: 1 })
        : unit({ [100 + (i % 600)]: 1 }),
  )
}
const deps = { embedNames: async (p: string[]) => nameVectors(p), chooseName: async () => null }

let clock = Date.parse('2026-10-18T10:00:00.000Z')
function save(userId: string, id: string, extra: Partial<schema.NewBookmark> = {}) {
  clock += 60_000
  testInstance.db
    .insert(schema.bookmarks)
    .values(
      createTestBookmark(userId, id, {
        text: `post ${id}`,
        processedAt: new Date(clock).toISOString(),
        ...extra,
      }),
    )
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

function ban(userId: string) {
  testInstance.db
    .insert(schema.userBans)
    .values({ userId, createdAt: new Date().toISOString(), createdBy: ANA })
    .run()
}

const allKeys = (views: { keys: string[] }[]) => views.flatMap((v) => v.keys)

beforeEach(async () => {
  testInstance = createTestDb()
  viewer = null
  __resetGroupChannels()
  __resetRateLimitState()
  testInstance.db
    .insert(schema.users)
    .values([
      { id: ANA, username: 'ana', displayName: 'Ana' },
      { id: BEN, username: 'ben', displayName: 'Ben' },
      { id: CAL, username: 'cal', displayName: 'Cal' },
    ] as never)
    .run()
  // Sixteen visible posts over two topics, split between Ana and Ben.
  for (const t of [0, 1] as const) {
    for (let i = 0; i < 8; i++) {
      const id = `t${t}p${i}`
      save(i % 2 === 0 ? ANA : BEN, id)
      await understood(id, topic(t, i))
    }
  }
  // One post they both saved.
  save(ANA, 't1p1')
  // Ben's private saves, a quoted copy and a banned member's save: right on topic, never shown.
  for (const id of ['secret1', 'secret2']) {
    save(BEN, id, { isPrivate: true })
    await understood(id, topic(0, 3))
  }
  save(BEN, 'quoted1', { source: 'quoted' })
  await understood('quoted1', topic(0, 4))
  save(CAL, 'banned1')
  await understood('banned1', topic(1, 2))
  ban(CAL)
})

afterEach(() => testInstance.close())

describe('From everyone (group channels)', () => {
  it('groups everyone’s visible saves, without private, quoted or banned posts', async () => {
    const views = await computeGroupChannels(deps)
    expect(views.map((v) => v.name).sort()).toEqual(['Cats', 'Synths'])
    const keys = allKeys(views)
    expect(keys).toHaveLength(16)
    for (const hidden of ['secret1', 'secret2', 'quoted1', 'banned1']) {
      expect(keys).not.toContain(`twitter:${hidden}`)
    }
    const stored = testInstance.db.select().from(schema.groupChannels).all()
    expect(stored).toHaveLength(2)
    const savers = JSON.parse(stored[0].savers) as Record<string, number>
    expect(Object.keys(savers).sort()).toEqual([ANA, BEN].sort())
  })

  it('re-checks on read: a post made private or a newly banned saver drops out', async () => {
    await computeGroupChannels(deps)
    // Ben makes one of his posts private; it was his alone.
    testInstance.sqlite.exec(`UPDATE bookmarks SET is_private = 1 WHERE id = 't0p1'`)
    let cats = (await groupChannelsFor(ANA, listMembers(ANA), deps)).find((c) => c.slug === 'cats')!
    expect(cats.keys).not.toContain('twitter:t0p1')
    expect(cats.size).toBe(7)
    expect((await groupChannelKeys('cats'))!.keys).not.toContain('twitter:t0p1')

    ban(BEN)
    cats = (await groupChannelsFor(ANA, listMembers(ANA), deps)).find((c) => c.slug === 'cats')!
    expect(cats.members).toBe(1)
    expect(cats.savers.map((s) => s.username)).toEqual(['ana'])
    expect(cats.keys.every((k) => ['0', '2', '4', '6'].includes(k.slice(-1)))).toBe(true)
  })

  it('counts members, shows up to three faces and what’s new to the viewer', async () => {
    await computeGroupChannels(deps)
    const channels = await groupChannelsFor(ANA, listMembers(ANA), deps)
    const synths = channels.find((c) => c.slug === 'synths')!
    expect(synths.members).toBe(2)
    expect(synths.savers.map((s) => s.username).sort()).toEqual(['ana', 'ben'])
    expect(synths.savers.find((s) => s.isYou)?.username).toBe('ana')
    // Ben saved 4 synth posts; Ana also saved one of them.
    expect(synths.newCount).toBe(3)
    expect(await groupChannelsFor('', listMembers(''), deps)).toEqual([])
  })

  it('plays newest save first', async () => {
    await computeGroupChannels(deps)
    const { keys } = (await groupChannelKeys('synths'))!
    // Ana's re-save of t1p1 is the newest save in synths.
    expect(keys[0]).toBe('twitter:t1p1')
    expect(keys.slice(1)).toEqual([
      'twitter:t1p7',
      'twitter:t1p6',
      'twitter:t1p5',
      'twitter:t1p4',
      'twitter:t1p3',
      'twitter:t1p2',
      'twitter:t1p0',
    ])
  })

  it('reuses stored channels, and recomputes after 10 new visible saves or a model change', async () => {
    const chooseName = vi.fn(async () => null)
    await getGroupChannels({ ...deps, chooseName })
    const calls = chooseName.mock.calls.length
    expect(calls).toBeGreaterThan(0)
    await getGroupChannels({ ...deps, chooseName })
    expect(chooseName.mock.calls.length).toBe(calls)

    // Private saves don't count as new.
    for (let i = 0; i < 12; i++) save(BEN, `quiet${i}`, { isPrivate: true })
    await getGroupChannels({ ...deps, chooseName })
    expect(chooseName.mock.calls.length).toBe(calls)

    for (let i = 0; i < 10; i++) save(ANA, `loud${i}`)
    await getGroupChannels({ ...deps, chooseName })
    await vi.waitFor(() => expect(chooseName.mock.calls.length).toBeGreaterThan(calls))

    await vi.waitFor(async () => expect(await getGroupChannels(deps)).toHaveLength(2))
    const again = chooseName.mock.calls.length
    testInstance.sqlite.exec(`UPDATE group_channels SET model_version = 'old'`)
    await getGroupChannels({ ...deps, chooseName })
    await vi.waitFor(() => expect(chooseName.mock.calls.length).toBeGreaterThan(again))
  })
})

describe('Your people (friend channels)', () => {
  it('Ana sees Ben’s channel without his private saves, and never her own', () => {
    const friends = friendChannels(ANA, listMembers(ANA))
    expect(friends.map((f) => f.username)).toEqual(['ben'])
    const ben = friends[0]
    // 8 visible posts; his private and quoted ones don't count.
    expect(ben.size).toBe(8)
    // Ana already saved t1p1.
    expect(ben.newCount).toBe(7)
    expect(ben.coverKeys).toHaveLength(3)

    const queue = friendChannelKeys(ANA, listMembers(ANA), 'ben')!
    expect(queue.keys).toHaveLength(8)
    expect(queue.keys).not.toContain('twitter:secret1')
    expect(queue.keys).not.toContain('twitter:quoted1')
    expect(friendChannelKeys(ANA, listMembers(ANA), 'ben', { onlyNew: true })!.keys).not.toContain(
      'twitter:t1p1',
    )
    expect(friendChannelKeys(ANA, listMembers(ANA), 'ana')).toBeNull()
    expect(friendChannelKeys(ANA, listMembers(ANA), 'cal')).toBeNull()
    expect(friendChannels('', [])).toEqual([])
  })

  it('covers a friend with kept posts first, then their newest', () => {
    const newest = friendChannels(ANA, listMembers(ANA))[0].coverKeys
    const older = friendChannelKeys(ANA, listMembers(ANA), 'ben')!.keys.at(-1)!
    expect(newest).not.toContain(older)
    const [platform, id] = older.split(':')
    testInstance.sqlite
      .prepare(
        `INSERT INTO kept_files (platform, post_id, slot, path, mime, bytes, created_at)
         VALUES (?, ?, 'photo-1', 'x/photo-1.jpg', 'image/jpeg', 1, ?)`,
      )
      .run(platform, id, new Date().toISOString())
    const covers = friendChannels(ANA, listMembers(ANA))[0].coverKeys
    expect(covers[0]).toBe(older)
    expect(covers.slice(1)).toEqual(newest.slice(0, 2))
  })

  it('counts what the viewer has seen in the feed as not new', () => {
    // The same seen list New writes (`POST /api/views` → `markSeen`).
    markSeen(ANA, [{ platform: 'twitter', id: 't0p1' }])
    expect(friendChannels(ANA, listMembers(ANA))[0].newCount).toBe(6)
  })
})

describe('routes', () => {
  async function json(res: Response) {
    return { status: res.status, body: await res.json() }
  }

  it('need sign-in', async () => {
    const { GET: all } = await import('@/app/api/channels/route')
    const { GET: group } = await import('@/app/api/channels/group/[slug]/route')
    const { GET: friend } = await import('@/app/api/channels/friend/[username]/route')
    const { GET: app } = await import('@/app/api/app/channels/route')
    const { GET: appOne } = await import('@/app/api/app/channels/[kind]/[slug]/route')
    expect((await all(new NextRequest(`${BASE}/api/channels`))).status).toBe(401)
    expect(
      (
        await group(new NextRequest(`${BASE}/api/channels/group/cats`), {
          params: Promise.resolve({ slug: 'cats' }),
        })
      ).status,
    ).toBe(401)
    expect(
      (
        await friend(new NextRequest(`${BASE}/api/channels/friend/ben`), {
          params: Promise.resolve({ username: 'ben' }),
        })
      ).status,
    ).toBe(401)
    expect((await app(new Request(`${BASE}/api/app/channels`))).status).toBe(401)
    expect(
      (
        await appOne(new Request(`${BASE}/api/app/channels/friend/ben`), {
          params: Promise.resolve({ kind: 'friend', slug: 'ben' }),
        })
      ).status,
    ).toBe(401)
    const bad = await app(
      new Request(`${BASE}/api/app/channels`, { headers: { authorization: 'Bearer adhx_nope' } }),
    )
    expect(bad.status).toBe(401)
  })

  it('GET /api/channels adds group and friends', async () => {
    await computeGroupChannels(deps)
    viewer = ANA
    const { GET } = await import('@/app/api/channels/route')
    const { status, body } = await json(await GET(new NextRequest(`${BASE}/api/channels`)))
    expect(status).toBe(200)
    expect(body.group.map((c: { slug: string }) => c.slug).sort()).toEqual(['cats', 'synths'])
    expect(body.group[0]).toMatchObject({
      members: expect.any(Number),
      newCount: expect.any(Number),
    })
    expect(body.group[0].covers.length).toBeGreaterThan(0)
    expect(body.friends).toEqual([
      expect.objectContaining({ username: 'ben', name: 'Ben', size: 8, newCount: 7 }),
    ])
    expect(body.friends[0].covers).toHaveLength(3)
    expect(JSON.stringify(body)).not.toContain(BEN)
    expect(JSON.stringify(body)).not.toContain('secret1')
    expect(body.canInvite).toBe(false)
  })

  it('friend and group queues keep the auto queue’s shape', async () => {
    await computeGroupChannels(deps)
    viewer = ANA
    const { GET: friend } = await import('@/app/api/channels/friend/[username]/route')
    const res = await json(
      await friend(new NextRequest(`${BASE}/api/channels/friend/ben?new=1`), {
        params: Promise.resolve({ username: 'ben' }),
      }),
    )
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      name: 'Ben’s saves',
      friend: { username: 'ben', size: 8, newCount: 7 },
      total: 7,
      nextOffset: null,
    })
    expect(res.body.items[0].post.savers[0]).toMatchObject({ username: 'ben' })
    expect(
      (
        await friend(new NextRequest(`${BASE}/api/channels/friend/ana`), {
          params: Promise.resolve({ username: 'ana' }),
        })
      ).status,
    ).toBe(404)

    const { GET: group } = await import('@/app/api/channels/group/[slug]/route')
    const g = await json(
      await group(new NextRequest(`${BASE}/api/channels/group/synths`), {
        params: Promise.resolve({ slug: 'synths' }),
      }),
    )
    expect(g.status).toBe(200)
    expect(g.body).toMatchObject({ name: 'Synths', total: 8, understood: true, close: true })
    expect(
      (
        await group(new NextRequest(`${BASE}/api/channels/group/nope`), {
          params: Promise.resolve({ slug: 'nope' }),
        })
      ).status,
    ).toBe(404)
  })

  it('phone: channels overview and queues as PhonePosts', async () => {
    await computeGroupChannels(deps)
    testInstance.db
      .insert(schema.bookmarkTags)
      .values({ userId: ANA, platform: 'twitter', bookmarkId: 't0p0', tag: 'my-cats' })
      .run()
    // Pair a phone for Ana.
    viewer = ANA
    const { POST: pairing } = await import('@/app/api/app/pairing/route')
    const { code } = await (
      await pairing(new NextRequest(`${BASE}/api/app/pairing`, { method: 'POST' }))
    ).json()
    const { POST: pair } = await import('@/app/api/app/pair/route')
    const { key } = await (
      await pair(
        new NextRequest(`${BASE}/api/app/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, name: 'Phone' }),
        }),
      )
    ).json()
    viewer = null
    const auth = { headers: { authorization: `Bearer ${key}` } }

    const { GET } = await import('@/app/api/app/channels/route')
    const overview = await json(await GET(new Request(`${BASE}/api/app/channels`, auth)))
    expect(overview.status).toBe(200)
    expect(Object.keys(overview.body).sort()).toEqual(['friends', 'group', 'mine'])
    expect(overview.body.friends[0]).toMatchObject({ username: 'ben', size: 8 })
    expect(overview.body.mine).toEqual([
      expect.objectContaining({ slug: 'my-cats', name: 'My cats', kind: 'channel', size: 1 }),
    ])
    for (const c of [...overview.body.group, ...overview.body.friends]) {
      for (const url of c.covers) expect(url).toMatch(/^(\/|https?:)/)
    }

    const { GET: one } = await import('@/app/api/app/channels/[kind]/[slug]/route')
    const friend = await json(
      await one(new Request(`${BASE}/api/app/channels/friend/ben`, auth), {
        params: Promise.resolve({ kind: 'friend', slug: 'ben' }),
      }),
    )
    expect(friend.status).toBe(200)
    expect(friend.body.items).toHaveLength(8)
    expect(friend.body.items[0]).toMatchObject({ platform: 'twitter', savers: expect.any(Array) })
    expect(friend.body.items.map((i: { id: string }) => i.id)).not.toContain('secret1')

    const group = await json(
      await one(new Request(`${BASE}/api/app/channels/group/cats`, auth), {
        params: Promise.resolve({ kind: 'group', slug: 'cats' }),
      }),
    )
    expect(group.body.items).toHaveLength(8)
    const mine = await json(
      await one(new Request(`${BASE}/api/app/channels/mine/my-cats`, auth), {
        params: Promise.resolve({ kind: 'mine', slug: 'my-cats' }),
      }),
    )
    expect(mine.body.items.map((i: { id: string }) => i.id)).toEqual(['t0p0'])
    const missing = await one(new Request(`${BASE}/api/app/channels/elsewhere/x`, auth), {
      params: Promise.resolve({ kind: 'elsewhere', slug: 'x' }),
    })
    expect(missing.status).toBe(404)

    // A signed-in session works too.
    viewer = ANA
    expect((await GET(new Request(`${BASE}/api/app/channels`))).status).toBe(200)
  })

  it('notes: members see them on channel queues (web and phone), never a private save’s', async () => {
    testInstance.sqlite.exec(`
      UPDATE bookmarks SET note = 'you’re welcome' WHERE user_id = 'u_ben' AND id = 't1p1';
      UPDATE bookmarks SET note = 'whisper words' WHERE user_id = 'u_ben' AND id = 'secret1';
      UPDATE bookmarks SET note = 'banned words' WHERE user_id = 'u_cal' AND id = 'banned1';
    `)
    await computeGroupChannels(deps)
    viewer = ANA
    const { GET: friend } = await import('@/app/api/channels/friend/[username]/route')
    const f = await friend(new NextRequest(`${BASE}/api/channels/friend/ben`), {
      params: Promise.resolve({ username: 'ben' }),
    })
    const fBody = await f.json()
    const t1p1 = fBody.items.find((i: { post: { id: string } }) => i.post.id === 't1p1')
    expect(t1p1.post.savers).toContainEqual(
      expect.objectContaining({ username: 'ben', note: 'you’re welcome' }),
    )
    const { GET: group } = await import('@/app/api/channels/group/[slug]/route')
    const g = await group(new NextRequest(`${BASE}/api/channels/group/synths`), {
      params: Promise.resolve({ slug: 'synths' }),
    })
    const gText = await g.text()
    expect(gText).toContain('you’re welcome')
    const { GET: all } = await import('@/app/api/channels/route')
    const overview = await (await all(new NextRequest(`${BASE}/api/channels`))).text()
    // Faces on a channel card aren't one post's: no notes there.
    expect(overview).not.toMatch(/welcome|whisper|banned words/)
    for (const text of [JSON.stringify(fBody), gText]) {
      expect(text).not.toMatch(/whisper|banned words/)
    }

    // The phone's queues carry the same notes as PhonePosts.
    const { createAccessKey } = await import('@/lib/auth/access-keys')
    const key = createAccessKey(ANA, 'Phone', 'phone')!.key
    viewer = null
    const { GET: one } = await import('@/app/api/app/channels/[kind]/[slug]/route')
    const phone = await (
      await one(
        new Request(`${BASE}/api/app/channels/friend/ben`, {
          headers: { authorization: `Bearer ${key}` },
        }),
        { params: Promise.resolve({ kind: 'friend', slug: 'ben' }) },
      )
    ).json()
    const p = phone.items.find((i: { id: string }) => i.id === 't1p1')
    expect(p.savers).toContainEqual(
      expect.objectContaining({ username: 'ben', note: 'you’re welcome' }),
    )
    expect(JSON.stringify(phone)).not.toMatch(/whisper|banned words/)

    // Signed out: no queue at all.
    expect(
      (
        await friend(new NextRequest(`${BASE}/api/channels/friend/ben`), {
          params: Promise.resolve({ username: 'ben' }),
        })
      ).status,
    ).toBe(401)
  })

  it('isNew on every friend and group queue item (web and phone), from post_views', async () => {
    await computeGroupChannels(deps)
    // Ana has seen one of Ben's posts; t1p1 is in her own saves.
    markSeen(ANA, [{ platform: 'twitter', id: 't0p3' }])
    viewer = ANA
    type Web = { post: { id: string }; isNew: boolean }
    const newOf = (items: { id?: string; post?: { id: string }; isNew: boolean }[]) =>
      Object.fromEntries(items.map((i) => [i.post?.id ?? i.id, i.isNew]))

    const { GET: friend } = await import('@/app/api/channels/friend/[username]/route')
    const f = await (
      await friend(new NextRequest(`${BASE}/api/channels/friend/ben`), {
        params: Promise.resolve({ username: 'ben' }),
      })
    ).json()
    const fNew = newOf(f.items as Web[])
    expect(fNew['t0p3']).toBe(false) // seen
    expect(fNew['t1p1']).toBe(false) // in her saves
    expect(fNew['t0p1']).toBe(true)
    // The marks and "Play the N new ones" agree.
    expect(Object.values(fNew).filter(Boolean)).toHaveLength(f.friend.newCount)
    const onlyNew = await (
      await friend(new NextRequest(`${BASE}/api/channels/friend/ben?new=1`), {
        params: Promise.resolve({ username: 'ben' }),
      })
    ).json()
    expect(onlyNew.items.every((i: Web) => i.isNew)).toBe(true)
    expect(onlyNew.items).toHaveLength(f.friend.newCount)

    const { GET: group } = await import('@/app/api/channels/group/[slug]/route')
    const g = await (
      await group(new NextRequest(`${BASE}/api/channels/group/cats`), {
        params: Promise.resolve({ slug: 'cats' }),
      })
    ).json()
    const gNew = newOf(g.items as Web[])
    expect(gNew['t0p0']).toBe(false) // Ana's own
    expect(gNew['t0p3']).toBe(false) // seen
    expect(gNew['t0p1']).toBe(true)

    // Seeing it later clears the mark.
    markSeen(ANA, [{ platform: 'twitter', id: 't0p1' }])
    const again = await (
      await group(new NextRequest(`${BASE}/api/channels/group/cats`), {
        params: Promise.resolve({ slug: 'cats' }),
      })
    ).json()
    expect(newOf(again.items)['t0p1']).toBe(false)

    // The phone gets the same marks; `mine` channels don't carry them.
    const { createAccessKey } = await import('@/lib/auth/access-keys')
    const key = createAccessKey(ANA, 'Phone', 'phone')!.key
    viewer = null
    const { GET: one } = await import('@/app/api/app/channels/[kind]/[slug]/route')
    const call = async (kind: string, slug: string) =>
      (
        await one(
          new Request(`${BASE}/api/app/channels/${kind}/${slug}`, {
            headers: { authorization: `Bearer ${key}` },
          }),
          { params: Promise.resolve({ kind, slug }) },
        )
      ).json()
    const pf = await call('friend', 'ben')
    expect(newOf(pf.items)).toEqual({ ...fNew, t0p1: false })
    const pg = await call('group', 'cats')
    expect(newOf(pg.items)['t0p5']).toBe(true)
    expect(pg.items.every((i: { isNew: unknown }) => typeof i.isNew === 'boolean')).toBe(true)
    expect(pg).not.toHaveProperty('note')

    // Isolation: Ben's views never change what's new to Ana.
    markSeen(BEN, [{ platform: 'twitter', id: 't0p5' }])
    expect(newOf((await call('group', 'cats')).items)['t0p5']).toBe(true)
  })

  it('the note card: a friend’s latest note on a save you may see', async () => {
    viewer = ANA
    const { GET: friend } = await import('@/app/api/channels/friend/[username]/route')
    const load = async () =>
      (
        await friend(new NextRequest(`${BASE}/api/channels/friend/ben`), {
          params: Promise.resolve({ username: 'ben' }),
        })
      ).json()
    // No notes yet: no card.
    expect((await load()).note).toBeNull()

    testInstance.sqlite.exec(`
      UPDATE bookmarks SET note = 'older words' WHERE user_id = 'u_ben' AND id = 't0p1';
      UPDATE bookmarks SET note = 'you’re welcome' WHERE user_id = 'u_ben' AND id = 't1p1';
      UPDATE bookmarks SET note = 'whisper words' WHERE user_id = 'u_ben' AND id = 'secret2';
      UPDATE bookmarks SET note = 'quoted words' WHERE user_id = 'u_ben' AND id = 'quoted1';
    `)
    const body = await load()
    // Newer notes on a private save and a quoted copy are skipped.
    expect(body.note).toEqual({
      text: 'you’re welcome',
      platform: 'twitter',
      id: 't1p1',
      savedAt: expect.any(String),
    })
    expect(JSON.stringify(body)).not.toMatch(/whisper|quoted words/)

    // A post gone upstream falls back to the next note.
    await saveEmbedding({
      platform: 'twitter',
      postId: 't1p1',
      kind: 'video',
      contentHash: null,
      status: 'none',
      error: 'gone (404)',
    })
    expect((await load()).note).toMatchObject({ text: 'older words', id: 't0p1' })

    // The phone's friend channel carries the same card.
    const { createAccessKey } = await import('@/lib/auth/access-keys')
    const key = createAccessKey(ANA, 'Phone', 'phone')!.key
    viewer = null
    const { GET: one } = await import('@/app/api/app/channels/[kind]/[slug]/route')
    const phone = await (
      await one(
        new Request(`${BASE}/api/app/channels/friend/ben`, {
          headers: { authorization: `Bearer ${key}` },
        }),
        { params: Promise.resolve({ kind: 'friend', slug: 'ben' }) },
      )
    ).json()
    expect(phone.note).toMatchObject({ text: 'older words', id: 't0p1' })
  })
})
