import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * The phone app: pairing codes, phone keys (scope `phone`), and the
 * /api/app/* routes the share sheet calls.
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

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: vi.fn(async () => sessionUser),
  clearSessionCookie: vi.fn(),
}))

vi.mock('@/lib/sentry', () => ({
  metrics: { bookmarkAdded: vi.fn(), dataCleared: vi.fn() },
  captureException: vi.fn(),
}))

vi.mock('@/lib/semantic', () => ({ noteSaved: vi.fn(), PRIORITY: { sync: 1 } }))
vi.mock('@/lib/semantic/find', () => ({ findPosts: vi.fn() }))

const mockDescribeNetworkPost = vi.fn()
vi.mock('@/lib/keep/describe', () => ({
  describeNetworkPost: (...args: unknown[]) => mockDescribeNetworkPost(...args),
  describeNetworkPostOrWhy: async (...args: unknown[]) => {
    const described = await mockDescribeNetworkPost(...args)
    return described ? { described } : { why: 'gone' }
  },
}))

const wakeKeep = vi.fn()
/** KEEP_BACKFILL=off: saves before this are never kept (null = everything is). */
let cutoff: string | null = null
vi.mock('@/lib/keep/worker', () => ({ wakeKeep: () => wakeKeep(), keepCutoff: () => cutoff }))
/** Media keeping is off under test unless a test turns it on. */
let keepOn = false
vi.mock('@/lib/keep/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/keep/config')>()),
  keepEnabled: () => keepOn,
}))

const VIDEO_ID = 'Y9aytLYBajw'
const BASE = 'https://adhx.test'

const json = (path: string, body: unknown, key?: string) =>
  new NextRequest(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  })

const get = (path: string, key?: string) =>
  new NextRequest(`${BASE}${path}`, key ? { headers: { authorization: `Bearer ${key}` } } : {})

async function newCode(): Promise<{ code: string; expiresAt: string }> {
  const { POST } = await import('@/app/api/app/pairing/route')
  const res = await POST(new NextRequest(`${BASE}/api/app/pairing`, { method: 'POST' }))
  expect(res.status).toBe(201)
  return res.json()
}

async function pair(code: string, name = 'iPhone') {
  const { POST } = await import('@/app/api/app/pair/route')
  const res = await POST(json('/api/app/pair', { code, name }))
  return { status: res.status, body: await res.json() }
}

/** Pair a phone for user-1 and return its key. */
async function phoneKey(name = 'iPhone'): Promise<string> {
  const { code } = await newCode()
  const { status, body } = await pair(code, name)
  expect(status).toBe(201)
  return body.key
}

async function save(body: unknown, key: string) {
  const { POST } = await import('@/app/api/app/save/route')
  const res = await POST(json('/api/app/save', body, key))
  return { status: res.status, body: await res.json() }
}

async function status(platform: string, id: string, key: string) {
  const { GET } = await import('@/app/api/app/status/route')
  const res = await GET(
    get(`/api/app/status?platform=${platform}&id=${encodeURIComponent(id)}`, key),
  )
  return { status: res.status, body: await res.json() }
}

beforeEach(async () => {
  testInstance = createTestDb()
  sessionUser = 'user-1'
  cutoff = null
  keepOn = false
  vi.clearAllMocks()
  await testInstance.db.insert(schema.users).values([
    { id: 'user-1', username: 'one' },
    { id: 'user-2', username: 'two' },
  ])
  mockDescribeNetworkPost.mockResolvedValue({
    author: 'somechannel',
    authorName: 'Some Channel',
    text: 'a video',
    createdAt: '2026-01-02T00:00:00.000Z',
    category: 'video',
    videos: 1,
    photos: 0,
    durationMs: 42_000,
    audioOnly: false,
  })
})

afterEach(() => {
  testInstance.close()
  vi.unstubAllGlobals()
})

describe('pairing', () => {
  it('makes an 8-character code that lasts 10 minutes and keeps only its hash', async () => {
    const before = Date.now()
    const { code, expiresAt } = await newCode()
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/)
    const ttl = Date.parse(expiresAt) - before
    expect(ttl).toBeGreaterThan(9.9 * 60_000)
    expect(ttl).toBeLessThanOrEqual(10 * 60_000 + 1000)
    const rows = testInstance.db.select().from(schema.appPairCodes).all()
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain(code)
  })

  it('needs a session to make a code', async () => {
    sessionUser = null
    const { POST } = await import('@/app/api/app/pairing/route')
    const res = await POST(new NextRequest(`${BASE}/api/app/pairing`, { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('trades a code for a phone key once, typed in any case with a dash', async () => {
    const { code } = await newCode()
    sessionUser = null // the phone has no cookie
    const typed = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`
    const first = await pair(typed, '  Pixel   8 ')
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ name: 'Pixel 8', username: 'one' })
    expect(first.body.key).toMatch(/^adhx_[A-Za-z0-9_-]{43}$/)

    const [row] = testInstance.db.select().from(schema.accessKeys).all()
    expect(row).toMatchObject({ userId: 'user-1', scope: 'phone', name: 'Pixel 8' })

    const again = await pair(code)
    expect(again.status).toBe(400)
    expect(again.body.code).toBe('bad_code')
    expect(testInstance.db.select().from(schema.accessKeys).all()).toHaveLength(1)
  })

  it('refuses an expired code, an unknown code, and a code replaced by a newer one', async () => {
    const { code: old } = await newCode()
    const { code: fresh } = await newCode()
    expect((await pair(old)).body.code).toBe('bad_code')

    testInstance.db
      .update(schema.appPairCodes)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(schema.appPairCodes.userId, 'user-1'))
      .run()
    expect((await pair(fresh)).body.code).toBe('bad_code')
    expect((await pair('ZZZZZZZZ')).status).toBe(400)
    expect((await pair('nope')).status).toBe(400)
    expect(testInstance.db.select().from(schema.accessKeys).all()).toHaveLength(0)
  })

  it('stops at ten phones', async () => {
    for (let i = 0; i < 10; i++) await phoneKey(`phone ${i}`)
    const { code } = await newCode()
    const res = await pair(code)
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('too_many')
  })
})

describe('connected phones', () => {
  it('lists phones apart from the Claude keys, and removing one stops its key', async () => {
    const key = await phoneKey('iPhone')
    const { POST: makeSearchKey, GET: listSearchKeys } = await import('@/app/api/access-keys/route')
    await makeSearchKey(json('/api/access-keys', { name: 'Claude' }))

    const { GET } = await import('@/app/api/app/phones/route')
    const phones = await (await GET(get('/api/app/phones'))).json()
    expect(phones.phones).toHaveLength(1)
    expect(phones.phones[0]).toMatchObject({ name: 'iPhone', lastUsedAt: null })
    expect(JSON.stringify(phones)).not.toContain(key)

    const searchKeys = await (await listSearchKeys(get('/api/access-keys'))).json()
    expect(searchKeys.keys.map((k: { name: string }) => k.name)).toEqual(['Claude'])

    const me = await import('@/app/api/app/me/route')
    const meRes = await me.GET(get('/api/app/me', key))
    expect(meRes.status).toBe(200)
    expect(await meRes.json()).toEqual({
      username: 'one',
      name: 'iPhone',
      avatarUrl: null,
      avatarSource: 'generated',
    })

    // Your picture, so your own reactions wear it; none when you chose the generated icon.
    testInstance.db
      .update(schema.users)
      .set({ avatarUrl: '/api/avatars/user-1.webp' })
      .where(eq(schema.users.id, 'user-1'))
      .run()
    expect((await (await me.GET(get('/api/app/me', key))).json()).avatarUrl).toBe(
      '/api/avatars/user-1.webp',
    )
    testInstance.db
      .insert(schema.userPreferences)
      .values({ userId: 'user-1', key: 'avatarSource', value: 'generated' })
      .run()
    expect((await (await me.GET(get('/api/app/me', key))).json()).avatarUrl).toBeNull()

    // A Claude key can't remove a phone through the access-keys route, and vice versa.
    const { DELETE: deleteSearchKey } = await import('@/app/api/access-keys/[id]/route')
    const phoneId = phones.phones[0].id
    const wrong = await deleteSearchKey(
      new NextRequest(`${BASE}/api/access-keys/${phoneId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: phoneId }) },
    )
    expect(wrong.status).toBe(404)

    const { DELETE } = await import('@/app/api/app/phones/[id]/route')
    const removed = await DELETE(
      new NextRequest(`${BASE}/api/app/phones/${phoneId}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: phoneId }) },
    )
    expect(removed.status).toBe(200)
    const after = await me.GET(get('/api/app/me', key))
    expect(after.status).toBe(401)
    expect((await after.json()).code).toBe('bad_key')
  })

  it('lets a phone remove itself with DELETE /api/app/me, leaving the other phones', async () => {
    const mine = await phoneKey('iPhone')
    const other = await phoneKey('Pixel')
    sessionUser = 'user-2'
    const theirs = await phoneKey('Their phone')
    sessionUser = 'user-1'

    const me = await import('@/app/api/app/me/route')
    const remove = (key?: string) =>
      me.DELETE(
        new NextRequest(`${BASE}/api/app/me`, {
          method: 'DELETE',
          ...(key ? { headers: { authorization: `Bearer ${key}` } } : {}),
        }),
      )

    // No key, no removal.
    expect((await remove()).status).toBe(401)

    const removed = await remove(mine)
    expect(removed.status).toBe(200)
    expect(await removed.json()).toEqual({ ok: true })

    // The removed key is refused everywhere from now on, removing again included.
    const after = await me.GET(get('/api/app/me', mine))
    expect(after.status).toBe(401)
    expect((await after.json()).code).toBe('bad_key')
    const again = await remove(mine)
    expect(again.status).toBe(401)
    expect((await again.json()).code).toBe('bad_key')

    // Your other phone and someone else's phone carry on.
    expect((await me.GET(get('/api/app/me', other))).status).toBe(200)
    expect((await me.GET(get('/api/app/me', theirs))).status).toBe(200)
    const { GET } = await import('@/app/api/app/phones/route')
    const phones = await (await GET(get('/api/app/phones'))).json()
    expect(phones.phones.map((p: { name: string }) => p.name)).toEqual(['Pixel'])
  })

  it('keeps each phone to its own account', async () => {
    await phoneKey()
    sessionUser = 'user-2'
    const { GET } = await import('@/app/api/app/phones/route')
    expect((await (await GET(get('/api/app/phones'))).json()).phones).toEqual([])
  })
})

describe('key scopes', () => {
  it('a Claude key can’t save, and a phone key can’t search', async () => {
    const { POST: makeSearchKey } = await import('@/app/api/access-keys/route')
    const searchKey = (await (await makeSearchKey(json('/api/access-keys', {}))).json()).key
    const phone = await phoneKey()

    const saved = await save({ url: `https://youtu.be/${VIDEO_ID}` }, searchKey)
    expect(saved.status).toBe(401)
    expect(saved.body.code).toBe('bad_key')

    const { GET: search } = await import('@/app/api/agent/search/route')
    const res = await search(get('/api/agent/search?q=frog', phone))
    expect(res.status).toBe(401)
  })

  it('refuses a banned account’s phone', async () => {
    const key = await phoneKey()
    testInstance.db
      .insert(schema.userBans)
      .values({
        userId: 'user-1',
        reason: 'spam',
        createdBy: 'user-2',
        createdAt: new Date().toISOString(),
      })
      .run()
    expect((await save({ url: `https://youtu.be/${VIDEO_ID}` }, key)).status).toBe(401)
  })
})

describe('POST /api/app/save', () => {
  it('saves the link inside shared text and says what it saved', async () => {
    const key = await phoneKey()
    const { status: code, body } = await save(
      { url: `Look at this! https://youtu.be/${VIDEO_ID}.` },
      key,
    )
    expect(code).toBe(200)
    expect(body).toMatchObject({
      platform: 'youtube',
      network: 'YouTube',
      id: VIDEO_ID,
      author: 'somechannel',
      authorName: 'Some Channel',
      text: 'a video',
      category: 'video',
      posterUrl: `/api/files/youtube/${VIDEO_ID}/poster?v=2`,
      openPath: expect.stringContaining(VIDEO_ID),
      alreadySaved: false,
    })
    expect(Date.parse(body.savedAt)).not.toBeNaN()
    expect(mockDescribeNetworkPost).toHaveBeenCalledWith('youtube', VIDEO_ID, undefined)
    expect(wakeKeep).toHaveBeenCalledTimes(1)

    const [row] = testInstance.db.select().from(schema.bookmarks).all()
    expect(row).toMatchObject({ userId: 'user-1', source: 'phone_app' })
  })

  it('says when it was already saved, with the first save’s time', async () => {
    const key = await phoneKey()
    const first = await save({ url: `https://youtu.be/${VIDEO_ID}` }, key)
    const again = await save({ url: `https://www.youtube.com/watch?v=${VIDEO_ID}` }, key)
    expect(again.status).toBe(200)
    expect(again.body).toMatchObject({ alreadySaved: true, savedAt: first.body.savedAt })
    expect(wakeKeep).toHaveBeenCalledTimes(1)
  })

  it('shows an X post’s own picture when it was already saved', async () => {
    const key = await phoneKey()
    testInstance.db
      .insert(schema.bookmarks)
      .values({
        id: '2110000000000000001',
        userId: 'user-1',
        platform: 'twitter',
        author: 'someone',
        text: 'hello',
        tweetUrl: 'https://x.com/someone/status/2110000000000000001',
        processedAt: '2026-10-01T00:00:00.000Z',
        category: 'photo',
      })
      .run()
    testInstance.db
      .insert(schema.bookmarkMedia)
      .values({
        id: 'm1',
        userId: 'user-1',
        platform: 'twitter',
        bookmarkId: '2110000000000000001',
        mediaType: 'photo',
        originalUrl: 'https://pbs.twimg.com/media/abc.jpg',
      })
      .run()
    const { status: code, body } = await save(
      { url: 'https://x.com/someone/status/2110000000000000001?s=20' },
      key,
    )
    expect(code).toBe(200)
    expect(body).toMatchObject({
      platform: 'twitter',
      network: 'X',
      alreadySaved: true,
      savedAt: '2026-10-01T00:00:00.000Z',
      // Through /api/files: the kept poster, or X's picture until it's kept.
      posterUrl: '/api/files/twitter/2110000000000000001/poster?a=someone&v=2',
      openPath: '/someone/status/2110000000000000001',
    })
  })

  it('answers not_a_post for a profile link and no_link when there is none', async () => {
    const key = await phoneKey()
    const profile = await save({ url: 'https://www.instagram.com/someone/' }, key)
    expect(profile.status).toBe(422)
    expect(profile.body.code).toBe('not_a_post')
    expect(profile.body.error).toMatch(/single posts/)

    const none = await save({ url: 'just some words' }, key)
    expect(none.status).toBe(400)
    expect(none.body.code).toBe('no_link')
    expect(testInstance.db.select().from(schema.bookmarks).all()).toHaveLength(0)
  })

  it('answers unavailable when the post can’t be read', async () => {
    mockDescribeNetworkPost.mockResolvedValue(null)
    const key = await phoneKey()
    const res = await save({ url: `https://youtu.be/${VIDEO_ID}` }, key)
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('unavailable')
  })

  it('answers unavailable for a deleted X post, and failed when X can’t be asked', async () => {
    const key = await phoneKey()
    const fxtwitter = vi.fn()
    vi.stubGlobal('fetch', fxtwitter)

    fxtwitter.mockResolvedValueOnce(new Response('{"code":404,"tweet":null}', { status: 404 }))
    const gone = await save({ url: 'https://x.com/someone/status/1588116111222755329' }, key)
    expect(gone.status).toBe(404)
    expect(gone.body.code).toBe('unavailable')

    fxtwitter.mockResolvedValueOnce(new Response('busy', { status: 503 }))
    const busy = await save({ url: 'https://x.com/someone/status/1588116111222755329' }, key)
    expect(busy.status).toBe(500)
    expect(busy.body.code).toBe('failed')
    expect(testInstance.db.select().from(schema.bookmarks).all()).toHaveLength(0)
  })

  it('needs a phone key', async () => {
    const { POST } = await import('@/app/api/app/save/route')
    const res = await POST(json('/api/app/save', { url: `https://youtu.be/${VIDEO_ID}` }))
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer')
  })
})

describe('GET /api/app/status', () => {
  const job = (status: string) =>
    testInstance.db
      .insert(schema.keepJobs)
      .values({
        platform: 'youtube',
        postId: VIDEO_ID,
        status,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [schema.keepJobs.platform, schema.keepJobs.postId],
        set: { status },
      })
      .run()

  it('follows a post from queued to kept, with progress while it downloads', async () => {
    const key = await phoneKey()
    await save({ url: `https://youtu.be/${VIDEO_ID}` }, key)

    // Media keeping is off under test, so no job yet reads as "off".
    expect((await status('youtube', VIDEO_ID, key)).body).toMatchObject({ status: 'off' })

    job('pending')
    expect((await status('youtube', VIDEO_ID, key)).body).toMatchObject({
      status: 'waiting',
      percent: null,
    })

    job('running')
    const { reportKeepProgress, reportKeepConverting, clearKeepProgress } =
      await import('@/lib/keep/progress')
    expect((await status('youtube', VIDEO_ID, key)).body).toMatchObject({
      status: 'keeping',
      percent: null,
      step: 'downloading',
    })
    reportKeepProgress('youtube', VIDEO_ID, 42.4)
    expect((await status('youtube', VIDEO_ID, key)).body).toMatchObject({
      status: 'keeping',
      percent: 42,
      step: 'downloading',
    })
    // Downloaded; re-encoding has no percent rather than a 99% that looks stuck.
    reportKeepProgress('youtube', VIDEO_ID, 100)
    reportKeepConverting('youtube', VIDEO_ID)
    expect((await status('youtube', VIDEO_ID, key)).body).toMatchObject({
      status: 'keeping',
      percent: null,
      step: 'converting',
    })
    clearKeepProgress('youtube', VIDEO_ID)

    job('failed')
    expect((await status('youtube', VIDEO_ID, key)).body.status).toBe('retrying')

    job('done')
    testInstance.db
      .insert(schema.keptFiles)
      .values([
        {
          platform: 'youtube',
          postId: VIDEO_ID,
          slot: 'video-1',
          path: 'youtube/x/video-1.mp4',
          mime: 'video/mp4',
          bytes: 10,
          width: 3840,
          height: 2160,
          createdAt: new Date().toISOString(),
        },
        {
          platform: 'youtube',
          postId: VIDEO_ID,
          slot: 'poster',
          path: 'youtube/x/poster.jpg',
          mime: 'image/jpeg',
          bytes: 1,
          createdAt: new Date().toISOString(),
        },
      ])
      .run()
    const { status: code, body } = await status('youtube', VIDEO_ID, key)
    expect(code).toBe(200)
    expect(body).toEqual({
      platform: 'youtube',
      id: VIDEO_ID,
      status: 'kept',
      percent: 100,
      step: null,
      quality: '4K',
      kept: { videos: 1, photos: 0, audio: 0 },
    })

    job('unavailable')
    expect((await status('youtube', VIDEO_ID, key)).body.status).toBe('unavailable')
  })

  it('says off, not waiting forever, for an older save the server won’t keep (KEEP_BACKFILL=off)', async () => {
    const key = await phoneKey()
    testInstance.db
      .insert(schema.bookmarks)
      .values({
        id: '20',
        userId: 'user-1',
        platform: 'twitter',
        author: 'jack',
        text: 'just setting up my twttr',
        tweetUrl: 'https://x.com/jack/status/20',
        processedAt: '2026-10-01T00:00:00.000Z',
        category: 'text',
      })
      .run()
    keepOn = true

    // Keeping everything: the next scan queues it.
    expect((await status('twitter', '20', key)).body.status).toBe('waiting')

    // Only saves since the server started are kept, and this one is older.
    cutoff = '2026-10-18T00:00:00.000Z'
    expect((await status('twitter', '20', key)).body.status).toBe('off')
    // A job queued before the backfill was turned off isn't taken either.
    testInstance.db
      .insert(schema.keepJobs)
      .values({ platform: 'twitter', postId: '20', status: 'pending', updatedAt: cutoff })
      .run()
    expect((await status('twitter', '20', key)).body.status).toBe('off')

    // Someone saving it again after the cutoff brings it back into the queue.
    testInstance.db
      .insert(schema.bookmarks)
      .values({
        id: '20',
        userId: 'user-2',
        platform: 'twitter',
        author: 'jack',
        text: 'just setting up my twttr',
        tweetUrl: 'https://x.com/jack/status/20',
        processedAt: '2026-10-18T09:00:00.000Z',
        category: 'text',
      })
      .run()
    expect((await status('twitter', '20', key)).body.status).toBe('waiting')
  })

  it('only answers for your own saves', async () => {
    const key = await phoneKey()
    testInstance.db
      .insert(schema.bookmarks)
      .values({
        id: VIDEO_ID,
        userId: 'user-2',
        platform: 'youtube',
        author: 'c',
        text: '',
        tweetUrl: '',
        processedAt: new Date().toISOString(),
      })
      .run()
    const res = await status('youtube', VIDEO_ID, key)
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('not_saved')
    expect((await status('', '', key)).status).toBe(404)
  })
})

describe('helpers', () => {
  it('finds the first link in shared text', async () => {
    const { firstLink } = await import('@/lib/app/phone-app')
    expect(firstLink('https://vm.tiktok.com/ZMk3abc/')).toBe('https://vm.tiktok.com/ZMk3abc/')
    expect(firstLink('Watch “this” (https://youtu.be/abc).')).toBe('https://youtu.be/abc')
    expect(firstLink('Check out x.com/a/status/1 now')).toBe('https://x.com/a/status/1')
    expect(firstLink('no link here')).toBeNull()
    expect(firstLink(42)).toBeNull()
  })

  it('labels video quality', async () => {
    const { qualityLabel } = await import('@/lib/app/phone-app')
    expect(qualityLabel(1280, 720)).toBe('720p')
    expect(qualityLabel(720, 1280)).toBe('720p') // vertical
    expect(qualityLabel(null, 1080)).toBe('1080p')
    expect(qualityLabel(3840, 2160)).toBe('4K')
    expect(qualityLabel(null, null)).toBeNull()
  })

  it('reads yt-dlp progress lines and never goes backwards', async () => {
    const { parseProgressLine, reportKeepProgress, keepProgress, clearKeepProgress } =
      await import('@/lib/keep/progress')
    expect(parseProgressLine('ADHX-PROGRESS  45.3%')).toBe(45.3)
    expect(parseProgressLine('[download] Destination: v1.mp4')).toBeNull()
    reportKeepProgress('x', '1', 60)
    reportKeepProgress('x', '1', 5)
    expect(keepProgress('x', '1')).toBe(60)
    reportKeepProgress('x', '1', 100)
    expect(keepProgress('x', '1')).toBe(99) // 100 only once the files are recorded
    clearKeepProgress('x', '1')
    expect(keepProgress('x', '1')).toBeNull()
  })

  it('normalises typed codes', async () => {
    const { normalizePairCode } = await import('@/lib/auth/phone-pairing')
    expect(normalizePairCode('abcd-efgh')).toBe('ABCDEFGH')
    expect(normalizePairCode('ABCD EFGH')).toBe('ABCDEFGH')
    expect(normalizePairCode('ABCDEFG0')).toBeNull() // 0 isn't in the alphabet
    expect(normalizePairCode('ABC')).toBeNull()
    expect(normalizePairCode(null)).toBeNull()
  })
})

describe('saving in the background (Prefer: respond-async)', () => {
  it('does not read or insert queued saves while their owner is banned', async () => {
    const key = await phoneKey()
    expect((await share({ url: `https://youtu.be/${VIDEO_ID}` }, key)).status).toBe(202)
    mockDescribeNetworkPost.mockClear()
    testInstance.sqlite
      .prepare("INSERT INTO user_bans(user_id,created_at,created_by) VALUES('user-1',?,'user-2')")
      .run(new Date().toISOString())
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    expect(await saveQueueTick()).toBe(0)
    expect(mockDescribeNetworkPost).not.toHaveBeenCalled()
    expect(testInstance.db.select().from(schema.bookmarks).all()).toHaveLength(0)
  })

  it('cancels a queued save if the owner is banned during metadata I/O', async () => {
    const key = await phoneKey()
    const receipt = await share({ url: `https://youtu.be/${VIDEO_ID}` }, key)
    const description = await mockDescribeNetworkPost()
    mockDescribeNetworkPost.mockImplementationOnce(async () => {
      testInstance.sqlite
        .prepare("INSERT INTO user_bans(user_id,created_at,created_by) VALUES('user-1',?,'user-2')")
        .run(new Date().toISOString())
      return description
    })
    const { saveQueueTick, queuedSave } = await import('@/lib/app/save-queue')
    await saveQueueTick()
    expect(testInstance.db.select().from(schema.bookmarks).all()).toHaveLength(0)
    expect(queuedSave('user-1', receipt.body.id)).toMatchObject({
      state: 'failed',
      errorCode: 'cancelled',
    })
  })

  async function share(body: unknown, key: string) {
    const { POST } = await import('@/app/api/app/save/route')
    const req = new NextRequest(`${BASE}/api/app/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${key}`,
        prefer: 'respond-async',
      },
      body: JSON.stringify(body),
    })
    const res = await POST(req)
    return { status: res.status, body: await res.json() }
  }

  async function progress(id: string, key: string) {
    const { GET } = await import('@/app/api/app/save/route')
    const res = await GET(get(`/api/app/save?id=${id}`, key))
    return { status: res.status, body: await res.json() }
  }

  it.each(['clear', 'delete'] as const)(
    'does not resurrect an in-flight save after account %s',
    async (action) => {
      const key = await phoneKey()
      const queued = await share({ url: `https://youtu.be/${VIDEO_ID}` }, key)
      const description = await mockDescribeNetworkPost()
      mockDescribeNetworkPost.mockClear()
      let release!: (value: unknown) => void
      let started!: () => void
      const reading = new Promise<void>((resolve) => {
        started = resolve
      })
      mockDescribeNetworkPost.mockImplementationOnce(() => {
        started()
        return new Promise((resolve) => {
          release = resolve
        })
      })
      const { saveQueueTick } = await import('@/lib/app/save-queue')
      const working = saveQueueTick()
      await reading
      expect(testInstance.db.select().from(schema.phoneSaveQueue).all()[0]).toMatchObject({
        id: queued.body.id,
        status: 'working',
      })
      sessionUser = 'user-1'
      const response =
        action === 'clear'
          ? await (await import('@/app/api/account/clear/route')).POST()
          : await (await import('@/app/api/account/route')).DELETE()
      expect(response.status).toBe(200)
      release(description)
      await working
      expect(testInstance.db.select().from(schema.phoneSaveQueue).all()).toHaveLength(0)
      expect(testInstance.db.select().from(schema.bookmarks).all()).toHaveLength(0)
      expect(testInstance.db.select().from(schema.bookmarkMedia).all()).toHaveLength(0)
      expect(wakeKeep).not.toHaveBeenCalled()
    },
  )

  it('does not start a queued operation removed before execution', async () => {
    const key = await phoneKey()
    await share({ url: `https://youtu.be/${VIDEO_ID}` }, key)
    const stale = testInstance.db.select().from(schema.phoneSaveQueue).all()[0]
    testInstance.db.delete(schema.phoneSaveQueue).run()
    const { runQueuedSave } = await import('@/lib/app/save-queue')
    await runQueuedSave(stale)
    expect(mockDescribeNetworkPost).not.toHaveBeenCalled()
    expect(testInstance.db.select().from(schema.bookmarks).all()).toHaveLength(0)
  })

  it('answers at once and saves the post in the background', async () => {
    const key = await phoneKey()
    const queued = await share({ url: `https://youtu.be/${VIDEO_ID}` }, key)
    expect(queued.status).toBe(202)
    expect(queued.body).toMatchObject({ queued: true, state: 'waiting' })
    // Nothing read or saved yet.
    expect(mockDescribeNetworkPost).not.toHaveBeenCalled()
    expect(testInstance.db.select().from(schema.bookmarks).all()).toHaveLength(0)
    expect((await progress(queued.body.id, key)).body).toMatchObject({ state: 'waiting' })

    const { saveQueueTick } = await import('@/lib/app/save-queue')
    expect(await saveQueueTick()).toBe(1)

    const done = await progress(queued.body.id, key)
    expect(done.status).toBe(200)
    expect(done.body).toMatchObject({
      state: 'saved',
      post: { platform: 'youtube', id: VIDEO_ID, author: 'somechannel', alreadySaved: false },
    })
    const [row] = testInstance.db.select().from(schema.bookmarks).all()
    expect(row).toMatchObject({ userId: 'user-1', source: 'phone_app' })
  })

  it('says why when the link isn’t one post', async () => {
    const key = await phoneKey()
    const queued = await share({ url: 'https://www.youtube.com/@somechannel' }, key)
    expect(queued.status).toBe(202)
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    await saveQueueTick()
    expect((await progress(queued.body.id, key)).body).toMatchObject({
      state: 'failed',
      code: 'not_a_post',
    })
  })

  it('tries again later when the network is slow, then saves', async () => {
    const key = await phoneKey()
    mockDescribeNetworkPost.mockRejectedValueOnce(new Error('timed out'))
    const queued = await share({ url: `https://youtu.be/${VIDEO_ID}` }, key)
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    await saveQueueTick()
    const row = testInstance.db.select().from(schema.phoneSaveQueue).all()[0]
    expect(row).toMatchObject({ status: 'waiting', attempts: 1 })
    expect(Date.parse(row.nextAttemptAt!)).toBeGreaterThan(Date.now())
    expect((await progress(queued.body.id, key)).body.state).toBe('waiting')
    // Due now.
    testInstance.db
      .update(schema.phoneSaveQueue)
      .set({ nextAttemptAt: new Date(0).toISOString() })
      .run()
    await saveQueueTick()
    expect((await progress(queued.body.id, key)).body).toMatchObject({ state: 'saved' })
  })

  it('only answers about your own shares', async () => {
    const key = await phoneKey()
    const queued = await share({ url: `https://youtu.be/${VIDEO_ID}` }, key)
    sessionUser = 'user-2'
    const { code } = await newCode()
    const other = (await pair(code, 'Pixel')).body.key
    expect((await progress(queued.body.id, other)).status).toBe(404)
  })

  it('still saves at once for older apps that don’t ask to wait', async () => {
    const key = await phoneKey()
    const { status: code, body } = await save({ url: `https://youtu.be/${VIDEO_ID}` }, key)
    expect(code).toBe(200)
    expect(body).toMatchObject({ platform: 'youtube', id: VIDEO_ID })
  })
})

describe('Just for me (private saves from the phone)', () => {
  const pulse = () =>
    testInstance.db
      .select()
      .from(schema.activity)
      .all()
      .filter((r) => r.action === 'save')

  it('saves a private share without a pulse, and says it is private', async () => {
    const key = await phoneKey()
    const { status: code, body } = await save(
      { url: `https://youtu.be/${VIDEO_ID}`, private: true },
      key,
    )
    expect(code).toBe(200)
    expect(body).toMatchObject({ platform: 'youtube', id: VIDEO_ID, isPrivate: true })
    const [row] = testInstance.db.select().from(schema.bookmarks).all()
    expect(row.isPrivate).toBe(true)
    expect(pulse()).toHaveLength(0)
  })

  it('keeps a queued private share private', async () => {
    const key = await phoneKey()
    const { POST } = await import('@/app/api/app/save/route')
    const res = await POST(
      new NextRequest(`${BASE}/api/app/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${key}`,
          prefer: 'respond-async',
        },
        body: JSON.stringify({ url: `https://youtu.be/${VIDEO_ID}`, private: true }),
      }),
    )
    expect(res.status).toBe(202)
    expect(testInstance.db.select().from(schema.phoneSaveQueue).all()[0].isPrivate).toBe(true)
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    expect(await saveQueueTick()).toBe(1)
    const [row] = testInstance.db.select().from(schema.bookmarks).all()
    expect(row).toMatchObject({ userId: 'user-1', isPrivate: true })
    expect(pulse()).toHaveLength(0)
  })

  it('switches a save private and back with POST /api/app/private, only for your own', async () => {
    const key = await phoneKey()
    await save({ url: `https://youtu.be/${VIDEO_ID}` }, key)
    expect(pulse()).toHaveLength(1)
    const { POST } = await import('@/app/api/app/private/route')
    const on = await POST(
      json('/api/app/private', { platform: 'youtube', id: VIDEO_ID, private: true }, key),
    )
    expect(on.status).toBe(200)
    expect(await on.json()).toEqual({ private: true })
    // The earlier public pulse goes with it.
    expect(pulse()).toHaveLength(0)
    const off = await POST(
      json('/api/app/private', { platform: 'youtube', id: VIDEO_ID, private: false }, key),
    )
    expect(await off.json()).toEqual({ private: false })
    expect(testInstance.db.select().from(schema.bookmarks).all()[0].isPrivate).toBe(false)

    const missing = await POST(
      json('/api/app/private', { platform: 'youtube', id: 'nope', private: true }, key),
    )
    expect(missing.status).toBe(404)
    const bad = await POST(json('/api/app/private', { platform: 'youtube', id: VIDEO_ID }, key))
    expect(bad.status).toBe(400)
    const noKey = await POST(json('/api/app/private', { platform: 'youtube', id: VIDEO_ID }))
    expect(noKey.status).toBe(401)
  })

  it('searches everyone’s saves with scope=everyone and refuses other scopes', async () => {
    const key = await phoneKey()
    const { findPosts } = await import('@/lib/semantic/find')
    vi.mocked(findPosts).mockResolvedValue({
      items: [],
      total: 0,
      understood: true,
      close: false,
      refined: false,
      nextOffset: null,
    } as never)
    const { GET } = await import('@/app/api/app/search/route')
    const ok = await GET(get('/api/app/search?q=frog&scope=everyone', key))
    expect(ok.status).toBe(200)
    expect(vi.mocked(findPosts)).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'everyone', userId: 'user-1' }),
    )
    const bad = await GET(get('/api/app/search?q=frog&scope=friends', key))
    expect(bad.status).toBe(400)
  })
})
