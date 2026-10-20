import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from '../api/setup'

/**
 * Live with names (docs/specs/friends-feed.md): the engine stays anonymous;
 * members get savers, watchers and reactions per request; strangers never do.
 */

let testInstance: TestDbInstance
const viewer = vi.hoisted(() => ({ id: null as string | null }))

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction: <R>(fn: () => R): R => testInstance.sqlite.transaction(fn)(),
}))
vi.mock('@/lib/auth/session', () => ({ getCurrentUserId: async () => viewer.id }))
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

import { saveEmbedding } from '@/lib/semantic/store'
import { normalize } from '@/lib/moments/group'
import { __resetVectorIndex } from '@/lib/semantic/vector-index'
import { __moments, __resetMoments, getMomentsSnapshot } from '@/lib/moments/engine'
import { __resetPresence } from '@/lib/moments/presence'
import { __resetRateLimitState } from '@/lib/rate-limit'
import { createAccessKey } from '@/lib/auth/access-keys'
import { GET as snapshotGET } from '@/app/api/moments/route'
import { GET as detailGET } from '@/app/api/moments/[slug]/route'
import { GET as streamGET } from '@/app/api/moments/stream/route'
import { POST as reactPOST } from '@/app/api/moments/[slug]/react/route'
import { GET as appLiveGET } from '@/app/api/app/live/route'
import {
  GET as appMomentGET,
  POST as appMomentPOST,
  DELETE as appMomentDELETE,
} from '@/app/api/app/live/[slug]/route'
import { POST as appReactPOST } from '@/app/api/app/live/[slug]/react/route'
import { GET as appStreamGET } from '@/app/api/app/live/[slug]/stream/route'

const USER_C = 'user-c'
const BASE = 'http://localhost'

function addUser(id: string, username: string, displayName: string) {
  testInstance.db
    .insert(schema.users)
    .values({ id, username, displayName, avatarUrl: null } as never)
    .run()
}

function save(userId: string, id: string, text: string, extra: Partial<schema.NewBookmark> = {}) {
  testInstance.db
    .insert(schema.bookmarks)
    .values(
      createTestBookmark(userId, id, { text, processedAt: new Date().toISOString(), ...extra }),
    )
    .run()
}

function noise(seed: number, dims: number): Float32Array {
  const v = new Float32Array(dims)
  let t = seed * 9973 + 1
  for (let i = 0; i < dims; i++) {
    t = (t * 16807) % 2147483647
    v[i] = (t / 2147483647 - 0.5) * 0.12
  }
  return v
}

function topic(axis: number, seed: number): Float32Array {
  const v = noise(seed, 768)
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

/** Frogs saved by Ana (6) and Ben (2), plus unrelated background. */
async function seedFrogs() {
  for (let i = 0; i < 6; i++) {
    save(USER_A, `frog${i}`, `frog video number ${i}`)
    await understood(`frog${i}`, topic(0, i + 1))
  }
  save(USER_B, 'frog0', 'frog video number 0')
  save(USER_B, 'frog1', 'frog video number 1')
  for (let i = 0; i < 50; i++) {
    save(USER_A, `bg${i}`, `something else ${i}`)
    await understood(`bg${i}`, topic(10 + i, 200 + i))
  }
}

async function frogSlug(): Promise<string> {
  await __moments.recompute()
  const [frog] = (await getMomentsSnapshot()).moments
  expect(frog?.title).toBe('Frog')
  return frog.slug
}

const params = (slug: string) => ({ params: Promise.resolve({ slug }) })

async function as<T>(who: string | null, run: () => Promise<T>): Promise<T> {
  viewer.id = who
  try {
    return await run()
  } finally {
    viewer.id = null
  }
}

async function snapshotAs(who: string | null) {
  return as(who, async () => (await snapshotGET(new NextRequest(`${BASE}/api/moments`))).json())
}

async function detailAs(who: string | null, slug: string) {
  return as(who, async () =>
    (await detailGET(new NextRequest(`${BASE}/api/moments/${slug}`), params(slug))).json(),
  )
}

function reactAs(who: string | null, slug: string, body: unknown) {
  return as(who, () =>
    reactPOST(
      new NextRequest(`${BASE}/api/moments/${slug}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      params(slug),
    ),
  )
}

type Sse = { type: string; data: Record<string, unknown> }

/** Read an SSE response into a list as it arrives. */
function collect(res: Response, controller: AbortController) {
  const events: Sse[] = []
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value)
        let at: number
        while ((at = buf.indexOf('\n\n')) !== -1) {
          const chunk = buf.slice(0, at)
          buf = buf.slice(at + 2)
          const type = /^event: (.+)$/m.exec(chunk)?.[1]
          const data = /^data: (.+)$/m.exec(chunk)?.[1]
          if (type && data) events.push({ type, data: JSON.parse(data) })
        }
      }
    } catch {
      // closed
    }
  })()
  return {
    events,
    of: (type: string) => events.filter((e) => e.type === type),
    close: async () => {
      controller.abort()
      await reader.cancel().catch(() => {})
      await settle()
    },
  }
}

async function openStream(who: string | null, slug: string) {
  const controller = new AbortController()
  const res = await as(who, () =>
    streamGET(
      new NextRequest(`${BASE}/api/moments/stream?watch=${slug}`, { signal: controller.signal }),
    ),
  )
  return collect(res, controller)
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
}

const usernames = (list: unknown) => ((list ?? []) as { username: string }[]).map((s) => s.username)

beforeEach(() => {
  testInstance = createTestDb()
  addUser(USER_A, 'ana', 'Ana')
  addUser(USER_B, 'ben', 'Ben')
  addUser(USER_C, 'cal', 'Cal')
  __resetVectorIndex()
  __resetMoments()
  __resetPresence()
  __resetRateLimitState()
  vi.stubEnv('MOMENT_MIN_SAVERS', '2')
  vi.stubEnv('TYPESAFE_API_KEY', '')
  viewer.id = null
})

afterEach(() => {
  vi.unstubAllEnvs()
  __resetMoments()
  __resetPresence()
})

describe('moments signed out', () => {
  it('snapshots and details carry no names and keep their old shape', async () => {
    await seedFrogs()
    const slug = await frogSlug()
    const snapshot = await snapshotAs(null)
    expect(Object.keys(snapshot.moments[0]).sort()).toEqual([
      'covers',
      'hue',
      'lastAt',
      'people',
      'posts',
      'rising',
      'slug',
      'title',
      'watching',
    ])
    expect(JSON.stringify(snapshot)).not.toContain('"username"')
    expect(JSON.stringify(snapshot)).not.toContain('"savers"')

    const detail = await detailAs(null, slug)
    expect(Object.keys(detail).sort()).toEqual(['bars', 'items', 'moment'])
    expect(Object.keys(detail.items[0]).sort()).toEqual(['people', 'post', 'savedAt'])
    expect(JSON.stringify(detail)).not.toContain('"username"')
  })
})

describe('moments signed in', () => {
  it('names who is saving each moment and each post', async () => {
    await seedFrogs()
    const slug = await frogSlug()
    const snapshot = await snapshotAs(USER_B)
    const [frog] = snapshot.moments
    expect(usernames(frog.savers).sort()).toEqual(['ana', 'ben'])
    expect(frog.savers.find((s: { username: string }) => s.username === 'ben').isYou).toBe(true)
    expect(frog.watchers).toEqual([])
    // Account ids never go out.
    expect(JSON.stringify(snapshot)).not.toContain(USER_A)

    const detail = await detailAs(USER_A, slug)
    const byId = new Map<string, unknown>(
      detail.items.map((i: { post: { id: string }; savers: unknown }) => [i.post.id, i.savers]),
    )
    expect(usernames(byId.get('frog0')).sort()).toEqual(['ana', 'ben'])
    expect(usernames(byId.get('frog3'))).toEqual(['ana'])
    expect(detail.watchers).toEqual([])
  })

  it('never counts or names a private save, not even to its owner', async () => {
    await seedFrogs()
    save(USER_C, 'frog2', 'frog video number 2', { isPrivate: true })
    save(USER_C, 'frog3', 'frog video number 3', { isPrivate: true })
    const slug = await frogSlug()
    for (const who of [USER_A, USER_C]) {
      const [frog] = (await snapshotAs(who)).moments
      expect(frog.people).toBe(2)
      expect(usernames(frog.savers)).not.toContain('cal')
      const detail = await detailAs(who, slug)
      expect(JSON.stringify(detail)).not.toContain('"cal"')
    }
  })
})

describe('watching together', () => {
  it('names members tuned in to other members, and only counts for strangers', async () => {
    await seedFrogs()
    const slug = await frogSlug()
    const stranger = await openStream(null, slug)
    const ana = await openStream(USER_A, slug)
    const ben = await openStream(USER_B, slug)
    await settle()

    const last = (s: { of: (t: string) => Sse[] }) => s.of('watching').at(-1)!.data
    expect(last(ana)).toMatchObject({ slug, watching: 3 })
    expect(usernames(last(ana).watchers)).toEqual(['ben'])
    expect(usernames(last(ben).watchers)).toEqual(['ana'])
    expect(last(stranger).watching).toBe(3)
    expect(stranger.of('watching').every((e) => !('watchers' in e.data))).toBe(true)
    expect(JSON.stringify(stranger.events)).not.toContain('"username"')

    expect(usernames((await detailAs(USER_A, slug)).watchers)).toEqual(['ben'])
    expect(usernames((await snapshotAs(USER_A)).moments[0].watchers)).toEqual(['ben'])
    expect((await detailAs(null, slug)).watchers).toBeUndefined()

    // A banned account is never named.
    testInstance.db
      .insert(schema.userBans)
      .values({ userId: USER_B, createdAt: new Date().toISOString(), createdBy: 'admin' })
      .run()
    expect((await detailAs(USER_A, slug)).watchers).toEqual([])
    testInstance.db.delete(schema.userBans).run()

    await ben.close()
    expect(last(ana)).toMatchObject({ watching: 2, watchers: [] })
    await ana.close()
    await stranger.close()
  })

  it('names who just saved one, for members only', async () => {
    await seedFrogs()
    const slug = await frogSlug()
    const stranger = await openStream(null, slug)
    const ana = await openStream(USER_A, slug)
    save(USER_C, 'frog9', 'frog video number 9')
    await understood('frog9', topic(0, 9))
    await __moments.processNewSaves()
    await settle()

    const [mine] = ana.of('save')
    expect(mine.data.saver).toMatchObject({ username: 'cal', name: 'Cal', isYou: false })
    expect(usernames((mine.data.moment as { savers: unknown }).savers)).toContain('cal')
    const [theirs] = stranger.of('save')
    expect(theirs.data.saver).toBeUndefined()
    expect(JSON.stringify(theirs)).not.toContain('"username"')
    await ana.close()
    await stranger.close()
  })
})

describe('reactions', () => {
  it('are for members only, an allowed emoji or a few words, and never reach strangers', async () => {
    await seedFrogs()
    const slug = await frogSlug()
    const stranger = await openStream(null, slug)
    const ana = await openStream(USER_A, slug)
    const ben = await openStream(USER_B, slug)
    const post = { platform: 'twitter', id: 'frog0' }

    expect((await reactAs(null, slug, { emoji: '😂', ...post })).status).toBe(401)
    for (const emoji of ['🍆', 'lol', '😂😂', '', 42, null]) {
      expect((await reactAs(USER_A, slug, { emoji, ...post })).status).toBe(400)
    }
    const tooLong = 'x'.repeat(41)
    for (const text of ['', '   ', '\u0000\u0007', tooLong, 42]) {
      const res = await reactAs(USER_A, slug, { text, ...post })
      expect(res.status).toBe(400)
    }
    // Exactly one of the two.
    expect((await reactAs(USER_A, slug, { emoji: '😂', text: 'hi', ...post })).status).toBe(400)
    expect((await reactAs(USER_A, slug, { ...post })).status).toBe(400)
    expect((await reactAs(USER_A, slug, { emoji: '😂', platform: 'twitter' })).status).toBe(400)
    expect((await reactAs(USER_A, 'not-a-moment', { emoji: '😂', ...post })).status).toBe(404)

    expect((await reactAs(USER_A, slug, { emoji: '💀', ...post })).status).toBe(200)
    const said = await reactAs(USER_A, slug, {
      text: '  <b>who</b>\u202e sent\nthis 💀\u0007 ',
      ...post,
    })
    expect(said.status).toBe(200)
    // Forty characters is fine; an emoji counts as one.
    expect((await reactAs(USER_A, slug, { text: `${'y'.repeat(39)}💀`, ...post })).status).toBe(200)
    await settle()
    const [emoji, words] = ben.of('reaction')
    expect(emoji.data).toMatchObject({
      slug,
      emoji: '💀',
      post,
      saver: { username: 'ana', name: 'Ana', isYou: false },
    })
    expect(emoji.data.text).toBeUndefined()
    // Cleaned, and kept as plain text (the page renders it as text, never HTML).
    expect(words.data).toMatchObject({ text: '<b>who</b> sent this 💀' })
    expect(words.data.emoji).toBeUndefined()
    expect(ana.of('reaction')[0].data.saver).toMatchObject({ username: 'ana', isYou: true })
    expect(stranger.of('reaction')).toEqual([])
    expect(JSON.stringify(stranger.events)).not.toContain('who')

    await ana.close()
    await ben.close()
    await stranger.close()
  })

  it('are rate-limited per person, words more tightly', async () => {
    await seedFrogs()
    const slug = await frogSlug()
    const post = { platform: 'twitter', id: 'frog1' }
    for (let i = 0; i < 6; i++) {
      expect((await reactAs(USER_A, slug, { text: `again ${i}`, ...post })).status).toBe(200)
    }
    const words = await reactAs(USER_A, slug, { text: 'one more', ...post })
    expect(words.status).toBe(429)
    expect(words.headers.get('Retry-After')).toBeTruthy()
    // Emoji still go, up to the overall limit (7 spent so far).
    for (let i = 0; i < 13; i++) {
      expect((await reactAs(USER_A, slug, { emoji: '🔥', ...post })).status).toBe(200)
    }
    expect((await reactAs(USER_A, slug, { emoji: '🔥', ...post })).status).toBe(429)
    // Someone else still can.
    expect((await reactAs(USER_B, slug, { emoji: '🔥', ...post })).status).toBe(200)
  })
})

describe('the phone, live', () => {
  const key = () => createAccessKey(USER_A, 'iPhone', 'phone')!.key
  const phoneReq = (path: string, k?: string, init: RequestInit = {}) =>
    new Request(`${BASE}${path}`, {
      ...init,
      headers: { ...(k ? { authorization: `Bearer ${k}` } : {}), ...(init.headers ?? {}) },
    })

  it('needs a phone key', async () => {
    await seedFrogs()
    const slug = await frogSlug()
    expect((await appLiveGET(phoneReq('/api/app/live'))).status).toBe(401)
    expect((await appMomentGET(phoneReq(`/api/app/live/${slug}`), params(slug))).status).toBe(401)
    expect(
      (
        await appReactPOST(
          phoneReq(`/api/app/live/${slug}/react`, undefined, { method: 'POST', body: '{}' }),
          params(slug),
        )
      ).status,
    ).toBe(401)
    expect(
      (await appStreamGET(phoneReq(`/api/app/live/${slug}/stream`), params(slug))).status,
    ).toBe(401)
  })

  it('shows moments with names, covers as paths, and posts the phone plays', async () => {
    await seedFrogs()
    testInstance.db
      .insert(schema.bookmarkMedia)
      .values({
        id: 'm1',
        userId: USER_A,
        platform: 'twitter',
        bookmarkId: 'frog3',
        mediaType: 'video',
        originalUrl: 'https://video.example/frog3.mp4',
      } as never)
      .run()
    const slug = await frogSlug()
    const k = key()

    const live = await (await appLiveGET(phoneReq('/api/app/live', k))).json()
    const [frog] = live.moments
    expect(frog).toMatchObject({ slug, title: 'Frog', people: 2 })
    expect(usernames(frog.savers).sort()).toEqual(['ana', 'ben'])
    expect(frog.watchers).toEqual([])
    expect(frog.covers.length).toBeGreaterThan(0)
    for (const c of frog.covers) expect(c.startsWith('/') || c.startsWith('https://')).toBe(true)

    const res = await appMomentGET(phoneReq(`/api/app/live/${slug}`, k), params(slug))
    const detail = await res.json()
    expect(Object.keys(detail).sort()).toEqual([
      'items',
      'moment',
      'reactions',
      'removedKeys',
      'saverUpdates',
      'watchers',
    ])
    const frog3 = detail.items.find((p: { id: string }) => p.id === 'frog3')
    expect(frog3).toMatchObject({ platform: 'twitter', kind: 'video' })
    expect(usernames(frog3.savers)).toEqual(['ana'])
    expect(frog3.media[0].url.startsWith('/api/files/')).toBe(true)
    const frog0 = detail.items.find((p: { id: string }) => p.id === 'frog0')
    expect(usernames(frog0.savers).sort()).toEqual(['ana', 'ben'])

    const gone = await appMomentGET(phoneReq('/api/app/live/nope', k), params('nope'))
    expect(gone.status).toBe(404)
    expect((await gone.json()).code).toBe('moment_gone')
  })

  it('tunes in by name and reacts, with the same events as the web', async () => {
    await seedFrogs()
    const slug = await frogSlug()
    const k = key()
    const controller = new AbortController()
    const phone = collect(
      await appStreamGET(
        phoneReq(`/api/app/live/${slug}/stream`, k, { signal: controller.signal }),
        params(slug),
      ),
      controller,
    )
    const ben = await openStream(USER_B, slug)
    await settle()
    // Ben (on the web) sees Ana (on her phone) watching.
    expect(usernames(ben.of('watching').at(-1)!.data.watchers)).toEqual(['ana'])
    expect(usernames(phone.of('watching').at(-1)!.data.watchers)).toEqual(['ben'])

    const bad = await appReactPOST(
      phoneReq(`/api/app/live/${slug}/react`, k, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji: '🍆', platform: 'twitter', id: 'frog0' }),
      }),
      params(slug),
    )
    expect(bad.status).toBe(400)
    expect((await bad.json()).code).toBe('bad_reaction')

    const ok = await appReactPOST(
      phoneReq(`/api/app/live/${slug}/react`, k, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'more of this', platform: 'twitter', id: 'frog0' }),
      }),
      params(slug),
    )
    expect(ok.status).toBe(200)
    await settle()
    expect(ben.of('reaction')[0].data).toMatchObject({
      text: 'more of this',
      saver: { username: 'ana' },
    })
    expect(phone.of('reaction')[0].data.saver).toMatchObject({ username: 'ana', isYou: true })

    // New saves arrive as posts the phone plays, named.
    save(USER_C, 'frog9', 'frog video number 9')
    await understood('frog9', topic(0, 9))
    await __moments.processNewSaves()
    await settle()
    const [arrived] = phone.of('save')
    const item = arrived.data.item as { post: { id: string; kind: string; savers: unknown } }
    expect(item.post).toMatchObject({ id: 'frog9', kind: 'text' })
    expect(usernames(item.post.savers)).toEqual(['cal'])
    expect(arrived.data.saver).toMatchObject({ username: 'cal' })
    // Only this moment's events: no snapshots or stats.
    expect(phone.events.some((e) => e.type === 'snapshot' || e.type === 'stats')).toBe(false)

    await phone.close()
    await ben.close()
  })
})

describe('phone room leases and cached post refresh', () => {
  const session = 'phone-room-session-12345'
  async function poll(slug: string, key: string, watch = session, known: string[] = []) {
    return appMomentPOST(
      new NextRequest(`${BASE}/api/app/live/${slug}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'X-ADHX-Watch': watch,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ known }),
      }),
      params(slug),
    )
  }

  it('counts one member across two phones and a web stream, and leaving one screen keeps the others', async () => {
    await seedFrogs()
    const slug = await frogSlug()
    const key = createAccessKey(USER_A, 'Phone', 'phone')!.key
    const web = await openStream(USER_A, slug)
    try {
      await poll(slug, key)
      await poll(slug, key, 'second-phone-session-12345')
      expect((await detailAs(USER_B, slug)).moment.watching).toBe(1)
      expect(usernames((await detailAs(USER_B, slug)).watchers)).toEqual(['ana'])
      await appMomentDELETE(
        new NextRequest(`${BASE}/api/app/live/${slug}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${key}`, 'X-ADHX-Watch': session },
        }),
        params(slug),
      )
      await web.close()
      expect((await detailAs(USER_B, slug)).moment.watching).toBe(1)
      await appMomentDELETE(
        new NextRequest(`${BASE}/api/app/live/${slug}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${key}`, 'X-ADHX-Watch': 'second-phone-session-12345' },
        }),
        params(slug),
      )
      expect((await detailAs(USER_B, slug)).moment.watching).toBe(0)
    } finally {
      await web.close()
    }
  })

  it('does not join on a normal detail read; rejects malformed sessions and unknown keys', async () => {
    await seedFrogs()
    const slug = await frogSlug()
    const key = createAccessKey(USER_A, 'Phone', 'phone')!.key
    await appMomentGET(
      new Request(`${BASE}/api/app/live/${slug}`, { headers: { Authorization: `Bearer ${key}` } }),
      params(slug),
    )
    expect((await detailAs(USER_B, slug)).moment.watching).toBe(0)
    expect((await poll(slug, key, 'bad')).status).toBe(400)
    expect((await poll(slug, 'invalid-key')).status).toBe(401)
    expect((await poll(slug, key, session, Array(201).fill('twitter:frog0'))).status).toBe(400)
  })

  it('corrects a quiet web room when a disconnected phone lease expires', async () => {
    await seedFrogs()
    const slug = await frogSlug()
    const key = createAccessKey(USER_A, 'Phone', 'phone')!.key
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const web = await openStream(USER_B, slug)
    try {
      await poll(slug, key)
      await settle()
      expect(web.of('watching').at(-1)?.data.watching).toBe(2)
      const announces = web.of('watching').length
      await poll(slug, key)
      await settle()
      expect(web.of('watching')).toHaveLength(announces) // ordinary heartbeats do not fan out room-wide
      await vi.advanceTimersByTimeAsync(20_001)
      expect(web.of('watching').at(-1)?.data.watching).toBe(1)
      expect(usernames(web.of('watching').at(-1)?.data.watchers)).toEqual([])
    } finally {
      vi.useRealTimers()
      await web.close()
    }
  })

  it('bounds streamed request bodies before buffering and rejects malformed known keys', async () => {
    await seedFrogs()
    const slug = await frogSlug()
    const key = createAccessKey(USER_A, 'Phone', 'phone')!.key
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(45_001))
      },
      cancel,
    })
    const response = await appMomentPOST(
      new Request(`${BASE}/api/app/live/${slug}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body,
        duplex: 'half',
      } as RequestInit),
      params(slug),
    )
    expect(response.status).toBe(400)
    expect(cancel).toHaveBeenCalledOnce()
    expect((await poll(slug, key, session, ['twitter:../escape'])).status).toBe(400)
  })

  it('expires a disconnected phone after 15 seconds and immediately excludes a revoked key or banned account', async () => {
    await seedFrogs()
    const slug = await frogSlug()
    const { key, id } = createAccessKey(USER_A, 'Phone', 'phone')!
    await poll(slug, key)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 15_001)
    expect((await detailAs(USER_B, slug)).moment.watching).toBe(0)
    clock.mockRestore()
    await poll(slug, key)
    testInstance.sqlite.prepare('DELETE FROM access_keys WHERE id = ?').run(id)
    expect(usernames((await detailAs(USER_B, slug)).watchers)).toEqual([])
    expect((await detailAs(USER_B, slug)).moment.watching).toBe(0)
    const replacement = createAccessKey(USER_A, 'Phone2', 'phone')!.key
    await poll(slug, replacement)
    testInstance.sqlite
      .prepare(
        'INSERT INTO user_bans (user_id, reason, created_at, created_by) VALUES (?, ?, ?, ?)',
      )
      .run(USER_A, 'test', new Date().toISOString(), USER_B)
    expect(usernames((await detailAs(USER_B, slug)).watchers)).toEqual([])
  })

  it('refreshes older cached saver metadata and explicitly removes newly private saves without pruning by latest60 absence', async () => {
    await seedFrogs()
    // All are near the same topic and belong to one moment; frog0 is older than its newest60.
    for (let i = 6; i < 76; i++) {
      save(USER_A, `frog${i}`, `frog video number ${i}`, {
        processedAt: new Date(Date.now() + i).toISOString(),
      })
      await understood(`frog${i}`, topic(0, i + 1))
    }
    const vector = new Float32Array(768)
    vector[0] = 1
    const base = Date.now() - 100_000
    for (let i = 0; i < 76; i++) {
      await understood(`frog${i}`, vector)
      testInstance.sqlite
        .prepare('UPDATE bookmarks SET processed_at = ? WHERE id = ?')
        .run(new Date(base + i * 1000).toISOString(), `frog${i}`)
    }
    save(USER_B, 'frog75', 'frog video number 75', {
      processedAt: new Date(base + 75_000).toISOString(),
    })
    const slug = await frogSlug()
    const key = createAccessKey(USER_C, 'Phone', 'phone')!.key
    const first = await (await poll(slug, key, session, ['twitter:frog0', 'twitter:frog3'])).json()
    expect(first.items).toHaveLength(60)
    expect(first.items.some((p: { id: string }) => p.id === 'frog0')).toBe(false)
    expect(
      first.saverUpdates.find((p: { key: string }) => p.key === 'twitter:frog0').savers,
    ).toHaveLength(2)
    expect(Object.keys(first.saverUpdates[0]).sort()).toEqual(['isPrivate', 'key', 'savers'])
    testInstance.sqlite
      .prepare("UPDATE bookmarks SET is_private = 1 WHERE user_id = ? AND id IN ('frog0', 'frog3')")
      .run(USER_A)
    const second = await (await poll(slug, key, session, ['twitter:frog0', 'twitter:frog3'])).json()
    expect(
      usernames(second.saverUpdates.find((p: { key: string }) => p.key === 'twitter:frog0').savers),
    ).toEqual(['ben'])
    expect(second.removedKeys).toEqual(['twitter:frog3'])
    expect(
      second.saverUpdates.find((p: { key: string }) => p.key === 'twitter:frog0').isPrivate,
    ).toBe(false)
    testInstance.sqlite
      .prepare("UPDATE bookmarks SET is_private = 1 WHERE user_id = ? AND id = 'frog75'")
      .run(USER_A)
    const ownerKey = createAccessKey(USER_A, 'Owner phone', 'phone')!.key
    const owner = await (await poll(slug, ownerKey, session, ['twitter:frog0'])).json()
    expect(
      owner.saverUpdates.find((p: { key: string }) => p.key === 'twitter:frog0'),
    ).toMatchObject({ isPrivate: true })
    expect(
      usernames(owner.saverUpdates.find((p: { key: string }) => p.key === 'twitter:frog0').savers),
    ).toEqual(['ben'])
    expect(owner.items.find((p: { id: string }) => p.id === 'frog75').isPrivate).toBe(true)
    const strangerToSave = await (await poll(slug, key)).json()
    expect(strangerToSave.items.find((p: { id: string }) => p.id === 'frog75').isPrivate).toBe(
      false,
    )
    expect(JSON.stringify((await snapshotAs(null)).moments)).not.toContain('username')
  })
})

describe('notes in moments', () => {
  const session = 'phone-room-notes-12345'
  const WORDS = /welcome|whisper|original|jump in/

  async function seedNotes() {
    await seedFrogs()
    save(USER_C, 'frog2', 'frog video number 2', { isPrivate: true, note: 'whisper words' })
    testInstance.sqlite.exec(`
      UPDATE bookmarks SET note = 'you’re welcome' WHERE user_id = '${USER_B}' AND id = 'frog0';
      UPDATE bookmarks SET note = 'the original' WHERE user_id = '${USER_A}' AND id = 'frog1';
    `)
    return frogSlug()
  }

  it('members see notes on each post’s savers; strangers and private saves never', async () => {
    const slug = await seedNotes()
    const outside = [await snapshotAs(null), await detailAs(null, slug)]
    for (const out of outside) expect(JSON.stringify(out)).not.toMatch(WORDS)

    const detail = await detailAs(USER_A, slug)
    const frog0 = detail.items.find((i: { post: { id: string } }) => i.post.id === 'frog0')
    expect(frog0.savers).toContainEqual(
      expect.objectContaining({ username: 'ben', note: 'you’re welcome' }),
    )
    expect(JSON.stringify(detail)).not.toContain('whisper')
    // Moments never name a private save, so its note stays out even for its owner.
    expect(JSON.stringify(await detailAs(USER_C, slug))).not.toContain('whisper')

    // The faces on a moment card stand for the whole moment: no one post's note.
    const [frog] = (await snapshotAs(USER_A)).moments
    expect(frog.savers.length).toBeGreaterThan(0)
    for (const s of frog.savers) expect(s).not.toHaveProperty('note')
  })

  it('the phone: live posts and the poll carry notes for members only', async () => {
    const slug = await seedNotes()
    const key = createAccessKey(USER_A, 'Phone', 'phone')!.key
    const req = new Request(`${BASE}/api/app/live/${slug}`, {
      headers: { authorization: `Bearer ${key}` },
    })
    const detail = await (await appMomentGET(req, params(slug))).json()
    const frog0 = detail.items.find((p: { id: string }) => p.id === 'frog0')
    expect(frog0.savers).toContainEqual(
      expect.objectContaining({ username: 'ben', note: 'you’re welcome' }),
    )
    expect(JSON.stringify(detail)).not.toContain('whisper')

    const live = await (
      await appLiveGET(
        new Request(`${BASE}/api/app/live`, { headers: { authorization: `Bearer ${key}` } }),
      )
    ).json()
    expect(JSON.stringify(live)).not.toContain('whisper')

    const poll = await (
      await appMomentPOST(
        new NextRequest(`${BASE}/api/app/live/${slug}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'X-ADHX-Watch': session,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ known: ['twitter:frog0', 'twitter:frog2'] }),
        }),
        params(slug),
      )
    ).json()
    // frog0 is still among the posts sent; older cached ones come as saverUpdates.
    const polled =
      poll.saverUpdates.find((u: { key: string }) => u.key === 'twitter:frog0') ??
      poll.items.find((p: { id: string }) => p.id === 'frog0')
    expect(polled.savers).toContainEqual(
      expect.objectContaining({ username: 'ben', note: 'you’re welcome' }),
    )
    expect(JSON.stringify(poll)).not.toContain('whisper')
    // The cached-post refresh the poll sends for older posts.
    const { momentSaverUpdates } = await import('@/lib/moments/people')
    const updates = momentSaverUpdates(['twitter:frog0', 'twitter:frog2'], USER_A)
    expect(updates[0].savers).toContainEqual(
      expect.objectContaining({ username: 'ben', note: 'you’re welcome' }),
    )
    expect(usernames(updates[1].savers)).toEqual(['ana'])
    expect(JSON.stringify(updates)).not.toContain('whisper')
    expect(JSON.stringify(momentSaverUpdates(['twitter:frog2'], USER_C))).not.toContain('whisper')
    expect(
      (await appMomentGET(new Request(`${BASE}/api/app/live/${slug}`), params(slug))).status,
    ).toBe(401)
  })

  it('an arriving save carries its note to members, never to strangers', async () => {
    const slug = await seedNotes()
    const stranger = await openStream(null, slug)
    const ana = await openStream(USER_A, slug)
    save(USER_C, 'frog9', 'frog video number 9', { note: 'jump in' })
    await understood('frog9', topic(0, 9))
    await __moments.processNewSaves()
    await settle()
    const [mine] = ana.of('save')
    expect(mine.data.saver).toMatchObject({ username: 'cal', note: 'jump in' })
    // The moment's faces stay note-free.
    expect(JSON.stringify((mine.data.moment as { savers: unknown }).savers)).not.toContain(
      'jump in',
    )
    expect(JSON.stringify(stranger.events)).not.toMatch(WORDS)
    await ana.close()
    await stranger.close()
  })
})

describe('how busy a moment is lately ("3 saves in 10 min")', () => {
  const at = (minutesAgo: number, now: number) =>
    ({
      username: `u${minutesAgo}`,
      name: null,
      avatarUrl: null,
      savedAt: new Date(now - minutesAgo * 60_000).toISOString(),
      isYou: false,
    }) as const

  it('counts the last hour over the smallest step that holds it', async () => {
    const { recentOf } = await import('@/lib/moments/people')
    const now = Date.parse('2026-10-20T20:00:00.000Z')
    expect(recentOf([], now)).toEqual({ recentSaves: 0, windowMinutes: 60 })
    expect(recentOf([[at(4, now), at(7, now)], [at(10, now)]], now)).toEqual({
      recentSaves: 3,
      windowMinutes: 10,
    })
    expect(recentOf([[at(1, now)]], now)).toEqual({ recentSaves: 1, windowMinutes: 5 })
    // Whole minutes, like the rows' "10 min ago".
    expect(recentOf([[at(10.7, now)]], now)).toEqual({ recentSaves: 1, windowMinutes: 10 })
    expect(recentOf([[at(11, now)]], now)).toEqual({ recentSaves: 1, windowMinutes: 15 })
    expect(recentOf([[at(12, now), at(2, now)]], now)).toEqual({
      recentSaves: 2,
      windowMinutes: 15,
    })
    // Older than an hour doesn't count; a save "from the future" neither.
    expect(recentOf([[at(90, now), at(-5, now), at(40, now)]], now)).toEqual({
      recentSaves: 1,
      windowMinutes: 60,
    })
  })

  it('members get recentSaves and windowMinutes; private and old saves never count', async () => {
    await seedFrogs()
    // Cal's private saves of two frogs: not counted, not even for Cal.
    save(USER_C, 'frog2', 'frog video number 2', { isPrivate: true })
    save(USER_C, 'frog3', 'frog video number 3', { isPrivate: true })
    await frogSlug()
    for (const who of [USER_A, USER_C]) {
      const [frog] = (await snapshotAs(who)).moments
      // Ana's six and Ben's two, all just now.
      expect(frog).toMatchObject({ recentSaves: 8, windowMinutes: 5 })
    }
    // Strangers keep the old shape (see "moments signed out").
    const [anon] = (await snapshotAs(null)).moments
    expect(anon).not.toHaveProperty('recentSaves')
    expect(anon).not.toHaveProperty('windowMinutes')
  })

  it('the phone’s live snapshot carries the same figure', async () => {
    await seedFrogs()
    await frogSlug()
    const k = createAccessKey(USER_A, 'iPhone', 'phone')!.key
    const live = await (
      await appLiveGET(
        new Request(`${BASE}/api/app/live`, { headers: { authorization: `Bearer ${k}` } }),
      )
    ).json()
    expect(live.moments[0]).toMatchObject({ recentSaves: 8, windowMinutes: 5 })
  })
})
