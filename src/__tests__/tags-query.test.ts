import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type TestDbInstance, createTestBookmark } from './api/setup'
import {
  oauthTokens,
  tagShares,
  bookmarkTags,
  bookmarkMedia,
  bookmarkLinks,
  bookmarks,
} from '@/lib/db/schema'

/**
 * Tag-collection query tests — `src/lib/tags/query.ts`.
 *
 * Mirrors the style of `authors-query.test.ts`: exercises the not_found /
 * private / ok result states directly against an in-memory DB, and asserts
 * the privacy gate (private tags never leak items) plus the on-ADHX preview
 * link + platform-mismatch safety this module adds over the legacy API route.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { getPublicTagCollection } from '@/lib/tags/query'

const OWNER_ID = 'owner-user-1'
const OWNER_USERNAME = 'curator'

async function seedOwner() {
  await testInstance.db.insert(oauthTokens).values({
    userId: OWNER_ID,
    username: OWNER_USERNAME,
    accessToken: 'token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 100_000,
  })
}

describe('getPublicTagCollection', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('returns not_found when the username does not exist', async () => {
    const result = await getPublicTagCollection('nobody', 'some-tag')
    expect(result.status).toBe('not_found')
  })

  it('returns not_found when the user exists but the tag was never shared', async () => {
    await seedOwner()
    const result = await getPublicTagCollection(OWNER_USERNAME, 'never-shared')
    expect(result.status).toBe('not_found')
  })

  it('returns private (never leaking items) for a tag that is not public', async () => {
    await seedOwner()
    await testInstance.db.insert(tagShares).values({
      userId: OWNER_ID,
      tag: 'secret-tag',
      shareCode: 'code-1',
      isPublic: false,
    })
    await testInstance.db
      .insert(bookmarks)
      .values(createTestBookmark(OWNER_ID, 'secret-1', { text: 'top secret content' }))
    await testInstance.db.insert(bookmarkTags).values({
      userId: OWNER_ID,
      bookmarkId: 'secret-1',
      tag: 'secret-tag',
    })

    const result = await getPublicTagCollection(OWNER_USERNAME, 'secret-tag')
    expect(result.status).toBe('private')
    // Guard against any future refactor accidentally attaching a `data` field
    // to the private branch — the whole point is nothing renders.
    expect((result as Record<string, unknown>).data).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('top secret content')
  })

  it('returns items for a public tag, ordered newest-first, with on-ADHX preview links', async () => {
    await seedOwner()
    await testInstance.db.insert(tagShares).values({
      userId: OWNER_ID,
      tag: 'cool-stuff',
      shareCode: 'code-2',
      isPublic: true,
    })
    await testInstance.db.insert(bookmarks).values([
      createTestBookmark(OWNER_ID, 'tweet-old', {
        text: 'older post',
        author: 'author1',
        processedAt: '2026-01-01T00:00:00Z',
      }),
      createTestBookmark(OWNER_ID, 'tweet-new', {
        text: 'newer post',
        author: 'author2',
        processedAt: '2026-06-01T00:00:00Z',
      }),
    ])
    await testInstance.db.insert(bookmarkTags).values([
      { userId: OWNER_ID, bookmarkId: 'tweet-old', tag: 'cool-stuff' },
      { userId: OWNER_ID, bookmarkId: 'tweet-new', tag: 'cool-stuff' },
    ])

    const result = await getPublicTagCollection(OWNER_USERNAME, 'cool-stuff')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')

    expect(result.data.tweetCount).toBe(2)
    expect(result.data.items.map((i) => i.bookmarkId)).toEqual(['tweet-new', 'tweet-old'])

    // Every item must link to the on-ADHX preview path, never x.com directly.
    for (const item of result.data.items) {
      expect(item.url).not.toContain('x.com')
      expect(item.url).not.toContain('twitter.com')
      expect(item.url.startsWith('/')).toBe(true)
    }
    const newItem = result.data.items.find((i) => i.bookmarkId === 'tweet-new')
    expect(newItem?.url).toBe('/author2/status/tweet-new')
    expect(newItem?.externalUrl).toContain('x.com/author2/status/tweet-new')
  })

  it('returns ok with empty items when the tag is public but has zero tagged bookmarks', async () => {
    await seedOwner()
    await testInstance.db.insert(tagShares).values({
      userId: OWNER_ID,
      tag: 'empty-tag',
      shareCode: 'code-3',
      isPublic: true,
    })

    const result = await getPublicTagCollection(OWNER_USERNAME, 'empty-tag')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.data.items).toEqual([])
    expect(result.data.tweetCount).toBe(0)
  })

  it('never mismatches a bookmark id shared across platforms to the wrong platform', async () => {
    await seedOwner()
    await testInstance.db.insert(tagShares).values({
      userId: OWNER_ID,
      tag: 'cross-platform',
      shareCode: 'code-4',
      isPublic: true,
    })
    // Same numeric id, two different platforms — only the twitter one is tagged.
    await testInstance.db.insert(bookmarks).values([
      createTestBookmark(OWNER_ID, '999', {
        platform: 'twitter',
        text: 'the twitter post',
        author: 'twuser',
      }),
      createTestBookmark(OWNER_ID, '999', {
        platform: 'tiktok',
        text: 'the tiktok post',
        author: 'tkuser',
      }),
    ])
    await testInstance.db.insert(bookmarkTags).values({
      userId: OWNER_ID,
      platform: 'twitter',
      bookmarkId: '999',
      tag: 'cross-platform',
    })

    const result = await getPublicTagCollection(OWNER_USERNAME, 'cross-platform')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.data.items).toHaveLength(1)
    expect(result.data.items[0].platform).toBe('twitter')
    expect(result.data.items[0].text).toBe('the twitter post')
  })

  it('derives contentType from media for photo/video bookmarks', async () => {
    await seedOwner()
    await testInstance.db.insert(tagShares).values({
      userId: OWNER_ID,
      tag: 'media-tag',
      shareCode: 'code-5',
      isPublic: true,
    })
    await testInstance.db
      .insert(bookmarks)
      .values(createTestBookmark(OWNER_ID, 'photo-1', { text: 'a photo post' }))
    await testInstance.db.insert(bookmarkMedia).values({
      id: 'photo-1_0',
      userId: OWNER_ID,
      bookmarkId: 'photo-1',
      mediaType: 'photo',
      originalUrl: 'https://example.com/photo.jpg',
    })
    await testInstance.db.insert(bookmarkTags).values({
      userId: OWNER_ID,
      bookmarkId: 'photo-1',
      tag: 'media-tag',
    })

    const result = await getPublicTagCollection(OWNER_USERNAME, 'media-tag')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.data.items[0].contentType).toBe('photo')
  })

  it('prefers the article link cover/title for article-category bookmarks', async () => {
    await seedOwner()
    await testInstance.db.insert(tagShares).values({
      userId: OWNER_ID,
      tag: 'article-tag',
      shareCode: 'code-6',
      isPublic: true,
    })
    await testInstance.db.insert(bookmarks).values(
      createTestBookmark(OWNER_ID, 'article-1', {
        text: 'https://t.co/shortlink',
        category: 'article',
      }),
    )
    await testInstance.db.insert(bookmarkLinks).values({
      userId: OWNER_ID,
      bookmarkId: 'article-1',
      expandedUrl: 'https://example.com/article',
      linkType: 'article',
      previewTitle: 'The Real Headline',
      previewImageUrl: 'https://example.com/cover.jpg',
    })
    await testInstance.db.insert(bookmarkTags).values({
      userId: OWNER_ID,
      bookmarkId: 'article-1',
      tag: 'article-tag',
    })

    const result = await getPublicTagCollection(OWNER_USERNAME, 'article-tag')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')
    const item = result.data.items[0]
    expect(item.contentType).toBe('article')
    expect(item.text).toBe('The Real Headline')
    expect(item.thumbnailUrl).toBe('https://example.com/cover.jpg')
  })
})
