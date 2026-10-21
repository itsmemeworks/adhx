import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestBookmark, createTestDb, type TestDbInstance } from './setup'

/**
 * Notes on saves (docs/specs/friends-feed.md): a few words for your people,
 * set on any save path or edited later, cleaned and capped at 140 characters.
 * Only ever written to your own save; admins can clear them.
 */

let testInstance: TestDbInstance
let sessionUser: string | null = 'u_ana'

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))
vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(async () => sessionUser),
}))
vi.mock('@/lib/sentry', () => ({
  metrics: new Proxy({}, { get: () => vi.fn() }),
  metricCount: vi.fn(),
  captureException: vi.fn(),
}))
vi.mock('@/lib/semantic', () => ({ noteSaved: vi.fn(), PRIORITY: { sync: 1, urgent: 100 } }))
const mockDescribe = vi.fn()
vi.mock('@/lib/keep/describe', () => ({
  describeNetworkPost: (...args: unknown[]) => mockDescribe(...args),
}))
vi.mock('@/lib/keep/worker', () => ({ wakeKeep: () => {}, keepCutoff: () => null }))

import { cleanNote, NOTE_MAX, noteLength } from '@/lib/people/note-text'
import { noteOption } from '@/lib/bookmarks/note'

const mockFetch = vi.fn()
const BASE = 'https://adhx.test'
const ANA = 'u_ana'
const BEN = 'u_ben'
const YT = 'Y9aytLYBajw'

function request(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  method = 'POST',
) {
  return new NextRequest(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const row = (userId: string, id: string) =>
  testInstance.db
    .select()
    .from(schema.bookmarks)
    .all()
    .find((r) => r.userId === userId && r.id === id)

async function phoneKey(userId = ANA): Promise<string> {
  const { createAccessKey } = await import('@/lib/auth/access-keys')
  return createAccessKey(userId, 'iPhone', 'phone')!.key
}

async function patchNote(id: string, body: unknown) {
  const { PATCH } = await import('@/app/api/bookmarks/[id]/note/route')
  const res = await PATCH(request(`/api/bookmarks/${id}/note`, body, {}, 'PATCH'), {
    params: Promise.resolve({ id }),
  })
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  testInstance = createTestDb()
  sessionUser = ANA
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  testInstance.db
    .insert(schema.users)
    .values([
      { id: ANA, username: 'ana', displayName: 'Ana', role: 'admin' },
      { id: BEN, username: 'ben', displayName: 'Ben' },
    ] as never)
    .run()
  mockDescribe.mockImplementation(async () => ({
    author: 'rickastley',
    authorName: 'Rick Astley',
    text: 'Never Gonna Give You Up',
    createdAt: '2009-10-25T00:00:00.000Z',
    category: 'video',
    videos: 1,
    photos: 0,
    durationMs: 213_000,
    audioOnly: false,
  }))
  mockFetch.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      tweet: {
        id: '111',
        text: 'a tweet',
        created_at: '2026-01-15T12:00:00Z',
        author: { screen_name: 'someone', name: 'Someone' },
      },
    }),
  }))
})

afterEach(() => {
  testInstance.close()
  vi.unstubAllGlobals()
})

describe('cleanNote', () => {
  it('collapses whitespace, trims, and drops control and direction characters', () => {
    expect(cleanNote('  making\n\tthis   Sunday  ')).toBe('making this Sunday')
    expect(cleanNote('you‮re welcome⁦\u0007')).toBe('youre welcome')
    expect(cleanNote('a‏b؜c')).toBe('abc')
  })

  it('makes an empty note null', () => {
    expect(cleanNote('')).toBeNull()
    expect(cleanNote(' \n‮ ')).toBeNull()
  })

  it('caps at 140 characters, counting each emoji as one', () => {
    const family = '👨‍👩‍👧'
    expect(noteLength(family)).toBe(1)
    expect(noteLength('🇬🇧 ok')).toBe(4)
    const long = family.repeat(150)
    const clean = cleanNote(long)!
    expect(noteLength(clean)).toBe(NOTE_MAX)
    expect(clean).toBe(family.repeat(140))
    expect(cleanNote('x'.repeat(200))).toBe('x'.repeat(140))
  })

  it('noteOption reads a body: undefined when absent or not text', () => {
    expect(noteOption({})).toBeUndefined()
    expect(noteOption({ note: 3 })).toBeUndefined()
    expect(noteOption({ note: null })).toBeNull()
    expect(noteOption({ note: '   ' })).toBeNull()
    expect(noteOption({ note: ' hi ' })).toBe('hi')
  })
})

describe('every save path takes a note', () => {
  it('/api/tweets/add: a new save keeps it, a repeat save replaces or clears it', async () => {
    const { POST } = await import('@/app/api/tweets/add/route')
    const url = 'https://x.com/someone/status/111'
    expect(
      (await POST(request('/api/tweets/add', { url, note: '  you’re  welcome ' }))).status,
    ).toBe(200)
    expect(row(ANA, '111')!.note).toBe('you’re welcome')

    // Without `note`, a repeat save leaves it alone.
    await POST(request('/api/tweets/add', { url }))
    expect(row(ANA, '111')!.note).toBe('you’re welcome')

    const res = await POST(request('/api/tweets/add', { url, note: 'still funny' }))
    expect(await res.json()).toMatchObject({ isDuplicate: true, bookmark: { note: 'still funny' } })
    expect(row(ANA, '111')!.note).toBe('still funny')

    await POST(request('/api/tweets/add', { url, note: '' }))
    expect(row(ANA, '111')!.note).toBeNull()
  })

  it('/api/bookmarks/add (a link network)', async () => {
    const { POST } = await import('@/app/api/bookmarks/add/route')
    const res = await POST(
      request('/api/bookmarks/add', { url: `https://youtu.be/${YT}`, note: 'you’re welcome' }),
    )
    expect(res.status).toBe(200)
    expect(row(ANA, YT)!.note).toBe('you’re welcome')
    await POST(request('/api/bookmarks/add', { url: `https://youtu.be/${YT}`, note: null }))
    expect(row(ANA, YT)!.note).toBeNull()
  })

  it('/api/bookmarks/add without a note stores none', async () => {
    const { POST } = await import('@/app/api/bookmarks/add/route')
    await POST(request('/api/bookmarks/add', { url: `https://youtu.be/${YT}` }))
    expect(row(ANA, YT)!.note).toBeNull()
  })

  it('/api/app/save, saved at once', async () => {
    const key = await phoneKey()
    const { POST } = await import('@/app/api/app/save/route')
    const res = await POST(
      request(
        '/api/app/save',
        { url: `https://youtu.be/${YT}`, note: 'this is so you, Ben' },
        { authorization: `Bearer ${key}` },
      ),
    )
    expect(res.status).toBe(200)
    expect(row(ANA, YT)!.note).toBe('this is so you, Ben')
  })

  it('/api/app/save, queued: the note waits with the share', async () => {
    const key = await phoneKey()
    const { POST } = await import('@/app/api/app/save/route')
    const headers = { authorization: `Bearer ${key}`, prefer: 'respond-async' }
    const res = await POST(
      request(
        '/api/app/save',
        { url: `https://youtu.be/${YT}`, note: ' making this Sunday ' },
        headers,
      ),
    )
    expect(res.status).toBe(202)
    const queued = testInstance.db.select().from(schema.phoneSaveQueue).all()
    expect(queued[0].note).toBe('making this Sunday')
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    expect(await saveQueueTick()).toBe(1)
    expect(row(ANA, YT)!.note).toBe('making this Sunday')
  })

  it('/api/app/save, queued: an empty note clears a repeat save’s note; none leaves it', async () => {
    testInstance.db
      .insert(schema.bookmarks)
      .values(createTestBookmark(ANA, YT, { platform: 'youtube', note: 'old words' }))
      .run()
    const key = await phoneKey()
    const { POST } = await import('@/app/api/app/save/route')
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    const headers = { authorization: `Bearer ${key}`, prefer: 'respond-async' }
    await POST(request('/api/app/save', { url: `https://youtu.be/${YT}` }, headers))
    await saveQueueTick()
    expect(row(ANA, YT)!.note).toBe('old words')
    await POST(request('/api/app/save', { url: `https://youtu.be/${YT}`, note: '' }, headers))
    await saveQueueTick()
    expect(row(ANA, YT)!.note).toBeNull()
  })
})

describe('PATCH /api/bookmarks/[id]/note', () => {
  beforeEach(() => {
    testInstance.db
      .insert(schema.bookmarks)
      .values([createTestBookmark(ANA, '1'), createTestBookmark(BEN, '1', { note: 'Ben’s words' })])
      .run()
  })

  it('needs sign-in, a string or null, and your own save', async () => {
    sessionUser = null
    expect((await patchNote('1', { platform: 'twitter', note: 'hi' })).status).toBe(401)
    sessionUser = ANA
    expect((await patchNote('1', { platform: 'twitter', note: 5 })).status).toBe(400)
    expect((await patchNote('1', { platform: 'twitter' })).status).toBe(400)
    expect((await patchNote('1', { platform: 'tiktok', note: 'hi' })).status).toBe(404)
    expect((await patchNote('nope', { platform: 'twitter', note: 'hi' })).status).toBe(404)
  })

  it('sets and clears only your own note', async () => {
    expect(
      await patchNote('1', { platform: 'twitter', note: '  the original\nand still the best ' }),
    ).toEqual({
      status: 200,
      body: { note: 'the original and still the best' },
    })
    expect(row(ANA, '1')!.note).toBe('the original and still the best')
    expect(row(BEN, '1')!.note).toBe('Ben’s words')
    expect(await patchNote('1', { platform: 'twitter', note: '' })).toEqual({
      status: 200,
      body: { note: null },
    })
    expect(await patchNote('1', { note: null })).toEqual({ status: 200, body: { note: null } })
    expect(row(BEN, '1')!.note).toBe('Ben’s words')
  })
})

describe('POST /api/app/note', () => {
  async function phoneNote(key: string | null, body: unknown) {
    const { POST } = await import('@/app/api/app/note/route')
    const res = await POST(
      request('/api/app/note', body, key ? { authorization: `Bearer ${key}` } : {}),
    )
    return { status: res.status, body: await res.json() }
  }

  it('sets and clears the phone’s member’s note, nobody else’s', async () => {
    testInstance.db
      .insert(schema.bookmarks)
      .values([createTestBookmark(ANA, '1'), createTestBookmark(BEN, '2')])
      .run()
    sessionUser = null
    expect((await phoneNote(null, { platform: 'twitter', id: '1', note: 'hi' })).status).toBe(401)
    const key = await phoneKey()
    expect((await phoneNote(key, { platform: 'twitter', id: '1' })).status).toBe(400)
    expect((await phoneNote(key, { id: '1', note: 'hi' })).status).toBe(400)
    expect(await phoneNote(key, { platform: 'twitter', id: '2', note: 'mine now' })).toMatchObject({
      status: 404,
      body: { code: 'not_saved' },
    })
    expect(row(BEN, '2')!.note).toBeNull()
    expect(await phoneNote(key, { platform: 'twitter', id: '1', note: 'you’re welcome' })).toEqual({
      status: 200,
      body: { note: 'you’re welcome' },
    })
    expect(await phoneNote(key, { platform: 'twitter', id: '1', note: '' })).toEqual({
      status: 200,
      body: { note: null },
    })
  })
})

describe('moderation', () => {
  it('admins clear a note (one member’s or all) with an audit row; others can’t', async () => {
    testInstance.db
      .insert(schema.users)
      .values({ id: 'u_cal', username: 'cal' } as never)
      .run()
    testInstance.db
      .insert(schema.bookmarks)
      .values([
        createTestBookmark(ANA, '1', { note: 'fine' }),
        createTestBookmark(BEN, '1', { note: 'rude' }),
        createTestBookmark('u_cal', '1', { note: 'also rude' }),
      ])
      .run()
    const { POST } = await import('@/app/api/admin/posts/route')
    const admin = (body: unknown) => POST(request('/api/admin/posts', body))

    sessionUser = BEN
    expect((await admin({ platform: 'twitter', id: '1', clearNotes: true })).status).toBe(403)
    expect(row(BEN, '1')!.note).toBe('rude')

    sessionUser = ANA
    expect((await admin({ platform: 'twitter', id: '1', clearNotes: 5 })).status).toBe(400)
    const one = await admin({ platform: 'twitter', id: '1', clearNotes: 'ben' })
    expect(await one.json()).toMatchObject({ notesCleared: 1 })
    expect(row(BEN, '1')!.note).toBeNull()
    expect(row(ANA, '1')!.note).toBe('fine')

    const all = await admin({ platform: 'twitter', id: '1', clearNotes: true })
    expect(await all.json()).toMatchObject({ notesCleared: 2 })
    expect(row(ANA, '1')!.note).toBeNull()
    expect(row('u_cal', '1')!.note).toBeNull()
    // Clearing isn't hiding.
    expect(testInstance.db.select().from(schema.moderatedPosts).all()).toHaveLength(0)
    const audit = testInstance.db.select().from(schema.adminAudit).all()
    expect(audit.map((a) => a.action)).toEqual(['clear_note', 'clear_note'])
  })
})
