import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestBookmark, createTestDb, type TestDbInstance } from './setup'

/**
 * Watch counts (`/api/app/watched`, `/api/watched`, `src/lib/people/watch-counts.ts`):
 * plays, finishes and seconds per member, post and year. Counted only for
 * posts the member can see; totals leave banned members and hidden posts out.
 *
 * Ana saves `pub` for everyone and `priv` just for herself; `gone` is saved
 * by Ana but hidden by an admin. Pete and Ben are members; Mum is banned
 * later in a test.
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
import { POST as appPOST } from '@/app/api/app/watched/route'
import { POST as webPOST } from '@/app/api/watched/route'
import { MAX_PLAYS, MAX_SECONDS, parseWatchedBody, recordWatched } from '@/lib/watch/record'
import { postPlays, watchCountFor, watchYear } from '@/lib/people/watch-counts'

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

const phoneReq = (key: string | undefined, body: unknown) =>
  new Request(`${BASE}/api/app/watched`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  })

async function web(who: string | null, body: unknown) {
  viewer = who
  return webPOST(
    new NextRequest(`${BASE}/api/watched`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

const rows = (userId: string) =>
  testInstance.db
    .select()
    .from(schema.postWatchCounts)
    .where(eq(schema.postWatchCounts.userId, userId))
    .all()

const watched = (id: string, plays = 1, finishes = 0, seconds = 0) => ({
  platform: 'twitter',
  id,
  plays,
  finishes,
  seconds,
})

beforeEach(() => {
  testInstance = createTestDb()
  viewer = null
  __resetRateLimitState()
  testInstance.db
    .insert(schema.users)
    .values([
      { id: PETE, username: 'pete' },
      { id: ANA, username: 'ana' },
      { id: BEN, username: 'ben' },
      { id: MUM, username: 'mum' },
    ])
    .run()
  save(ANA, 'pub')
  save(ANA, 'priv', { isPrivate: true })
  save(ANA, 'gone')
  installAccountWriteGuards(testInstance.sqlite)
})

afterEach(() => {
  testInstance.close()
})

describe('parseWatchedBody', () => {
  it('takes whole numbers, adds repeats together and drops empty tallies', () => {
    expect(
      parseWatchedBody({
        posts: [watched('a', 1, 1, 12.7), watched('a', 2, 0, 3), watched('b', 0, 0, 0)],
      }),
    ).toEqual({ posts: [{ platform: 'twitter', id: 'a', plays: 3, finishes: 1, seconds: 15 }] })
  })

  it('caps big numbers instead of refusing them', () => {
    const parsed = parseWatchedBody({ posts: [watched('a', 10_000, 0, 10_000_000)] })
    expect(parsed).toEqual({
      posts: [
        { platform: 'twitter', id: 'a', plays: MAX_PLAYS, finishes: 0, seconds: MAX_SECONDS },
      ],
    })
  })

  it('refuses bad shapes', () => {
    expect(parseWatchedBody(null)).toHaveProperty('error')
    expect(parseWatchedBody({ posts: 'x' })).toHaveProperty('error')
    expect(parseWatchedBody({ posts: [watched('a', -1)] })).toHaveProperty('error')
    expect(parseWatchedBody({ posts: [{ ...watched('a'), plays: '2' }] })).toHaveProperty('error')
    expect(parseWatchedBody({ posts: [{ ...watched('a'), plays: Infinity }] })).toHaveProperty(
      'error',
    )
    expect(parseWatchedBody({ posts: [{ ...watched('a'), platform: 'X!' }] })).toHaveProperty(
      'error',
    )
    expect(parseWatchedBody({ posts: [{ ...watched('a'), id: 'no spaces' }] })).toHaveProperty(
      'error',
    )
    expect(
      parseWatchedBody({ posts: Array.from({ length: 51 }, (_, i) => watched(`p${i}`)) }),
    ).toHaveProperty('error')
  })
})

describe('POST /api/app/watched', () => {
  it('needs a phone key', async () => {
    const res = await appPOST(phoneReq(undefined, { posts: [watched('pub')] }))
    expect(res.status).toBe(401)
  })

  it('adds batches up, per member', async () => {
    const pete = createAccessKey(PETE, 'iPhone', 'phone')!.key
    const ben = createAccessKey(BEN, 'Pixel', 'phone')!.key
    expect((await appPOST(phoneReq(pete, { posts: [watched('pub', 1, 1, 20)] }))).status).toBe(204)
    expect((await appPOST(phoneReq(pete, { posts: [watched('pub', 2, 1, 35)] }))).status).toBe(204)
    expect((await appPOST(phoneReq(ben, { posts: [watched('pub', 1, 0, 4)] }))).status).toBe(204)
    expect(watchCountFor(PETE, 'twitter', 'pub')).toEqual({ plays: 3, finishes: 2, seconds: 55 })
    expect(watchCountFor(BEN, 'twitter', 'pub')).toEqual({ plays: 1, finishes: 0, seconds: 4 })
    expect(watchCountFor(ANA, 'twitter', 'pub')).toEqual({ plays: 0, finishes: 0, seconds: 0 })
  })

  it('counts only posts the member can see', async () => {
    const ben = createAccessKey(BEN, 'Pixel', 'phone')!.key
    const ana = createAccessKey(ANA, 'iPhone', 'phone')!.key
    // Ana's Just for me post, and one nobody saved.
    const res = await appPOST(
      phoneReq(ben, { posts: [watched('priv', 5), watched('nobody', 5), watched('pub', 1)] }),
    )
    expect(res.status).toBe(204)
    expect(rows(BEN).map((r) => r.postId)).toEqual(['pub'])
    // Her own private save counts for her.
    await appPOST(phoneReq(ana, { posts: [watched('priv', 2)] }))
    expect(watchCountFor(ANA, 'twitter', 'priv').plays).toBe(2)
  })

  it('refuses a bad body with 400', async () => {
    const pete = createAccessKey(PETE, 'iPhone', 'phone')!.key
    const res = await appPOST(phoneReq(pete, { posts: [watched('pub', -3)] }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('bad_posts')
  })

  it('is rate-limited', async () => {
    const pete = createAccessKey(PETE, 'iPhone', 'phone')!.key
    for (let i = 0; i < 120; i++) {
      expect((await appPOST(phoneReq(pete, { posts: [] }))).status).toBe(204)
    }
    const busy = await appPOST(phoneReq(pete, { posts: [] }))
    expect(busy.status).toBe(429)
    expect((await busy.json()).code).toBe('busy')
  })
})

describe('POST /api/watched (the web)', () => {
  it('needs a signed-in member, then counts like the phone', async () => {
    expect((await web(null, { posts: [watched('pub')] })).status).toBe(401)
    expect((await web(PETE, { posts: [watched('pub', 1, 1, 9)] })).status).toBe(204)
    expect((await web(PETE, { posts: 'nope' })).status).toBe(400)
    expect(watchCountFor(PETE, 'twitter', 'pub')).toEqual({ plays: 1, finishes: 1, seconds: 9 })
  })
})

describe('recordWatched', () => {
  it('keeps each year apart, and first and last times', () => {
    recordWatched(PETE, [watched('pub', 2, 0, 10)], new Date('2026-12-31T23:00:00Z'))
    recordWatched(PETE, [watched('pub', 1, 1, 5)], new Date('2027-01-01T01:00:00Z'))
    recordWatched(PETE, [watched('pub', 1, 0, 5)], new Date('2027-03-01T01:00:00Z'))
    const byYear = rows(PETE).sort((a, b) => a.year - b.year)
    expect(byYear.map((r) => [r.year, r.plays, r.seconds])).toEqual([
      [2026, 2, 10],
      [2027, 2, 10],
    ])
    expect(byYear[1].firstAt).toBe('2027-01-01T01:00:00.000Z')
    expect(byYear[1].lastAt).toBe('2027-03-01T01:00:00.000Z')
    expect(watchCountFor(PETE, 'twitter', 'pub')).toEqual({ plays: 4, finishes: 1, seconds: 20 })
  })

  it('is refused for a deleted account', () => {
    testInstance.sqlite.prepare('DELETE FROM users WHERE id = ?').run(BEN)
    expect(() => recordWatched(BEN, [watched('pub')])).toThrow(/account reference does not exist/)
  })
})

describe('postPlays', () => {
  it('adds up everyone who isn’t banned, without names, for members who can see the post', () => {
    recordWatched(PETE, [watched('pub', 3, 1, 30)])
    recordWatched(BEN, [watched('pub', 2, 2, 20)])
    recordWatched(MUM, [watched('pub', 9, 0, 90)])
    testInstance.db
      .insert(schema.userBans)
      .values({ userId: MUM, createdBy: PETE, createdAt: new Date().toISOString() })
      .run()
    const total = postPlays(PETE, 'twitter', 'pub')
    expect(total).toEqual({ plays: 5, finishes: 3, seconds: 50, watchers: 2 })
    expect(JSON.stringify(total)).not.toMatch(/pete|ben|u_/)
    // Ana's private post: nobody else gets a total.
    expect(postPlays(BEN, 'twitter', 'priv')).toBeNull()
    expect(postPlays('', 'twitter', 'pub')).toBeNull()
  })

  it('has none on a hidden post', () => {
    recordWatched(PETE, [watched('gone', 3)])
    testInstance.db
      .insert(schema.moderatedPosts)
      .values({
        platform: 'twitter',
        bookmarkId: 'gone',
        hidden: 1,
        createdAt: new Date().toISOString(),
        createdBy: ANA,
      })
      .run()
    expect(postPlays(PETE, 'twitter', 'gone')).toEqual({
      plays: 0,
      finishes: 0,
      seconds: 0,
      watchers: 0,
    })
  })
})

describe('watchYear', () => {
  it('sums one year and lists what was played again and again, still visible only', () => {
    save(ANA, 'loop')
    save(ANA, 'once')
    const in2026 = new Date('2026-11-01T12:00:00Z')
    recordWatched(PETE, [watched('loop', 14, 3, 140)], in2026)
    recordWatched(PETE, [watched('pub', 4, 4, 3600)], in2026)
    recordWatched(PETE, [watched('once', 1, 1, 10)], in2026)
    recordWatched(PETE, [watched('gone', 20, 0, 50)], in2026)
    recordWatched(PETE, [watched('pub', 7, 0, 60)], new Date('2027-01-02T12:00:00Z'))
    // Hidden by an admin since; and `loop` was later made Just for me.
    testInstance.db
      .insert(schema.moderatedPosts)
      .values({
        platform: 'twitter',
        bookmarkId: 'gone',
        hidden: 1,
        createdAt: new Date().toISOString(),
        createdBy: ANA,
      })
      .run()
    const year = watchYear(PETE, 2026)
    expect(year).toMatchObject({
      year: 2026,
      posts: 4,
      plays: 39,
      finishes: 8,
      seconds: 3800,
      hours: 1.1,
    })
    expect(year.mostRewatched.map((r) => [r.id, r.plays])).toEqual([
      ['loop', 14],
      ['pub', 4],
    ])
    testInstance.db
      .update(schema.bookmarks)
      .set({ isPrivate: true })
      .where(eq(schema.bookmarks.id, 'loop'))
      .run()
    expect(watchYear(PETE, 2026).mostRewatched.map((r) => r.id)).toEqual(['pub'])
    expect(watchYear(PETE, 2027)).toMatchObject({ posts: 1, plays: 7 })
    expect(watchYear(PETE, 2025)).toEqual({
      year: 2025,
      posts: 0,
      plays: 0,
      finishes: 0,
      seconds: 0,
      hours: 0,
      mostRewatched: [],
    })
  })
})

describe('durable watch receipts', () => {
  const batchId = '12345678-1234-1234-1234-123456789abc'
  it('deduplicates the same committed batch across web and phone retries', async () => {
    const body = { batchId, posts: [watched('pub', 1, 1, 10)] }
    expect((await web(PETE, body)).status).toBe(204)
    const key = createAccessKey(PETE, 'phone', 'phone')!.key
    expect((await appPOST(phoneReq(key, body))).status).toBe(204)
    expect(watchCountFor(PETE, 'twitter', 'pub')).toEqual({ plays: 1, finishes: 1, seconds: 10 })
    expect(
      testInstance.sqlite.prepare('SELECT count(*) AS n FROM watch_batch_receipts').get(),
    ).toEqual({ n: 1 })
  })
  it('isolates receipt ids by account and refuses changed payloads', async () => {
    const body = { batchId, posts: [watched('pub')] }
    expect((await web(PETE, body)).status).toBe(204)
    expect((await web(BEN, body)).status).toBe(204)
    expect((await web(PETE, { batchId, posts: [watched('pub', 2)] })).status).toBe(400)
    expect(watchCountFor(PETE, 'twitter', 'pub').plays).toBe(1)
    expect(watchCountFor(BEN, 'twitter', 'pub').plays).toBe(1)
    expect((await web(PETE, { batchId: 'bad', posts: [watched('pub')] })).status).toBe(400)
  })
  it('rolls back receipts with failed count writes so retry can succeed', () => {
    testInstance.sqlite.exec(
      "CREATE TRIGGER fail_watch BEFORE INSERT ON post_watch_counts BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END",
    )
    expect(() => recordWatched(PETE, [watched('pub')], new Date(), batchId)).toThrow(
      'simulated disk failure',
    )
    expect(
      testInstance.sqlite.prepare('SELECT count(*) AS n FROM watch_batch_receipts').get(),
    ).toEqual({ n: 0 })
    testInstance.sqlite.exec('DROP TRIGGER fail_watch')
    recordWatched(PETE, [watched('pub')], new Date(), batchId)
    recordWatched(PETE, [watched('pub')], new Date(), batchId)
    expect(watchCountFor(PETE, 'twitter', 'pub').plays).toBe(1)
  })
  it('keeps an ignored post ignored when an old receipt is replayed after publication', async () => {
    const body = { batchId, posts: [watched('priv')] }
    expect((await web(PETE, body)).status).toBe(204)
    testInstance.sqlite.prepare("UPDATE bookmarks SET is_private=0 WHERE id='priv'").run()
    expect((await web(PETE, body)).status).toBe(204)
    expect(watchCountFor(PETE, 'twitter', 'priv').plays).toBe(0)
  })
  it('clears receipt metadata with account data', async () => {
    await web(PETE, { batchId, posts: [watched('pub')] })
    viewer = PETE
    const { POST } = await import('@/app/api/account/clear/route')
    expect((await POST()).status).toBe(200)
    expect(
      testInstance.sqlite
        .prepare('SELECT count(*) AS n FROM watch_batch_receipts WHERE user_id=?')
        .get(PETE),
    ).toEqual({ n: 0 })
  })
})
