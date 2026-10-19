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
  async function queue(deferPublish = false) {
    const key = await phoneKey()
    const { POST } = await import('@/app/api/app/save/route')
    const res = await POST(
      post(
        '/api/app/save',
        { url: `https://youtu.be/${ID}`, deferPublish },
        {
          authorization: `Bearer ${key}`,
          prefer: 'respond-async',
        },
      ),
    )
    expect(res.status).toBe(202)
    return { key, id: (await res.json()).id as string }
  }
  async function choose(key: string, id: string, value?: boolean) {
    const { PATCH } = await import('@/app/api/app/save/route')
    return PATCH(
      post(
        '/api/app/save',
        { id, ...(value === undefined ? {} : { private: value }) },
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
