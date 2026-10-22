import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { createTestDb, createTestBookmark, type TestDbInstance } from '@/__tests__/api/setup'
import * as schema from '@/lib/db/schema'
let instance: TestDbInstance
vi.mock('@/lib/db', () => ({
  get db() {
    return instance.db
  },
  runInTransaction: <T>(fn: () => T) => instance.sqlite.transaction(fn)(),
}))
import { blendPage, computeBlend, __resetBlendSnapshots } from '@/lib/feed/blend-db'
import { markSeen, lastLookedAt } from '@/lib/feed/views'
import { sendPost } from '@/lib/sends/sends'
const now = Date.parse('2026-10-22T12:00:00Z'),
  H = 3600000
function save(userId: string, id: string, hoursAgo: number) {
  instance.db
    .insert(schema.bookmarks)
    .values(
      createTestBookmark(userId, id, {
        text: `post ${id}`,
        processedAt: new Date(now - hoursAgo * H).toISOString(),
      }),
    )
    .run()
}
beforeEach(() => {
  instance = createTestDb()
  __resetBlendSnapshots()
  instance.db
    .insert(schema.users)
    .values([
      { id: 'me', username: 'viewer' },
      { id: 'a', username: 'ana' },
      { id: 'b', username: 'ben' },
    ])
    .run()
})
afterEach(() => {
  instance.close()
  vi.unstubAllEnvs()
})
it('deduplicates one post across recent and older savers, including page totals', async () => {
  save('a', 'same', 1)
  save('b', 'same', 24 * 20)
  const computed = await computeBlend('me', 'lineup', { now, types: ['text'] })
  expect(computed.picks.map((p) => p.key)).toEqual(['twitter:same'])
  const first = await blendPage('me', 'lineup', { now, types: ['text'], limit: 1 })
  expect(first.items.map((p) => p.id)).toEqual(['same'])
  expect(first.nextCursor).toBeNull()
  expect(first.total).toBe(1)
  expect(first.sections?.just).toBe(1)
})
it('revalidates cached send identities and notes when the sender is banned', async () => {
  for (const id of ['one', 'two']) {
    save('a', id, 2)
    save('b', id, 1)
    expect(
      sendPost(
        'a',
        { platform: 'twitter', id, to: ['viewer'], note: 'sender note' },
        new Date(now - H),
      ),
    ).toMatchObject({ sent: ['viewer'] })
  }
  const first = await blendPage('me', 'lineup', { now, types: ['text'], limit: 1 })
  expect(first.nextCursor).toBeTruthy()
  instance.db
    .insert(schema.userBans)
    .values({ userId: 'a', createdBy: 'me', createdAt: new Date(now).toISOString() })
    .run()
  const second = await blendPage('me', 'lineup', {
    now,
    types: ['text'],
    limit: 1,
    cursor: first.nextCursor,
  })
  expect(second.items[0].savers?.map((s) => s.username)).toEqual(['ben'])
  expect(
    second.items[0].whyReasons.some(
      (r) => r.kind === 'sent' || r.username === 'ana' || r.note === 'sender note',
    ),
  ).toBe(false)
  const fresh = await computeBlend('me', 'lineup', { now, types: ['text'] })
  expect(fresh.picks.every((p) => p.reasons.every((r) => r.kind !== 'sent'))).toBe(true)
})
it('records replay-only sittings without changing first-seen timestamps', () => {
  markSeen('me', [{ platform: 'twitter', id: 'same' }], new Date(now - 10 * 24 * H))
  markSeen('me', [{ platform: 'twitter', id: 'same' }], new Date(now - H))
  expect(lastLookedAt('me', now)).toBe(now - H)
  markSeen('me', [{ platform: 'twitter', id: 'same' }], new Date(now))
  expect(lastLookedAt('me', now + 1000)).toBe(now - H)
  expect(instance.db.select().from(schema.postViews).get()?.seenAt).toBe(
    new Date(now - 10 * 24 * H).toISOString(),
  )
  expect(instance.db.select().from(schema.userPreferences).all()).toHaveLength(1)
  markSeen('a', [{ platform: 'twitter', id: 'same' }], new Date(now - 2 * H))
  expect(lastLookedAt('a', now)).toBe(now - 2 * H)
  expect(lastLookedAt('me', now + 1000)).toBe(now - H)
})

it('the server resurfaces a newly sent post that was watched earlier', async () => {
  save('a', 'watched', 4)
  markSeen('me', [{ platform: 'twitter', id: 'watched' }], new Date(now - 2 * H))
  expect((await computeBlend('me', 'lineup', { now, types: ['text'] })).picks[0]?.section).toBe(
    'foryou',
  )
  expect(
    sendPost(
      'a',
      { platform: 'twitter', id: 'watched', to: ['viewer'], note: null },
      new Date(now - H),
    ),
  ).toMatchObject({ sent: ['viewer'] })
  const fresh = await computeBlend('me', 'lineup', { now, types: ['text'] })
  expect(fresh.picks[0]).toMatchObject({
    key: 'twitter:watched',
    section: 'just',
    why: 'ana sent you this',
  })
})

it('removes a pending sender from cached pages', async () => {
  for (const id of ['one', 'two']) {
    save('a', id, 2)
    save('b', id, 1)
    sendPost('a', { platform: 'twitter', id, to: ['viewer'], note: 'old note' }, new Date(now - H))
  }
  const page = await blendPage('me', 'lineup', { now, types: ['text'], limit: 1 })
  instance.sqlite.prepare("UPDATE users SET approval = 'pending' WHERE id = 'a'").run()
  const next = await blendPage('me', 'lineup', {
    now,
    types: ['text'],
    limit: 1,
    cursor: page.nextCursor,
  })
  expect(next.items[0].whyReasons.some((r) => r.kind === 'sent')).toBe(false)
})
it('keeps the previous sitting stable throughout repeated views and across exact thirty-minute gaps', () => {
  const ref = [{ platform: 'twitter', id: 'repeat' }]
  markSeen('me', ref, new Date(now - 3 * H))
  markSeen('me', ref, new Date(now - H))
  markSeen('me', ref, new Date(now - H + 1000))
  expect(lastLookedAt('me', now - H + 2000)).toBe(now - 3 * H)
  markSeen('me', ref, new Date(now - H + 1000 + 30 * 60000))
  expect(lastLookedAt('me', now - H + 2000 + 30 * 60000)).toBe(now - H + 1000)
})

it('refreshes a sender name and note instead of storing them in the paging snapshot', async () => {
  for (const id of ['one', 'two']) {
    save('a', id, 2)
    save('b', id, 1)
    sendPost('a', { platform: 'twitter', id, to: ['viewer'], note: 'old note' }, new Date(now - H))
  }
  const page = await blendPage('me', 'lineup', { now, types: ['text'], limit: 1 })
  instance.sqlite.prepare("UPDATE users SET display_name = 'Updated name' WHERE id = 'a'").run()
  instance.sqlite
    .prepare("UPDATE post_sends SET note = 'updated note' WHERE from_user_id = 'a'")
    .run()
  const next = await blendPage('me', 'lineup', {
    now,
    types: ['text'],
    limit: 1,
    cursor: page.nextCursor,
  })
  expect(next.items[0].whyReasons.find((r) => r.kind === 'sent')).toMatchObject({
    text: 'Updated name sent you this',
    note: 'updated note',
  })
})
it('preserves an old library’s last sitting on its first replay after upgrading', () => {
  instance.db
    .insert(schema.postViews)
    .values({
      userId: 'me',
      platform: 'twitter',
      postId: 'legacy',
      seenAt: new Date(now - H).toISOString(),
    })
    .run()
  markSeen('me', [{ platform: 'twitter', id: 'legacy' }], new Date(now))
  expect(lastLookedAt('me', now + 1000)).toBe(now - H)
})
