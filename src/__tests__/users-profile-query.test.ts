import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type TestDbInstance, createTestBookmark } from './api/setup'
import {
  oauthTokens,
  tagShares,
  bookmarkTags,
  bookmarks,
  users,
  collectionEvents,
} from '@/lib/db/schema'

/**
 * Curator-profile data-layer tests — `src/lib/users/profile.ts`.
 *
 * Mirrors the style of `tags-query.test.ts`: exercises the not_found / ok
 * result states directly against an in-memory DB. This is where the real
 * privacy (private tags never leak) and cross-user isolation invariants are
 * verified — page-level tests for `/t/[username]` (mocking this module) live
 * in `curator-profile.test.ts`.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { getPublicProfile } from '@/lib/users/profile'

const OWNER_ID = 'owner-user-1'
const OWNER_USERNAME = 'curator'
const OTHER_ID = 'other-user-2'
const OTHER_USERNAME = 'rival'

async function seedOwnerViaUsersTable() {
  await testInstance.db.insert(users).values({
    id: OWNER_ID,
    username: OWNER_USERNAME,
    displayName: 'The Curator',
    avatarUrl: 'https://example.com/avatar.jpg',
    createdAt: '2026-03-01T00:00:00Z',
  })
}

async function seedOwnerViaOauthOnly() {
  await testInstance.db.insert(oauthTokens).values({
    userId: OWNER_ID,
    username: OWNER_USERNAME,
    profileImageUrl: 'https://example.com/legacy-avatar.jpg',
    accessToken: 'token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 100_000,
    createdAt: '2026-02-01T00:00:00Z',
  })
}

describe('getPublicProfile', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('returns not_found when the username does not exist', async () => {
    const result = await getPublicProfile('nobody')
    expect(result.status).toBe('not_found')
  })

  it('does not cache not-found profiles', async () => {
    expect((await getPublicProfile(OWNER_USERNAME)).status).toBe('not_found')
    await seedOwnerViaUsersTable()
    await testInstance.db.insert(tagShares).values({
      userId: OWNER_ID,
      tag: 'just-published',
      shareCode: 'code-new',
      isPublic: true,
    })

    expect((await getPublicProfile(OWNER_USERNAME)).status).toBe('ok')
  })

  it('returns not_found when the user exists but has zero public collections', async () => {
    await seedOwnerViaUsersTable()
    await testInstance.db.insert(tagShares).values({
      userId: OWNER_ID,
      tag: 'private-tag',
      shareCode: 'code-1',
      isPublic: false,
    })

    const result = await getPublicProfile(OWNER_USERNAME)
    expect(result.status).toBe('not_found')
  })

  it('never lists a private tag alongside public ones, and excludes its posts from the count', async () => {
    await seedOwnerViaUsersTable()
    await testInstance.db.insert(tagShares).values([
      { userId: OWNER_ID, tag: 'public-tag', shareCode: 'code-2', isPublic: true },
      { userId: OWNER_ID, tag: 'secret-tag', shareCode: 'code-3', isPublic: false },
    ])
    await testInstance.db
      .insert(bookmarks)
      .values([
        createTestBookmark(OWNER_ID, 'public-1', { text: 'a public post' }),
        createTestBookmark(OWNER_ID, 'secret-1', { text: 'a very secret post' }),
      ])
    await testInstance.db.insert(bookmarkTags).values([
      { userId: OWNER_ID, bookmarkId: 'public-1', tag: 'public-tag' },
      { userId: OWNER_ID, bookmarkId: 'secret-1', tag: 'secret-tag' },
    ])

    const result = await getPublicProfile(OWNER_USERNAME)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')

    expect(result.profile.collections.map((c) => c.tag)).toEqual(['public-tag'])
    expect(result.profile.publicTagCount).toBe(1)
    expect(result.profile.postCount).toBe(1)
    expect(JSON.stringify(result)).not.toContain('secret-tag')
    expect(JSON.stringify(result)).not.toContain('a very secret post')
  })

  it("never mixes another user's tagged posts into this profile (cross-user isolation)", async () => {
    await seedOwnerViaUsersTable()
    await testInstance.db.insert(users).values({
      id: OTHER_ID,
      username: OTHER_USERNAME,
      createdAt: '2026-01-01T00:00:00Z',
    })
    // Both users publish a public tag with the SAME name.
    await testInstance.db.insert(tagShares).values([
      { userId: OWNER_ID, tag: 'shared-name', shareCode: 'code-4', isPublic: true },
      { userId: OTHER_ID, tag: 'shared-name', shareCode: 'code-5', isPublic: true },
    ])
    await testInstance.db
      .insert(bookmarks)
      .values([
        createTestBookmark(OWNER_ID, 'owner-post', { text: 'owned by curator' }),
        createTestBookmark(OTHER_ID, 'rival-post', { text: 'owned by rival' }),
      ])
    await testInstance.db.insert(bookmarkTags).values([
      { userId: OWNER_ID, bookmarkId: 'owner-post', tag: 'shared-name' },
      { userId: OTHER_ID, bookmarkId: 'rival-post', tag: 'shared-name' },
    ])

    const result = await getPublicProfile(OWNER_USERNAME)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')

    expect(result.profile.collections).toHaveLength(1)
    expect(result.profile.collections[0].count).toBe(1)
    expect(result.profile.postCount).toBe(1)
    expect(JSON.stringify(result)).not.toContain('rival-post')
    expect(JSON.stringify(result)).not.toContain('owned by rival')
  })

  it('counts a post tagged with two public tags once in postCount', async () => {
    await seedOwnerViaUsersTable()
    await testInstance.db.insert(tagShares).values([
      { userId: OWNER_ID, tag: 'tag-a', shareCode: 'code-6', isPublic: true },
      { userId: OWNER_ID, tag: 'tag-b', shareCode: 'code-7', isPublic: true },
    ])
    await testInstance.db
      .insert(bookmarks)
      .values(createTestBookmark(OWNER_ID, 'double-tagged', { text: 'in both tags' }))
    await testInstance.db.insert(bookmarkTags).values([
      { userId: OWNER_ID, bookmarkId: 'double-tagged', tag: 'tag-a' },
      { userId: OWNER_ID, bookmarkId: 'double-tagged', tag: 'tag-b' },
    ])

    const result = await getPublicProfile(OWNER_USERNAME)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.profile.publicTagCount).toBe(2)
    expect(result.profile.postCount).toBe(1)
    expect(result.profile.collections.find((c) => c.tag === 'tag-a')?.count).toBe(1)
    expect(result.profile.collections.find((c) => c.tag === 'tag-b')?.count).toBe(1)
  })

  it('returns identity + stats for an ok profile, with a per-tile text fallback', async () => {
    await seedOwnerViaUsersTable()
    await testInstance.db.insert(tagShares).values({
      userId: OWNER_ID,
      tag: 'cool-stuff',
      shareCode: 'code-8',
      isPublic: true,
    })
    await testInstance.db.insert(bookmarks).values(
      createTestBookmark(OWNER_ID, 'tweet-1', {
        text: 'a fairly long post body that should get truncated for the tile preview text',
      }),
    )
    await testInstance.db.insert(bookmarkTags).values({
      userId: OWNER_ID,
      bookmarkId: 'tweet-1',
      tag: 'cool-stuff',
    })

    const result = await getPublicProfile(OWNER_USERNAME)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')

    expect(result.profile.username).toBe(OWNER_USERNAME)
    expect(result.profile.displayName).toBe('The Curator')
    expect(result.profile.avatarUrl).toBe('https://example.com/avatar.jpg')
    expect(result.profile.memberSince).toBe('2026-03-01T00:00:00Z')
    expect(result.profile.collections[0].href).toBe(`/t/${OWNER_USERNAME}/cool-stuff`)
    expect(result.profile.collections[0].tiles[0].text?.length).toBeLessThanOrEqual(40)
  })

  it('falls back to oauth_tokens identity when there is no users row', async () => {
    await seedOwnerViaOauthOnly()
    await testInstance.db.insert(tagShares).values({
      userId: OWNER_ID,
      tag: 'legacy-tag',
      shareCode: 'code-9',
      isPublic: true,
    })
    await testInstance.db
      .insert(bookmarks)
      .values(createTestBookmark(OWNER_ID, 'legacy-1', { text: 'legacy post' }))
    await testInstance.db.insert(bookmarkTags).values({
      userId: OWNER_ID,
      bookmarkId: 'legacy-1',
      tag: 'legacy-tag',
    })

    const result = await getPublicProfile(OWNER_USERNAME)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.profile.avatarUrl).toBe('https://example.com/legacy-avatar.jpg')
    expect(result.profile.memberSince).toBe('2026-02-01T00:00:00Z')
  })

  it('returns ok with a zero-count collection when a public tag has no tagged bookmarks', async () => {
    await seedOwnerViaUsersTable()
    await testInstance.db.insert(tagShares).values({
      userId: OWNER_ID,
      tag: 'empty-tag',
      shareCode: 'code-10',
      isPublic: true,
    })

    const result = await getPublicProfile(OWNER_USERNAME)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.profile.collections).toEqual([
      {
        tag: 'empty-tag',
        count: 0,
        tiles: [],
        href: `/t/${OWNER_USERNAME}/empty-tag`,
        stats: null,
      },
    ])
    expect(result.profile.postCount).toBe(0)
    expect(result.profile.stats).toEqual({ viewCount: 0, cloneCount: 0, bestRank: null })
  })

  describe('Discovery stats (docs/specs/discovery-leaderboards.md §6)', () => {
    it('attaches per-tag view/clone/rank stats and owner totals, summed over public tags only', async () => {
      await seedOwnerViaUsersTable()
      await testInstance.db.insert(tagShares).values({
        userId: OWNER_ID,
        tag: 'popular',
        shareCode: 'code-11',
        isPublic: true,
      })
      await testInstance.db
        .insert(bookmarks)
        .values(createTestBookmark(OWNER_ID, 'pop-1', { text: 'a popular post' }))
      await testInstance.db.insert(bookmarkTags).values({
        userId: OWNER_ID,
        bookmarkId: 'pop-1',
        tag: 'popular',
      })
      const now = new Date().toISOString()
      await testInstance.db.insert(collectionEvents).values([
        { action: 'view', ownerUserId: OWNER_ID, tag: 'popular', createdAt: now },
        { action: 'view', ownerUserId: OWNER_ID, tag: 'popular', createdAt: now },
        { action: 'clone', ownerUserId: OWNER_ID, tag: 'popular', createdAt: now },
      ])

      const result = await getPublicProfile(OWNER_USERNAME)
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') throw new Error('expected ok')

      const collection = result.profile.collections.find((c) => c.tag === 'popular')
      expect(collection?.stats).toEqual({ viewCount: 2, cloneCount: 1, rank: 1 })
      expect(result.profile.stats).toEqual({ viewCount: 2, cloneCount: 1, bestRank: 1 })
    })

    it("excludes a tag's historical view/clone totals from the public totals once it's private", async () => {
      await seedOwnerViaUsersTable()
      // 'still-public' stays public; 'went-private' has historical events but
      // is no longer shared — it must not appear in `collections` at all, and
      // its history must not inflate the profile-level totals either.
      await testInstance.db.insert(tagShares).values([
        { userId: OWNER_ID, tag: 'still-public', shareCode: 'code-12', isPublic: true },
        { userId: OWNER_ID, tag: 'went-private', shareCode: 'code-13', isPublic: false },
      ])
      const now = new Date().toISOString()
      await testInstance.db.insert(collectionEvents).values([
        { action: 'view', ownerUserId: OWNER_ID, tag: 'still-public', createdAt: now },
        { action: 'view', ownerUserId: OWNER_ID, tag: 'went-private', createdAt: now },
        { action: 'view', ownerUserId: OWNER_ID, tag: 'went-private', createdAt: now },
        { action: 'clone', ownerUserId: OWNER_ID, tag: 'went-private', createdAt: now },
      ])

      const result = await getPublicProfile(OWNER_USERNAME)
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') throw new Error('expected ok')

      expect(result.profile.collections.map((c) => c.tag)).toEqual(['still-public'])
      expect(result.profile.stats).toEqual({ viewCount: 1, cloneCount: 0, bestRank: 1 })
      expect(JSON.stringify(result)).not.toContain('went-private')
    })
  })
})
