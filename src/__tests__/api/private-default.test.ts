import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as schema from '@/lib/db/schema'
import { createTestDb, type TestDbInstance } from './setup'

/**
 * Settings → You → "Just for me by default" (`user_preferences`
 * `save.privateDefault`). Every save path makes a NEW save private when it's
 * on and the request doesn't say: /api/tweets/add, /api/bookmarks/add,
 * /api/app/save and its background queue. Saying `private: false` still
 * shares, and a repeat save without `private` never changes the flag.
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
  captureException: vi.fn(),
}))
vi.mock('@/lib/semantic', () => ({ noteSaved: vi.fn(), PRIORITY: { sync: 1, urgent: 100 } }))
const mockDescribe = vi.fn()
vi.mock('@/lib/keep/describe', () => ({
  describeNetworkPost: (...args: unknown[]) => mockDescribe(...args),
}))
vi.mock('@/lib/keep/worker', () => ({ wakeKeep: () => {}, keepCutoff: () => null }))

const mockFetch = vi.fn()
const BASE = 'https://adhx.test'
const ANA = 'u_ana'

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function setDefault(on: boolean) {
  testInstance.db
    .insert(schema.userPreferences)
    .values({ userId: ANA, key: 'save.privateDefault', value: String(on) })
    .onConflictDoUpdate({
      target: [schema.userPreferences.userId, schema.userPreferences.key],
      set: { value: String(on) },
    })
    .run()
}

const saved = (id: string) =>
  testInstance.db
    .select()
    .from(schema.bookmarks)
    .all()
    .find((r) => r.userId === ANA && r.id === id)
const pulses = () => testInstance.db.select().from(schema.activity).all()

async function phoneKey(): Promise<string> {
  const { createAccessKey } = await import('@/lib/auth/access-keys')
  return createAccessKey(ANA, 'iPhone', 'phone')!.key
}

beforeEach(() => {
  testInstance = createTestDb()
  sessionUser = ANA
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  testInstance.db.insert(schema.users).values({ id: ANA, username: 'ana' }).run()
  mockDescribe.mockImplementation(async () => ({
    author: 'somechannel',
    authorName: 'Some Channel',
    text: 'a video',
    createdAt: '2026-01-02T00:00:00.000Z',
    category: 'video',
    videos: 1,
    photos: 0,
    durationMs: 42_000,
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

describe('privateByDefault helpers', () => {
  it('reads the setting and never overrides what a request said', async () => {
    const { privateByDefault, withPrivateDefault, newSavePrivate } =
      await import('@/lib/bookmarks/privacy')
    expect(privateByDefault(ANA)).toBe(false)
    setDefault(true)
    expect(privateByDefault(ANA)).toBe(true)
    expect(newSavePrivate(withPrivateDefault(ANA, {}))).toBe(true)
    expect(newSavePrivate(withPrivateDefault(ANA, { private: false }))).toBe(false)
    // A repeat save only changes on an explicit `private`.
    expect(withPrivateDefault(ANA, {}).private).toBeUndefined()
  })
})

describe('every save path honours "Just for me by default"', () => {
  it('/api/tweets/add', async () => {
    setDefault(true)
    const { POST } = await import('@/app/api/tweets/add/route')
    const res = await POST(post('/api/tweets/add', { url: 'https://x.com/someone/status/111' }))
    expect(res.status).toBe(200)
    expect(saved('111')!.isPrivate).toBe(true)
    // A private save never reaches the public pulse.
    expect(pulses()).toHaveLength(0)
  })

  it('/api/tweets/add with private: false still shares', async () => {
    setDefault(true)
    const { POST } = await import('@/app/api/tweets/add/route')
    await POST(post('/api/tweets/add', { url: 'https://x.com/someone/status/111', private: false }))
    expect(saved('111')!.isPrivate).toBe(false)
    expect(pulses()).toHaveLength(1)
  })

  it('/api/bookmarks/add (a link network)', async () => {
    setDefault(true)
    const { POST } = await import('@/app/api/bookmarks/add/route')
    const res = await POST(post('/api/bookmarks/add', { url: 'https://youtu.be/Y9aytLYBajw' }))
    expect(res.status).toBe(200)
    expect(saved('Y9aytLYBajw')!.isPrivate).toBe(true)
    expect(pulses()).toHaveLength(0)
  })

  it('/api/bookmarks/add with the setting off shares as before', async () => {
    setDefault(false)
    const { POST } = await import('@/app/api/bookmarks/add/route')
    await POST(post('/api/bookmarks/add', { url: 'https://youtu.be/Y9aytLYBajw' }))
    expect(saved('Y9aytLYBajw')!.isPrivate).toBe(false)
  })

  it('/api/app/save', async () => {
    setDefault(true)
    const key = await phoneKey()
    const { POST } = await import('@/app/api/app/save/route')
    const res = await POST(
      post(
        '/api/app/save',
        { url: 'https://youtu.be/Y9aytLYBajw' },
        { authorization: `Bearer ${key}` },
      ),
    )
    expect(res.status).toBe(200)
    expect(saved('Y9aytLYBajw')!.isPrivate).toBe(true)
  })

  it('the phone save queue: settled when queued', async () => {
    setDefault(true)
    const key = await phoneKey()
    const { POST } = await import('@/app/api/app/save/route')
    const headers = { authorization: `Bearer ${key}`, prefer: 'respond-async' }
    const res = await POST(post('/api/app/save', { url: 'https://youtu.be/Y9aytLYBajw' }, headers))
    expect(res.status).toBe(202)
    // Turning it off after sharing doesn't change what the share was.
    setDefault(false)
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    expect(await saveQueueTick()).toBe(1)
    expect(saved('Y9aytLYBajw')!.isPrivate).toBe(true)
    expect(pulses()).toHaveLength(0)
  })

  it('the phone save queue: private: false shares even with the default on', async () => {
    setDefault(true)
    const key = await phoneKey()
    const { POST } = await import('@/app/api/app/save/route')
    const headers = { authorization: `Bearer ${key}`, prefer: 'respond-async' }
    await POST(
      post('/api/app/save', { url: 'https://youtu.be/Y9aytLYBajw', private: false }, headers),
    )
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    await saveQueueTick()
    expect(saved('Y9aytLYBajw')!.isPrivate).toBe(false)
  })

  it('a plain repeat share never makes an existing shared save private', async () => {
    setDefault(false)
    const { POST } = await import('@/app/api/bookmarks/add/route')
    await POST(post('/api/bookmarks/add', { url: 'https://youtu.be/Y9aytLYBajw' }))
    setDefault(true)
    const key = await phoneKey()
    const app = await import('@/app/api/app/save/route')
    const headers = { authorization: `Bearer ${key}`, prefer: 'respond-async' }
    await app.POST(post('/api/app/save', { url: 'https://youtu.be/Y9aytLYBajw' }, headers))
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    await saveQueueTick()
    await POST(post('/api/bookmarks/add', { url: 'https://youtu.be/Y9aytLYBajw' }))
    expect(saved('Y9aytLYBajw')!.isPrivate).toBe(false)
  })
})

describe('queued share privacy survives a closed phone sheet', () => {
  const ID = 'Y9aytLYBajw'
  async function queue(deferPublish = false, requestId?: unknown, url = `https://youtu.be/${ID}`) {
    const key = await phoneKey()
    const { POST } = await import('@/app/api/app/save/route')
    const res = await POST(
      post(
        '/api/app/save',
        { url, deferPublish, ...(requestId === undefined ? {} : { requestId }) },
        {
          authorization: `Bearer ${key}`,
          prefer: 'respond-async',
        },
      ),
    )
    expect(res.status).toBe(202)
    return { key, id: (await res.json()).id as string }
  }
  async function choose(key: string, id: string, value?: boolean, intentVersion?: unknown) {
    const { PATCH } = await import('@/app/api/app/save/route')
    return PATCH(
      post(
        '/api/app/save',
        {
          id,
          ...(value === undefined ? {} : { private: value }),
          ...(intentVersion === undefined ? {} : { intentVersion }),
        },
        { authorization: `Bearer ${key}` },
      ),
    )
  }

  it('keeps a deferred save private until its choice is durably acknowledged, even if it already landed', async () => {
    const { key, id } = await queue(true)
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    await saveQueueTick()
    expect(saved(ID)!.isPrivate).toBe(true)
    expect(pulses()).toHaveLength(0)
    expect((await choose(key, id, true)).status).toBe(200)
    expect(saved(ID)!.isPrivate).toBe(true)
    expect(pulses()).toHaveLength(0)
    expect((await choose(key, id, false)).status).toBe(200)
    expect(saved(ID)!.isPrivate).toBe(false)
    expect(pulses()).toHaveLength(1)
    await choose(key, id, false)
    expect(pulses()).toHaveLength(1)
  })

  it('uses a privacy choice changed while the metadata fetch is still working', async () => {
    const { key, id } = await queue()
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>((r) => {
      entered = r
    })
    const blocked = new Promise<void>((r) => {
      release = r
    })
    const original = mockDescribe.getMockImplementation()!
    mockDescribe.mockImplementationOnce(async (...args) => {
      entered()
      await blocked
      return original(...args)
    })
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    const working = saveQueueTick()
    await started
    try {
      expect((await choose(key, id, true)).status).toBe(200)
    } finally {
      release()
    }
    await working
    expect(saved(ID)!.isPrivate).toBe(true)
    expect(pulses()).toHaveLength(0)
  })

  it.each([false, true])(
    'acknowledging without a choice preserves the captured default %s',
    async (value) => {
      setDefault(value)
      const { key, id } = await queue(true)
      setDefault(!value)
      expect((await choose(key, id)).status).toBe(200)
      const { saveQueueTick } = await import('@/lib/app/save-queue')
      await saveQueueTick()
      expect(saved(ID)!.isPrivate).toBe(value)
    },
  )

  it('preserves repeat-save privacy unless an explicit choice changes it', async () => {
    const { POST } = await import('@/app/api/bookmarks/add/route')
    await POST(post('/api/bookmarks/add', { url: `https://youtu.be/${ID}`, private: true }))
    const { key, id } = await queue(true)
    await choose(key, id)
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    await saveQueueTick()
    expect(saved(ID)!.isPrivate).toBe(true)
    await choose(key, id, false)
    expect(saved(ID)!.isPrivate).toBe(false)
  })

  it('acknowledges explicit false once when the response is lost, preserving a later web private toggle', async () => {
    const { key, id } = await queue(true)
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    const { setSavePrivate } = await import('@/lib/bookmarks/privacy')
    await saveQueueTick()
    // The server committed this request; the phone never received its response.
    expect((await choose(key, id, false, 1)).status).toBe(200)
    expect(saved(ID)!.isPrivate).toBe(false)
    setSavePrivate(ANA, 'youtube', ID, true)
    // Process-restored state resends exactly the same intent and version.
    const restored = JSON.parse(JSON.stringify({ private: false, intentVersion: 1 }))
    expect((await choose(key, id, restored.private, restored.intentVersion)).status).toBe(200)
    expect(saved(ID)!.isPrivate).toBe(true)
    expect(pulses()).toHaveLength(0)
    expect(testInstance.db.select().from(schema.phoneSaveQueue).all()[0]).toMatchObject({
      privacyIntentVersion: 1,
      privateChoice: true,
    })
    // A genuinely newer explicit choice still works.
    expect((await choose(key, id, false, 2)).status).toBe(200)
    expect(saved(ID)!.isPrivate).toBe(false)
  })

  it('rejects out-of-order privacy intent effects, both while queued and after landing', async () => {
    const { key, id } = await queue(true)
    expect((await choose(key, id, true, 3)).status).toBe(200)
    expect((await choose(key, id, false, 2)).status).toBe(200)
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    await saveQueueTick()
    expect(saved(ID)!.isPrivate).toBe(true)
    expect((await choose(key, id, false, 3)).status).toBe(200)
    expect(saved(ID)!.isPrivate).toBe(true)
    expect((await choose(key, id, false, 4)).status).toBe(200)
    expect(saved(ID)!.isPrivate).toBe(false)
    expect((await choose(key, id, true, 1)).status).toBe(200)
    expect(saved(ID)!.isPrivate).toBe(false)
  })

  it.each([0, -1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid privacy intent version %s without publishing',
    async (version) => {
      const { key, id } = await queue(true)
      expect((await choose(key, id, false, version)).status).toBe(400)
      expect(testInstance.db.select().from(schema.phoneSaveQueue).all()[0]).toMatchObject({
        publishPending: true,
        privacyIntentVersion: 0,
      })
    },
  )

  it('resumes an accepted initial POST after its response was lost without an orphan or private repeat', async () => {
    const requestId = '11111111-1111-4111-8111-111111111111'
    const first = await queue(true, requestId)
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    await saveQueueTick()
    expect(saved(ID)!.isPrivate).toBe(true)
    // The phone restarts knowing only its persisted requestId, not the server receipt.
    const retry = await queue(true, JSON.parse(JSON.stringify(requestId)))
    expect(retry.id).toBe(first.id)
    expect(testInstance.db.select().from(schema.phoneSaveQueue).all()).toHaveLength(1)
    expect(testInstance.db.select().from(schema.phoneSaveQueue).all()[0]).toMatchObject({
      requestId,
      alreadySaved: false,
      publishPending: true,
    })
    expect((await choose(retry.key, retry.id, undefined, 1)).status).toBe(200)
    expect(saved(ID)!.isPrivate).toBe(false)
    expect(pulses()).toHaveLength(1)
  })

  it('returns one receipt for concurrent repeats without rewriting original intent or default', async () => {
    const requestId = '22222222-2222-4222-8222-222222222222'
    const { id, key } = await queue(true, requestId)
    setDefault(true)
    const { POST } = await import('@/app/api/app/save/route')
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        POST(
          post(
            '/api/app/save',
            { url: `https://youtu.be/${ID}`, requestId, private: true, deferPublish: false },
            { authorization: `Bearer ${key}`, prefer: 'respond-async' },
          ),
        ),
      ),
    )
    for (const response of responses) {
      expect(response.status).toBe(202)
      expect((await response.json()).id).toBe(id)
    }
    expect(testInstance.db.select().from(schema.phoneSaveQueue).all()).toHaveLength(1)
    expect(testInstance.db.select().from(schema.phoneSaveQueue).all()[0]).toMatchObject({
      defaultPrivate: false,
      privateChoice: null,
      publishPending: true,
    })
  })

  it('scopes a stable request id to its owner and rejects a different link without mutation', async () => {
    const requestId = '33333333-3333-4333-8333-333333333333'
    const { id, key } = await queue(true, requestId)
    const { POST } = await import('@/app/api/app/save/route')
    const changed = await POST(
      post(
        '/api/app/save',
        { url: 'https://youtu.be/Z9aytLYBajw', requestId, private: false },
        { authorization: `Bearer ${key}`, prefer: 'respond-async' },
      ),
    )
    expect(changed.status).toBe(409)
    expect(testInstance.db.select().from(schema.phoneSaveQueue).all()[0]).toMatchObject({
      id,
      url: `https://youtu.be/${ID}`,
      publishPending: true,
      privateChoice: null,
    })
    testInstance.db.insert(schema.users).values({ id: 'other', username: 'other' }).run()
    const { createAccessKey } = await import('@/lib/auth/access-keys')
    const otherKey = createAccessKey('other', 'phone', 'phone')!.key
    const other = await POST(
      post(
        '/api/app/save',
        { url: `https://youtu.be/${ID}`, requestId, deferPublish: true },
        { authorization: `Bearer ${otherKey}`, prefer: 'respond-async' },
      ),
    )
    expect(other.status).toBe(202)
    expect((await other.json()).id).not.toBe(id)
    expect(testInstance.db.select().from(schema.phoneSaveQueue).all()).toHaveLength(2)
  })

  it.each(['short', 'x'.repeat(129), 'http://example.com', null, 7])(
    'rejects malformed request id %s without enqueuing',
    async (requestId) => {
      const key = await phoneKey()
      const { POST } = await import('@/app/api/app/save/route')
      const result = await POST(
        post(
          '/api/app/save',
          { url: `https://youtu.be/${ID}`, requestId },
          { authorization: `Bearer ${key}`, prefer: 'respond-async' },
        ),
      )
      expect(result.status).toBe(400)
      expect(testInstance.db.select().from(schema.phoneSaveQueue).all()).toHaveLength(0)
    },
  )

  it('supports bounded nanoid request ids and legacy clients omitting them', async () => {
    expect((await queue(true, 'abcdefghijklmnopqrstu')).id).toBe(
      (await queue(true, 'abcdefghijklmnopqrstu')).id,
    )
    expect((await queue(true)).id).not.toBe((await queue(true)).id)
    expect(testInstance.db.select().from(schema.phoneSaveQueue).all()).toHaveLength(3)
  })

  it('retains old unacknowledged saves and request ids while pruning ordinary finished rows', async () => {
    const requestId = '44444444-4444-4444-8444-444444444444'
    const pending = await queue(true, requestId)
    const finished = await queue(false)
    const { saveQueueTick } = await import('@/lib/app/save-queue')
    await saveQueueTick()
    const old = new Date(Date.now() - 8 * 24 * 60 * 60_000).toISOString()
    testInstance.sqlite.prepare('UPDATE phone_save_queue SET updated_at=?').run(old)
    testInstance.sqlite
      .prepare(
        `INSERT INTO phone_save_queue(id,user_id,url,status,created_at,updated_at)
      VALUES('old-failure',?,'https://youtu.be/failure','failed',?,?)`,
      )
      .run(ANA, old, old)
    const state = (globalThis as unknown as { __adhxSaveQueue: { lastClean: number } })
      .__adhxSaveQueue
    const lastClean = state.lastClean
    try {
      await saveQueueTick(new Date(Date.now() + 2 * 60 * 60_000))
      expect(testInstance.db.select().from(schema.phoneSaveQueue).all()).toMatchObject([
        { id: pending.id, requestId, publishPending: true, alreadySaved: false },
      ])
      expect(
        testInstance.db
          .select()
          .from(schema.phoneSaveQueue)
          .all()
          .some((row) => row.id === finished.id),
      ).toBe(false)
      const { POST } = await import('@/app/api/app/save/route')
      const resumed = await POST(
        post(
          '/api/app/save',
          { url: `https://youtu.be/${ID}`, requestId, deferPublish: true },
          { authorization: `Bearer ${pending.key}`, prefer: 'respond-async' },
        ),
      )
      expect((await resumed.json()).id).toBe(pending.id)
      expect((await choose(pending.key, pending.id, undefined, 1)).status).toBe(200)
      expect(saved(ID)!.isPrivate).toBe(false)
      // Once acknowledged, an ordinary retention interval can clean it up.
      testInstance.sqlite.prepare('UPDATE phone_save_queue SET updated_at=?').run(old)
      await saveQueueTick(new Date(Date.now() + 4 * 60 * 60_000))
      expect(testInstance.db.select().from(schema.phoneSaveQueue).all()).toHaveLength(0)
    } finally {
      state.lastClean = lastClean
    }
  })

  it('refuses other accounts, search keys, revoked keys and malformed choices', async () => {
    const { key, id } = await queue(true)
    const { createAccessKey, deleteAccessKey } = await import('@/lib/auth/access-keys')
    testInstance.db.insert(schema.users).values({ id: 'other', username: 'other' }).run()
    const other = createAccessKey('other', 'phone', 'phone')!
    expect((await choose(other.key, id, false)).status).toBe(404)
    expect((await choose(createAccessKey(ANA, 'search')!.key, id, false)).status).toBe(401)
    const { PATCH } = await import('@/app/api/app/save/route')
    expect(
      (
        await PATCH(
          post('/api/app/save', { id, private: 'false' }, { authorization: `Bearer ${key}` }),
        )
      ).status,
    ).toBe(400)
    deleteAccessKey(
      ANA,
      testInstance.db
        .select()
        .from(schema.accessKeys)
        .all()
        .find((k) => k.scope === 'phone' && k.userId === ANA)!.id,
      'phone',
    )
    expect((await choose(key, id, false)).status).toBe(401)
    expect(testInstance.db.select().from(schema.phoneSaveQueue).all()[0]).toMatchObject({
      publishPending: true,
    })
  })
})

it('a retried queue acknowledgement cannot undo a newer web privacy choice', async () => {
  const { enqueueSave, saveQueueTick, updateQueuedPrivacy } = await import('@/lib/app/save-queue')
  const { setSavePrivate } = await import('@/lib/bookmarks/privacy')
  const id = 'Y9aytLYBajw'
  const queued = enqueueSave(ANA, `https://youtu.be/${id}`, undefined, { deferPublish: true })
  await saveQueueTick()
  expect(saved(id)!.isPrivate).toBe(true)
  setSavePrivate(ANA, 'youtube', id, true)
  updateQueuedPrivacy(ANA, queued.id)
  expect(saved(id)!.isPrivate).toBe(true)
  updateQueuedPrivacy(ANA, queued.id, false)
  expect(saved(id)!.isPrivate).toBe(false)
  setSavePrivate(ANA, 'youtube', id, true)
  updateQueuedPrivacy(ANA, queued.id)
  expect(saved(id)!.isPrivate).toBe(true)
})
