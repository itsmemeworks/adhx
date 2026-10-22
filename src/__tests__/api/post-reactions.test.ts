import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestBookmark, createTestDb, type TestDbInstance } from './setup'

/**
 * Reactions kept on every post (`/api/posts/reactions`, `/api/app/reactions`):
 * named to friends, never to strangers. Visible to members who can see the
 * post (`seenBy`), never from banned members, none on a hidden post.
 *
 * Ana saves `pub` for everyone and `priv` just for herself; `gone` is saved by
 * Ana but hidden by an admin. Pete and Ben are members; Mum is banned.
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

import { __resetRateLimitState } from '@/lib/rate-limit'
import { createAccessKey } from '@/lib/auth/access-keys'
import { installAccountWriteGuards } from '@/lib/db/account-invariants'
import { GET, POST } from '@/app/api/posts/reactions/route'
import { DELETE } from '@/app/api/posts/reactions/[id]/route'
import { GET as appGET, POST as appPOST } from '@/app/api/app/reactions/route'
import { DELETE as appDELETE } from '@/app/api/app/reactions/[id]/route'

const PETE = 'u_pete'
const ANA = 'u_ana'
const BEN = 'u_ben'
const MUM = 'u_mum'
const BASE = 'http://localhost'

function save(userId: string, id: string, extra: Partial<schema.NewBookmark> = {}) {
  testInstance.db
    .insert(schema.bookmarks)
    .values(createTestBookmark(userId, id, { text: `post ${id}`, ...extra }))
    .run()
}

function req(url: string, method = 'GET', body?: unknown) {
  return new NextRequest(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function list(who: string | null, platform: string, id: string) {
  viewer = who
  const res = await GET(req(`/api/posts/reactions?platform=${platform}&id=${id}`))
  return { status: res.status, body: await res.json(), headers: res.headers }
}

async function react(who: string | null, body: unknown) {
  viewer = who
  const res = await POST(req('/api/posts/reactions', 'POST', body))
  return { status: res.status, body: await res.json(), headers: res.headers }
}

async function remove(who: string | null, id: string) {
  viewer = who
  const res = await DELETE(req(`/api/posts/reactions/${id}`, 'DELETE'), {
    params: Promise.resolve({ id }),
  })
  return { status: res.status, body: await res.json() }
}

const pub = { platform: 'twitter', id: 'pub' }
const priv = { platform: 'twitter', id: 'priv' }
const gone = { platform: 'twitter', id: 'gone' }

beforeEach(() => {
  testInstance = createTestDb()
  viewer = null
  __resetRateLimitState()
  testInstance.db
    .insert(schema.users)
    .values([
      { id: PETE, username: 'pete', displayName: 'Pete', avatarUrl: 'https://pbs.twimg.com/p.jpg' },
      { id: ANA, username: 'ana', displayName: 'Ana', avatarUrl: 'https://pbs.twimg.com/a.jpg' },
      { id: BEN, username: 'ben', displayName: null, avatarUrl: 'https://pbs.twimg.com/b.jpg' },
      { id: MUM, username: 'mum', displayName: 'Mum' },
    ])
    .run()
  // Ben chose the generated icon: no picture is sent for him.
  testInstance.db
    .insert(schema.userPreferences)
    .values({ userId: BEN, key: 'avatarSource', value: 'generated' })
    .run()
  save(ANA, 'pub')
  save(ANA, 'priv', { isPrivate: true })
  save(ANA, 'gone')
  save(MUM, 'pub')
  installAccountWriteGuards(testInstance.sqlite)
})

afterEach(() => {
  testInstance.close()
})

describe('reactions on a post', () => {
  it('are for signed-in members only', async () => {
    expect((await list(null, 'twitter', 'pub')).status).toBe(401)
    expect((await react(null, { ...pub, emoji: '😂' })).status).toBe(401)
    expect((await remove(null, 'rabc')).status).toBe(401)
  })

  it("takes link-network ids like SoundCloud's user~track", async () => {
    save(ANA, 'forss~flickermood', { platform: 'soundcloud' })
    const sound = { platform: 'soundcloud', id: 'forss~flickermood' }
    expect((await react(PETE, { ...sound, emoji: '🔥' })).status).toBe(200)
    const seen = await list(PETE, 'soundcloud', encodeURIComponent('forss~flickermood'))
    expect(seen.status).toBe(200)
    expect(seen.body.reactions.map((r: { emoji: string }) => r.emoji)).toEqual(['🔥'])
    // Still refused: anything that isn't a post id.
    expect((await react(PETE, { platform: 'soundcloud', id: 'a/b', emoji: '🔥' })).status).toBe(400)
  })

  it('keeps them, oldest first, with names and faces', async () => {
    const first = await react(ANA, { ...pub, emoji: '😂' })
    expect(first.status).toBe(200)
    expect(Object.keys(first.body).sort()).toEqual(['at', 'id'])
    expect(first.body.id).toMatch(/^r[0-9a-z]+$/)
    expect(first.headers.get('Cache-Control')).toBe('no-store')
    // A bare heart counts; words are cleaned and kept as plain text.
    expect((await react(BEN, { ...pub, emoji: '❤' })).status).toBe(200)
    expect((await react(PETE, { ...pub, text: '  <b>so</b>‮  good\u0007 ' })).status).toBe(200)

    const seen = await list(PETE, 'twitter', 'pub')
    expect(seen.status).toBe(200)
    expect(seen.headers.get('Cache-Control')).toBe('no-store')
    expect(Object.keys(seen.body)).toEqual(['reactions'])
    const [a, b, c] = seen.body.reactions
    expect(a).toEqual({
      id: first.body.id,
      emoji: '😂',
      text: null,
      at: first.body.at,
      saver: {
        username: 'ana',
        name: 'Ana',
        avatarUrl: 'https://pbs.twimg.com/a.jpg',
        isYou: false,
      },
    })
    expect(b).toMatchObject({
      emoji: '❤️',
      text: null,
      saver: { username: 'ben', name: null, avatarUrl: null, isYou: false },
    })
    expect(c).toMatchObject({
      emoji: null,
      text: '<b>so</b> good',
      saver: { username: 'pete', name: 'Pete', isYou: true },
    })
    // Each one is counted for admins too.
    const counts = testInstance.sqlite
      .prepare('SELECT user_id, kind, count FROM reaction_counts ORDER BY user_id')
      .all()
    expect(counts).toEqual([
      { user_id: ANA, kind: 'laughing', count: 1 },
      { user_id: BEN, kind: 'heart', count: 1 },
      { user_id: PETE, kind: 'text', count: 1 },
    ])
  })

  it('returns the newest 100', async () => {
    const insert = testInstance.sqlite.prepare(
      `INSERT INTO post_reactions (id, user_id, platform, post_id, emoji, text, created_at)
       VALUES (?, ?, 'twitter', 'pub', '🔥', NULL, ?)`,
    )
    for (let i = 0; i < 120; i++) {
      insert.run(
        `r${i.toString(36).padStart(3, '0')}`,
        ANA,
        new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
      )
    }
    const { body } = await list(BEN, 'twitter', 'pub')
    expect(body.reactions).toHaveLength(100)
    expect(body.reactions[0].at).toBe(new Date(Date.UTC(2026, 9, 1, 0, 20)).toISOString())
    expect(body.reactions[99].at).toBe(new Date(Date.UTC(2026, 9, 1, 0, 119)).toISOString())
  })

  it('stays with its owner on a post saved only privately', async () => {
    const mine = await react(ANA, { ...priv, emoji: '👀' })
    expect(mine.status).toBe(200)
    expect((await list(ANA, 'twitter', 'priv')).body.reactions).toMatchObject([
      { id: mine.body.id, emoji: '👀', saver: { username: 'ana', isYou: true } },
    ])
    const ben = await list(BEN, 'twitter', 'priv')
    expect(ben.status).toBe(404)
    expect(ben.body).toEqual({ error: expect.any(String), code: 'not_found' })
    const tried = await react(BEN, { ...priv, emoji: '😂' })
    expect(tried.status).toBe(404)
    expect(tried.body.code).toBe('not_found')
    // A post nobody saved is nobody's to react to.
    expect((await list(BEN, 'twitter', 'nope')).status).toBe(404)
    expect((await react(BEN, { platform: 'twitter', id: 'nope', emoji: '😂' })).status).toBe(404)
    expect(testInstance.sqlite.prepare('SELECT COUNT(*) AS n FROM post_reactions').get()).toEqual({
      n: 1,
    })
  })

  it('keeps each post (and platform) to itself', async () => {
    save(ANA, 'pub', { platform: 'tiktok' })
    await react(ANA, { ...pub, emoji: '🔥' })
    await react(BEN, { platform: 'tiktok', id: 'pub', emoji: '💀' })
    expect(
      (await list(PETE, 'twitter', 'pub')).body.reactions.map((r: { emoji: string }) => r.emoji),
    ).toEqual(['🔥'])
    expect(
      (await list(PETE, 'tiktok', 'pub')).body.reactions.map((r: { emoji: string }) => r.emoji),
    ).toEqual(['💀'])
  })

  it('never shows a banned member’s reactions', async () => {
    await react(MUM, { ...pub, text: 'hello love' })
    await react(ANA, { ...pub, emoji: '😭' })
    testInstance.db
      .insert(schema.userBans)
      .values({ userId: MUM, createdBy: PETE, createdAt: new Date().toISOString() })
      .run()
    const { body } = await list(PETE, 'twitter', 'pub')
    expect(body.reactions.map((r: { saver: { username: string } }) => r.saver.username)).toEqual([
      'ana',
    ])
    expect(JSON.stringify(body)).not.toContain('hello love')
  })

  it('shows none on a hidden post, and takes none', async () => {
    await react(ANA, { ...gone, emoji: '😂' })
    testInstance.db
      .insert(schema.moderatedPosts)
      .values({
        platform: 'twitter',
        bookmarkId: 'gone',
        hidden: 1,
        createdAt: new Date().toISOString(),
        createdBy: PETE,
      })
      .run()
    const seen = await list(ANA, 'twitter', 'gone')
    expect(seen.status).toBe(200)
    expect(seen.body).toEqual({ reactions: [] })
    const tried = await react(ANA, { ...gone, emoji: '🔥' })
    expect(tried.status).toBe(404)
    expect(tried.body.code).toBe('not_found')
  })

  it('says what is wrong with a reaction', async () => {
    const code = async (body: unknown) => (await react(ANA, body)).body.code
    expect(await code({ ...pub })).toBe('bad_reaction')
    expect(await code({ ...pub, emoji: '😂', text: 'hi' })).toBe('bad_reaction')
    expect(await code({ ...pub, emoji: '🍆' })).toBe('bad_reaction')
    expect(await code({ ...pub, text: '   ' })).toBe('bad_text')
    expect(await code({ ...pub, text: 'x'.repeat(41) })).toBe('bad_text')
    expect(await code({ platform: 'twitter', emoji: '😂' })).toBe('bad_post')
    expect(await code({ platform: 'Twitter!', id: 'pub', emoji: '😂' })).toBe('bad_post')
    expect((await list(ANA, 'twitter', '')).body.code).toBe('bad_post')
    expect((await react(ANA, { ...pub, text: 'x'.repeat(41) })).status).toBe(400)
  })

  it('has the same per-person limits as Live, words more tightly', async () => {
    for (let i = 0; i < 6; i++) {
      expect((await react(ANA, { ...pub, text: `again ${i}` })).status).toBe(200)
    }
    const words = await react(ANA, { ...pub, text: 'one more' })
    expect(words.status).toBe(429)
    expect(words.body.code).toBe('busy')
    expect(Number(words.headers.get('Retry-After'))).toBeGreaterThan(0)
    for (let i = 0; i < 13; i++) {
      expect((await react(ANA, { ...pub, emoji: '🔥' })).status).toBe(200)
    }
    const busy = await react(ANA, { ...pub, emoji: '🔥' })
    expect(busy.status).toBe(429)
    expect(busy.headers.get('Retry-After')).toBeTruthy()
    // Nothing kept past the limit; someone else still can.
    expect(testInstance.sqlite.prepare('SELECT COUNT(*) AS n FROM post_reactions').get()).toEqual({
      n: 19,
    })
    expect((await react(BEN, { ...pub, emoji: '🔥' })).status).toBe(200)
  })

  it('deletes your own only', async () => {
    const hers = await react(ANA, { ...pub, emoji: '😂' })
    const notYours = await remove(BEN, hers.body.id)
    expect(notYours.status).toBe(404)
    expect(notYours.body.code).toBe('not_found')
    expect((await remove(ANA, 'not an id')).status).toBe(404)
    expect(await remove(ANA, hers.body.id)).toEqual({ status: 200, body: { ok: true } })
    expect((await remove(ANA, hers.body.id)).status).toBe(404)
    expect((await list(ANA, 'twitter', 'pub')).body.reactions).toEqual([])
  })

  it('goes with the account', async () => {
    await react(ANA, { ...pub, emoji: '😂' })
    await react(BEN, { ...pub, emoji: '🔥' })
    viewer = ANA
    const { DELETE: deleteAccount } = await import('@/app/api/account/route')
    expect((await deleteAccount()).status).toBe(200)
    const left = testInstance.db.select().from(schema.postReactions).all()
    expect(left.map((r) => r.userId)).toEqual([BEN])
    // A reaction can only belong to a live account.
    expect(() =>
      testInstance.sqlite
        .prepare(
          `INSERT INTO post_reactions (id, user_id, platform, post_id, emoji, created_at)
           VALUES ('rghost', 'u_ana', 'twitter', 'pub', '😂', '2026-10-21')`,
        )
        .run(),
    ).toThrow(/account reference does not exist/)
  })

  it('goes when you clear your data', async () => {
    await react(ANA, { ...pub, emoji: '😂' })
    viewer = ANA
    const { POST: clear } = await import('@/app/api/account/clear/route')
    expect((await clear(req('/api/account/clear', 'POST', { confirm: 'CLEAR' }))).status).toBe(200)
    expect(
      testInstance.db
        .select()
        .from(schema.postReactions)
        .where(eq(schema.postReactions.userId, ANA))
        .all(),
    ).toEqual([])
  })
})

describe('reactions on a post, from the phone', () => {
  const phoneReq = (path: string, k?: string, init: RequestInit = {}) =>
    new Request(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(k ? { authorization: `Bearer ${k}` } : {}),
      },
    })

  it('needs a phone key', async () => {
    expect((await appGET(phoneReq('/api/app/reactions?platform=twitter&id=pub'))).status).toBe(401)
    const res = await appPOST(
      phoneReq('/api/app/reactions', undefined, {
        method: 'POST',
        body: JSON.stringify({ ...pub, emoji: '😂' }),
      }),
    )
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('bad_key')
  })

  it('reacts, lists and deletes with the same shapes as the web', async () => {
    const ana = createAccessKey(ANA, 'iPhone', 'phone')!.key
    const ben = createAccessKey(BEN, 'Pixel', 'phone')!.key
    const sent = await appPOST(
      phoneReq('/api/app/reactions', ana, {
        method: 'POST',
        body: JSON.stringify({ ...pub, text: 'so good' }),
      }),
    )
    expect(sent.status).toBe(200)
    const { id, at } = await sent.json()
    const listed = await appGET(phoneReq('/api/app/reactions?platform=twitter&id=pub', ben))
    expect(listed.status).toBe(200)
    expect(listed.headers.get('Cache-Control')).toBe('no-store')
    expect(await listed.json()).toEqual({
      reactions: [
        {
          id,
          emoji: null,
          text: 'so good',
          at,
          saver: {
            username: 'ana',
            name: 'Ana',
            avatarUrl: 'https://pbs.twimg.com/a.jpg',
            isYou: false,
          },
        },
      ],
    })
    // The web sees the same.
    expect((await list(PETE, 'twitter', 'pub')).body.reactions[0].id).toBe(id)

    // Private posts stay with their owner here too.
    const hidden = await appGET(phoneReq('/api/app/reactions?platform=twitter&id=priv', ben))
    expect(hidden.status).toBe(404)
    expect((await hidden.json()).code).toBe('not_found')
    const tried = await appPOST(
      phoneReq('/api/app/reactions', ben, {
        method: 'POST',
        body: JSON.stringify({ ...priv, emoji: '😂' }),
      }),
    )
    expect(tried.status).toBe(404)

    const del = (key: string) =>
      appDELETE(phoneReq(`/api/app/reactions/${id}`, key, { method: 'DELETE' }), {
        params: Promise.resolve({ id }),
      })
    const notBens = await del(ben)
    expect(notBens.status).toBe(404)
    expect((await notBens.json()).code).toBe('not_found')
    const done = await del(ana)
    expect(done.status).toBe(200)
    expect(await done.json()).toEqual({ ok: true })
  })

  it('is rate-limited with Retry-After', async () => {
    const ana = createAccessKey(ANA, 'iPhone', 'phone')!.key
    const send = () =>
      appPOST(
        phoneReq('/api/app/reactions', ana, {
          method: 'POST',
          body: JSON.stringify({ ...pub, emoji: '🔥' }),
        }),
      )
    for (let i = 0; i < 20; i++) expect((await send()).status).toBe(200)
    const busy = await send()
    expect(busy.status).toBe(429)
    expect(busy.headers.get('Retry-After')).toBeTruthy()
    expect((await busy.json()).code).toBe('busy')
  })
})

describe("who's on a post (/api/app/who)", () => {
  const who = async (as: string, query: string) => {
    const { GET: whoGET } = await import('@/app/api/app/who/route')
    const key = createAccessKey(as, 'Phone', 'phone')!.key
    const res = await whoGET(
      new NextRequest(`${BASE}/api/app/who?${query}`, {
        headers: { authorization: `Bearer ${key}` },
      }),
    )
    return { status: res.status, body: await res.json() }
  }
  const view = (userId: string, id: string, at: string) =>
    testInstance.db
      .insert(schema.postViews)
      .values({ userId, platform: 'twitter', postId: id, seenAt: at })
      .run()

  it('names who saved, reacted and watched, to members who can see the post', async () => {
    expect((await react(BEN, { ...pub, emoji: '😂' })).status).toBe(200)
    view(BEN, 'pub', '2026-10-22T09:00:00.000Z')
    view(PETE, 'pub', '2026-10-22T10:00:00.000Z')
    view(MUM, 'pub', '2026-10-22T11:00:00.000Z')
    testInstance.db
      .insert(schema.userBans)
      .values({ userId: MUM, createdAt: new Date().toISOString(), createdBy: PETE })
      .run()
    const seen = await who(PETE, 'platform=twitter&id=pub')
    expect(seen.status).toBe(200)
    expect(seen.body.savers.map((s: { username: string }) => s.username)).toContain('ana')
    expect(seen.body.reactions.map((r: { emoji: string }) => r.emoji)).toEqual(['😂'])
    // Newest first; Mum is banned, so never shown.
    expect(
      seen.body.watched.map((w: { username: string; isYou: boolean }) => [w.username, w.isYou]),
    ).toEqual([
      ['pete', true],
      ['ben', false],
    ])
  })

  it('says nothing about a post you can’t see, and refuses a bad id', async () => {
    view(ANA, 'priv', '2026-10-22T09:00:00.000Z')
    expect((await who(PETE, 'platform=twitter&id=priv')).status).toBe(404)
    expect((await who(ANA, 'platform=twitter&id=priv')).status).toBe(200)
    expect((await who(PETE, 'platform=twitter&id=')).status).toBe(400)
  })
})
