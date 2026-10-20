import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from './setup'

let testInstance: TestDbInstance
let viewer: string | null = USER_A

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  getCurrentUserId: async () => viewer,
  clearSessionCookie: vi.fn(),
}))

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  metrics: new Proxy({}, { get: () => vi.fn() }),
}))
vi.mock('@/lib/avatar/store', () => ({ removeAvatarFiles: vi.fn() }))

const now = () => new Date().toISOString()

function pulse(userId: string | null, action: string, id: string) {
  testInstance.db
    .insert(schema.activity)
    .values({
      action,
      platform: 'twitter',
      bookmarkId: id,
      author: 'a',
      url: `/a/status/${id}`,
      userId,
      createdAt: now(),
    })
    .run()
}

function pulses() {
  return testInstance.db.all<{ user_id: string | null; action: string; bookmark_id: string }>(
    sql`SELECT user_id, action, bookmark_id FROM activity ORDER BY id`,
  )
}

function madeForYou(userId: string) {
  testInstance.db
    .insert(schema.autoChannels)
    .values({
      userId,
      slug: `cats-${userId}`,
      name: 'Cats',
      postKeys: '[]',
      size: 0,
      position: 0,
      model: 'm',
      savesAtCompute: 0,
      computedAt: now(),
    })
    .run()
}

function understood(id: string) {
  testInstance.sqlite
    .prepare(
      `INSERT INTO post_embeddings (platform, post_id, kind, model, content_hash, created_at) VALUES ('twitter', ?, 'text', 'm', 'h', ?)`,
    )
    .run(id, now())
  testInstance.sqlite
    .prepare(
      `INSERT INTO understanding_queue (platform, post_id, kind, enqueued_at, next_attempt_at) VALUES ('twitter', ?, 'image', ?, ?)`,
    )
    .run(id, now(), now())
  testInstance.sqlite
    .prepare(`INSERT INTO post_text_fts (platform, post_id, body) VALUES ('twitter', ?, 'words')`)
    .run(id)
}

function understanding(id: string) {
  const one = (table: string) =>
    (
      testInstance.sqlite
        .prepare(`SELECT count(*) AS n FROM ${table} WHERE platform = 'twitter' AND post_id = ?`)
        .get(id) as { n: number }
    ).n
  return {
    embeddings: one('post_embeddings'),
    queue: one('understanding_queue'),
    keywords: one('post_text_fts'),
  }
}

beforeEach(() => {
  testInstance = createTestDb()
  viewer = USER_A
  testInstance.db
    .insert(schema.users)
    .values([
      { id: USER_A, username: 'ana' },
      { id: USER_B, username: 'ben' },
    ])
    .run()
  testInstance.db
    .insert(schema.bookmarks)
    .values([
      createTestBookmark(USER_A, 'shared'),
      createTestBookmark(USER_B, 'shared'),
      createTestBookmark(USER_A, 'solo'),
    ])
    .run()
  pulse(USER_A, 'save', 'solo')
  pulse(USER_A, 'preview', 'other')
  pulse(USER_B, 'save', 'shared')
  madeForYou(USER_A)
  madeForYou(USER_B)
  understood('shared')
  understood('solo')
})

afterEach(() => {
  testInstance.close()
})

describe('what goes when saves go', () => {
  it('clearing data drops your save pulses, unlinks your other events and your Made for you', async () => {
    const { POST } = await import('@/app/api/account/clear/route')
    const res = await POST()
    expect(res.status).toBe(200)
    expect((await res.json()).message).not.toMatch(/Twitter/)
    expect(pulses()).toEqual([
      { user_id: null, action: 'preview', bookmark_id: 'other' },
      { user_id: USER_B, action: 'save', bookmark_id: 'shared' },
    ])
    expect(
      testInstance.db
        .select()
        .from(schema.autoChannels)
        .all()
        .map((c) => c.userId),
    ).toEqual([USER_B])
  })

  it('deleting the account does the same', async () => {
    const { DELETE } = await import('@/app/api/account/route')
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(pulses()).toEqual([
      { user_id: null, action: 'preview', bookmark_id: 'other' },
      { user_id: USER_B, action: 'save', bookmark_id: 'shared' },
    ])
    expect(
      testInstance.db
        .select()
        .from(schema.autoChannels)
        .all()
        .map((c) => c.userId),
    ).toEqual([USER_B])
  })

  it('a post’s vectors, queue and keyword rows go with its last save, and only then', async () => {
    const { POST } = await import('@/app/api/account/clear/route')
    await POST()
    // Ben still has "shared"; nobody has "solo".
    expect(understanding('shared')).toEqual({ embeddings: 1, queue: 1, keywords: 1 })
    expect(understanding('solo')).toEqual({ embeddings: 0, queue: 0, keywords: 0 })
  })

  it('removing one save drops its save pulse', async () => {
    const { DELETE } = await import('@/app/api/bookmarks/[id]/route')
    const res = await DELETE(
      new NextRequest('http://localhost/api/bookmarks/solo?platform=twitter', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'solo' }) },
    )
    expect(res.status).toBe(200)
    expect(pulses().map((p) => `${p.user_id}:${p.action}:${p.bookmark_id}`)).toEqual([
      `${USER_A}:preview:other`,
      `${USER_B}:save:shared`,
    ])
    expect(understanding('solo')).toEqual({ embeddings: 0, queue: 0, keywords: 0 })
  })
})
