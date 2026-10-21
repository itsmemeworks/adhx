import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, type TestDbInstance } from './setup'
import { NextRequest } from 'next/server'

let testInstance: TestDbInstance
vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction: <R>(fn: () => R): R => testInstance.sqlite.transaction(fn)(),
}))
vi.mock('@/lib/moments/engine', () => ({ subscribe: () => () => {} }))
vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
  metrics: new Proxy({}, { get: () => vi.fn() }),
}))
const current = vi.hoisted(() => ({ id: 'viewer' }))
vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: async () => current.id,
  clearSessionCookie: vi.fn(),
}))
import { blendPage, __resetBlendSnapshots } from '@/lib/feed/blend-db'
import { encodeCursor } from '@/lib/feed/blend'
import { setSavePrivate } from '@/lib/bookmarks/privacy'
import { momentStreamResponse } from '@/lib/moments/stream'
import { sendReaction, __resetPresence } from '@/lib/moments/presence'
import { getPublicTagCollection } from '@/lib/tags/query'
import { getPublicProfile } from '@/lib/users/profile'
import { cloneTagToUser } from '@/lib/tags/clone'
import { createInvite, redeemInvite, setInviteMode } from '@/lib/auth/invites'
import { createAccessKey } from '@/lib/auth/access-keys'
import { listJoinRequests, decideJoinRequest } from '@/lib/auth/approval'

beforeEach(() => {
  current.id = 'viewer'
  testInstance = createTestDb()
  __resetBlendSnapshots()
  __resetPresence()
  testInstance.db
    .insert(schema.users)
    .values([
      { id: 'viewer', username: 'viewer' },
      { id: 'ana', username: 'ana', displayName: 'Ana' },
      { id: 'ben', username: 'ben', displayName: 'Ben' },
    ])
    .run()
  for (const id of ['post1', 'post2', 'post3']) {
    for (const user of ['ana', 'ben']) {
      testInstance.db
        .insert(schema.bookmarks)
        .values(
          createTestBookmark(user, id, {
            processedAt: new Date().toISOString(),
          }),
        )
        .run()
    }
  }
})
afterEach(() => testInstance.close())

const options = { limit: 1, types: ['text', 'video', 'photo', 'article'] as const }
async function first() {
  return blendPage('viewer', 'everyone', { ...options, types: [...options.types] })
}
it('rechecks cached explanations after Ana makes her saves private', async () => {
  const page = await first()
  for (const id of ['post1', 'post2', 'post3']) setSavePrivate('ana', 'twitter', id, true)
  const next = await blendPage('viewer', 'everyone', {
    ...options,
    types: [...options.types],
    cursor: page.nextCursor!,
  })
  expect(next.items[0].savers?.map((s) => s.username)).toEqual(['ben'])
  expect(JSON.stringify(next.items[0].whyReasons)).not.toContain('Ana')
})

it('rechecks moderation when reading a cached feed page', async () => {
  const page = await first()
  for (const id of ['post1', 'post2', 'post3']) {
    testInstance.db
      .insert(schema.moderatedPosts)
      .values({
        platform: 'twitter',
        bookmarkId: id,
        hidden: 1,
        createdAt: new Date().toISOString(),
        createdBy: 'viewer',
      })
      .run()
  }
  const next = await blendPage('viewer', 'everyone', {
    ...options,
    types: [...options.types],
    cursor: page.nextCursor!,
  })
  expect(next.items).toEqual([])
})

it('stops sending member names to an already-open stream when its viewer is banned', async () => {
  const abort = new AbortController()
  const response = momentStreamResponse({
    request: new Request('http://localhost/api/moments/stream?watch=frogs', {
      signal: abort.signal,
    }),
    watch: 'frogs',
    viewerId: 'viewer',
  })
  const reader = response.body!.getReader()
  try {
    await reader.read()
    testInstance.db
      .insert(schema.userBans)
      .values({
        userId: 'viewer',
        createdAt: new Date().toISOString(),
        createdBy: 'ben',
      })
      .run()
    sendReaction({
      slug: 'frogs',
      userId: 'ana',
      emoji: '😂',
      post: { platform: 'twitter', id: 'post1' },
    })
    const received = await reader.read()
    expect(new TextDecoder().decode(received.value)).not.toContain('Ana')
  } finally {
    abort.abort()
    await reader.cancel()
  }
})

it('drops a newly-private save from already-cached public channels and profiles', async () => {
  testInstance.db
    .insert(schema.bookmarkTags)
    .values({
      userId: 'ana',
      platform: 'twitter',
      bookmarkId: 'post1',
      tag: 'cats',
    })
    .run()
  testInstance.db
    .insert(schema.tagShares)
    .values({
      userId: 'ana',
      tag: 'cats',
      shareCode: 'public-cats',
      isPublic: true,
    })
    .run()
  const before = await getPublicTagCollection('ana', 'cats')
  expect(before.status === 'ok' && before.data.tweetCount).toBe(1)
  await getPublicProfile('ana')
  setSavePrivate('ana', 'twitter', 'post1', true)
  const after = await getPublicTagCollection('ana', 'cats')
  const profile = await getPublicProfile('ana')
  expect.soft(after.status === 'ok' && after.data.tweetCount).toBe(0)
  expect.soft(profile.status === 'ok' && profile.profile.postCount).toBe(0)
})

it('honours private-by-default when keeping a public channel', async () => {
  testInstance.db
    .insert(schema.userPreferences)
    .values({ userId: 'viewer', key: 'save.privateDefault', value: 'true' })
    .run()
  testInstance.db
    .insert(schema.bookmarkTags)
    .values({ userId: 'ana', platform: 'twitter', bookmarkId: 'post1', tag: 'cats' })
    .run()
  testInstance.db
    .insert(schema.tagShares)
    .values({ userId: 'ana', tag: 'cats', shareCode: 'cats', isPublic: true })
    .run()
  expect(
    await cloneTagToUser({ sourceUserId: 'ana', tagName: 'cats', currentUserId: 'viewer' }),
  ).toMatchObject({ ok: true })
  const copy = testInstance.db
    .select()
    .from(schema.bookmarks)
    .where(and(eq(schema.bookmarks.userId, 'viewer'), eq(schema.bookmarks.id, 'post1')))
    .get()
  expect(copy?.isPrivate).toBe(true)
})

it('keeps a pending join approvable after its inviter deletes their account', async () => {
  testInstance.db
    .update(schema.users)
    .set({ role: 'admin' })
    .where(eq(schema.users.id, 'viewer'))
    .run()
  setInviteMode('approve')
  const invite = createInvite('ben')
  if (!invite.ok) throw new Error('fixture failed')
  expect(redeemInvite(invite.token, 'pendingfriend')).toMatchObject({
    ok: true,
    approval: 'pending',
  })
  expect(listJoinRequests()).toHaveLength(1)
  current.id = 'ben'
  const { DELETE } = await import('@/app/api/account/route')
  expect(
    (await DELETE(new NextRequest('http://localhost/api/account', { method: 'DELETE' }))).status,
  ).toBe(200)
  expect(listJoinRequests()).toHaveLength(1)
  expect(listJoinRequests()[0].invitedBy).toBeNull()
  expect(decideJoinRequest(invite.id, 'approve', 'viewer')).toEqual({
    ok: true,
    approval: 'approved',
  })
})

it('does not count private-only picks or hidden kinds in a warm snapshot', async () => {
  const cursor = encodeCursor({ s: '123456abcdef', o: 0 })
  const query = { limit: 1, types: ['video'] as 'video'[], cursor }
  const first = await blendPage('viewer', 'new', query)
  expect(first.waiting).toEqual({ text: 3 })
  const all = await blendPage('viewer', 'everyone', { ...query, types: ['text'] })
  expect(all.total).toBe(3)
  for (const id of ['post1', 'post2', 'post3']) {
    setSavePrivate('ana', 'twitter', id, true)
    setSavePrivate('ben', 'twitter', id, true)
  }
  const hidden = await blendPage('viewer', 'new', query)
  expect(hidden).toMatchObject({ waiting: {}, total: 0, nothingYet: true, items: [] })
  const next = await blendPage('viewer', 'everyone', { ...query, types: ['text'] })
  expect(next).toMatchObject({ total: 0, items: [], nextCursor: null })
})

it('fails closed on a warm feed when moderation becomes unreadable', async () => {
  const page = await first()
  testInstance.sqlite.exec('DROP TABLE moderated_posts')
  await expect(
    blendPage('viewer', 'everyone', {
      ...options,
      types: [...options.types],
      cursor: page.nextCursor,
    }),
  ).rejects.toThrow()
})

it.each(['deleted', 'pending', 'revoked'] as const)(
  'closes an open phone stream when its viewer/key is %s',
  async (change) => {
    const key = createAccessKey('viewer', 'phone', 'phone')!
    const { GET } = await import('@/app/api/app/live/[slug]/stream/route')
    const abort = new AbortController()
    const response = await GET(
      new Request('http://localhost/api/app/live/frogs/stream', {
        headers: { Authorization: `Bearer ${key.key}` },
        signal: abort.signal,
      }),
      { params: Promise.resolve({ slug: 'frogs' }) },
    )
    expect(response.status).toBe(200)
    const reader = response.body!.getReader()
    await reader.read()
    if (change === 'deleted')
      testInstance.db.delete(schema.users).where(eq(schema.users.id, 'viewer')).run()
    else if (change === 'pending')
      testInstance.db
        .update(schema.users)
        .set({ approval: 'pending' })
        .where(eq(schema.users.id, 'viewer'))
        .run()
    else testInstance.db.delete(schema.accessKeys).where(eq(schema.accessKeys.id, key.id)).run()
    sendReaction({
      slug: 'frogs',
      userId: 'ana',
      emoji: '😂',
      post: { platform: 'twitter', id: 'post1' },
    })
    expect(await reader.read()).toEqual({ done: true, value: undefined })
    abort.abort()
  },
)

it('revokes an idle stream on its heartbeat', async () => {
  vi.useFakeTimers()
  const abort = new AbortController()
  const response = momentStreamResponse({
    request: new Request('http://localhost/stream', { signal: abort.signal }),
    viewerId: 'viewer',
    watch: 'frogs',
  })
  const reader = response.body!.getReader()
  try {
    await reader.read()
    testInstance.db
      .update(schema.users)
      .set({ approval: 'declined' })
      .where(eq(schema.users.id, 'viewer'))
      .run()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await reader.read()).toEqual({ done: true, value: undefined })
  } finally {
    abort.abort()
    vi.useRealTimers()
  }
})
