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
