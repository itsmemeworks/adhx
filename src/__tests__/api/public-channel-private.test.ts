import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { createTestDb, createTestBookmark, type TestDbInstance } from './setup'

/**
 * Private wins (docs/specs/friends-feed.md): a public tag channel
 * (`/t/{user}/{tag}`) and everything built on it never list a post its owner
 * saved just for themself, even when it's tagged. The owner still sees it.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction: <R>(fn: () => R): R => testInstance.sqlite.transaction(fn)(),
}))
vi.mock('@/lib/sentry', () => ({
  metrics: new Proxy({}, { get: () => vi.fn() }),
  captureException: vi.fn(),
}))

import { getPublicTagCollection } from '@/lib/tags/query'
import { channelQueue } from '@/lib/channels/channels'
import { cloneTagToUser } from '@/lib/tags/clone'
import { getPublicProfile } from '@/lib/users/profile'

const ANA = 'u_ana'
const BEN = 'u_ben'

function tag(id: string, name: string) {
  testInstance.db
    .insert(schema.bookmarkTags)
    .values({ userId: BEN, platform: 'twitter', bookmarkId: id, tag: name })
    .run()
}

function share(name: string) {
  testInstance.db
    .insert(schema.tagShares)
    .values({ userId: BEN, tag: name, shareCode: `s-${name}`, isPublic: true })
    .run()
}

beforeEach(() => {
  testInstance = createTestDb()
  testInstance.db
    .insert(schema.users)
    .values([
      { id: ANA, username: 'ana', displayName: 'Ana' },
      { id: BEN, username: 'ben', displayName: 'Ben' },
    ] as never)
    .run()
  testInstance.db
    .insert(schema.bookmarks)
    .values([
      createTestBookmark(BEN, 'open1', { text: 'a cat' }),
      createTestBookmark(BEN, 'secret1', { text: 'a secret cat', isPrivate: true }),
      createTestBookmark(BEN, 'secret2', { text: 'another secret', isPrivate: true }),
    ])
    .run()
  tag('open1', 'cats')
  tag('secret1', 'cats')
  share('cats')
})

afterEach(() => testInstance.close())

describe('public tag channels: private wins', () => {
  it('hides the owner’s private save from the page data, queue and clone', async () => {
    const page = await getPublicTagCollection('ben', 'cats')
    expect(page.status).toBe('ok')
    if (page.status !== 'ok') return
    expect(page.data.items.map((i) => i.bookmarkId)).toEqual(['open1'])
    expect(page.data.tweetCount).toBe(1)

    const anon = await channelQueue('ben', 'cats', null)
    const ana = await channelQueue('ben', 'cats', ANA)
    const own = await channelQueue('ben', 'cats', BEN)
    for (const q of [anon, ana]) {
      expect(q.status === 'ok' && q.items.map((i) => i.post.id)).toEqual(['open1'])
    }
    expect(own.status === 'ok' && own.items.map((i) => i.post.id).sort()).toEqual([
      'open1',
      'secret1',
    ])

    const cloned = await cloneTagToUser({ sourceUserId: BEN, tagName: 'cats', currentUserId: ANA })
    expect(cloned).toMatchObject({ ok: true, taggedCount: 1 })
    const anaCopy = testInstance.db
      .select()
      .from(schema.bookmarks)
      .all()
      .filter((b) => b.userId === ANA && b.id === 'secret1')
    expect(anaCopy).toHaveLength(0)
  })

  it('leaves a channel holding only private saves out of the sitemap', async () => {
    tag('secret2', 'quiet')
    share('quiet')
    // A server whose owner opened it to search engines; off, the sitemap is empty.
    vi.stubEnv('PUBLIC_PAGES', 'on')
    ;(await import('@/lib/settings/extras')).__resetExtrasCache()
    const { default: sitemap } = await import('@/app/sitemap')
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls.some((u) => u.endsWith('/t/ben/cats'))).toBe(true)
    expect(urls.some((u) => u.endsWith('/t/ben/quiet'))).toBe(false)
    vi.unstubAllEnvs()
  })

  it('counts only public posts on the curator profile', async () => {
    const profile = await getPublicProfile('ben')
    expect(profile.status).toBe('ok')
    if (profile.status !== 'ok') return
    const cats = profile.profile.collections.find((c) => c.tag === 'cats')!
    expect(cats.count).toBe(1)
    expect(JSON.stringify(profile)).not.toContain('secret1')
  })

  it('never puts a note on a public channel, its signed-out queue or a clone', async () => {
    testInstance.sqlite.exec(
      "UPDATE bookmarks SET note = 'this is so you, Ana' WHERE user_id = 'u_ben' AND id = 'open1'",
    )
    const page = await getPublicTagCollection('ben', 'cats')
    expect(JSON.stringify(page)).not.toContain('so you')
    const anon = await channelQueue('ben', 'cats', null)
    expect(JSON.stringify(anon)).not.toContain('so you')

    // Members still see it, on Ben's face.
    const ana = await channelQueue('ben', 'cats', ANA)
    expect(ana.status === 'ok' && ana.items[0].post.savers).toEqual([
      expect.objectContaining({ username: 'ben', note: 'this is so you, Ana' }),
    ])

    // A clone is Ana's own save: Ben's words stay his.
    await cloneTagToUser({ sourceUserId: BEN, tagName: 'cats', currentUserId: ANA })
    const anaCopy = testInstance.db
      .select()
      .from(schema.bookmarks)
      .all()
      .find((b) => b.userId === ANA && b.id === 'open1')!
    expect(anaCopy.note).toBeNull()
  })
})
