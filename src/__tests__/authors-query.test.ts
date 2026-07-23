import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, type TestDbInstance } from './api/setup'
import {
  activity,
  bookmarks,
  bookmarkMedia,
  bookmarkLinks,
  type NewActivity,
} from '@/lib/db/schema'

/**
 * Author hub query tests — `src/lib/authors/query.ts`.
 *
 * Mirrors the trending anonymity regression suite (see
 * `trending-anonymity.test.ts`): `bookmarks.userId` must never be exposed as a
 * raw value in the returned profile/items, only ever folded into an anonymous
 * `count(distinct userId)` aggregate.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { getAuthorProfile, isValidHandle } from '@/lib/authors/query'

const SECRET_USER_A = 'secret-user-a'
const SECRET_USER_B = 'secret-user-b'

function seedActivity(overrides: Partial<NewActivity> & { createdAt: string; bookmarkId: string }) {
  const row: NewActivity = {
    action: 'preview',
    platform: 'twitter',
    author: 'someauthor',
    url: `/someauthor/status/${overrides.bookmarkId}`,
    ...overrides,
  }
  testInstance.db.insert(activity).values(row).run()
}

describe('isValidHandle', () => {
  it('accepts 1-15 char alphanumeric/underscore handles', () => {
    expect(isValidHandle('a')).toBe(true)
    expect(isValidHandle('abcdefghijklmno')).toBe(true) // 15 chars
    expect(isValidHandle('_under_score_')).toBe(true)
    expect(isValidHandle('MixedCase123')).toBe(true)
  })

  it('rejects invalid handles', () => {
    expect(isValidHandle('')).toBe(false)
    expect(isValidHandle('abcdefghijklmnop')).toBe(false) // 16 chars
    expect(isValidHandle('user-name')).toBe(false)
    expect(isValidHandle('user.name')).toBe(false)
    expect(isValidHandle('user name')).toBe(false)
    expect(isValidHandle('user@name')).toBe(false)
    expect(isValidHandle('émoji')).toBe(false)
    expect(isValidHandle('../../etc')).toBe(false)
  })
})

describe('getAuthorProfile', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('returns null for an invalid handle without querying', async () => {
    const profile = await getAuthorProfile('not a handle!')
    expect(profile).toBeNull()
  })

  it('returns null when the author has zero public activity (404 signal)', async () => {
    const profile = await getAuthorProfile('nobodyhome')
    expect(profile).toBeNull()
  })

  it('matches the handle case-insensitively across activity and bookmarks', async () => {
    seedActivity({
      bookmarkId: '1',
      author: 'HachiTune',
      authorName: 'Hachi',
      createdAt: '2026-06-06T10:00:00Z',
    })
    testInstance.db
      .insert(bookmarks)
      .values({
        id: '2',
        userId: 'user-x',
        author: 'hachitune',
        text: 'a saved tweet',
        tweetUrl: 'https://x.com/hachitune/status/2',
        processedAt: '2026-06-06T11:00:00Z',
      })
      .run()

    const profile = await getAuthorProfile('HACHITUNE')
    expect(profile).not.toBeNull()
    expect(profile!.items.map((i) => i.bookmarkId).sort()).toEqual(['1', '2'])
    expect(profile!.totalCount).toBe(2)
  })

  it('never exposes bookmarks.userId as a raw value', async () => {
    testInstance.db
      .insert(bookmarks)
      .values({
        id: 'tweet-1',
        userId: SECRET_USER_A,
        author: 'pubauthor',
        text: 'saved content',
        tweetUrl: 'https://x.com/pubauthor/status/tweet-1',
        processedAt: '2026-06-06T10:00:00Z',
      })
      .run()
    // A second saver of the SAME post — exercises the count(distinct userId)
    // aggregate path, not just a single row.
    testInstance.db
      .insert(bookmarks)
      .values({
        id: 'tweet-1',
        userId: SECRET_USER_B,
        author: 'pubauthor',
        text: 'saved content',
        tweetUrl: 'https://x.com/pubauthor/status/tweet-1',
        processedAt: '2026-06-06T11:00:00Z',
      })
      .run()

    const profile = await getAuthorProfile('pubauthor')
    expect(profile).not.toBeNull()
    expect(JSON.stringify(profile)).not.toContain(SECRET_USER_A)
    expect(JSON.stringify(profile)).not.toContain(SECRET_USER_B)
    for (const item of profile!.items) {
      expect(item).not.toHaveProperty('userId')
    }
    // Two distinct savers of the same post -> anonymous save count of 2.
    expect(profile!.items.find((i) => i.bookmarkId === 'tweet-1')?.saveCount).toBe(2)
  })

  it('never exposes activity.userId', async () => {
    seedActivity({
      bookmarkId: '1',
      author: 'pubauthor2',
      createdAt: '2026-06-06T10:00:00Z',
      userId: SECRET_USER_A,
    })

    const profile = await getAuthorProfile('pubauthor2')
    expect(profile).not.toBeNull()
    expect(JSON.stringify(profile)).not.toContain(SECRET_USER_A)
  })

  it('dedupes a post that is both previewed (activity) and saved (bookmark) into one item', async () => {
    testInstance.db
      .insert(bookmarks)
      .values({
        id: 'dup-1',
        userId: 'user-y',
        author: 'dupauthor',
        text: 'saved version',
        tweetUrl: 'https://x.com/dupauthor/status/dup-1',
        processedAt: '2026-06-06T09:00:00Z',
      })
      .run()
    seedActivity({
      bookmarkId: 'dup-1',
      author: 'dupauthor',
      createdAt: '2026-06-06T10:00:00Z',
    })

    const profile = await getAuthorProfile('dupauthor')
    expect(profile).not.toBeNull()
    expect(profile!.items.filter((i) => i.bookmarkId === 'dup-1')).toHaveLength(1)
    expect(profile!.totalCount).toBe(1)
  })

  it('derives contentType from media/category for saved posts, and from recorded activity for preview-only posts', async () => {
    // Saved photo post.
    testInstance.db
      .insert(bookmarks)
      .values({
        id: 'photo-1',
        userId: 'user-z',
        author: 'typeauthor',
        text: 'a photo post',
        tweetUrl: 'https://x.com/typeauthor/status/photo-1',
        processedAt: '2026-06-06T09:00:00Z',
      })
      .run()
    testInstance.db
      .insert(bookmarkMedia)
      .values({
        id: 'photo-1_0',
        userId: 'user-z',
        platform: 'twitter',
        bookmarkId: 'photo-1',
        mediaType: 'photo',
        originalUrl: 'https://example.com/photo.jpg',
      })
      .run()

    // Preview-only article (no saved bookmark) — type comes from the recorded
    // activity.content_type since there's nothing to derive it from otherwise.
    seedActivity({
      bookmarkId: 'article-1',
      author: 'typeauthor',
      createdAt: '2026-06-06T10:00:00Z',
      contentType: 'article',
      text: 'An article headline',
    })

    const profile = await getAuthorProfile('typeauthor')
    expect(profile).not.toBeNull()
    const photo = profile!.items.find((i) => i.bookmarkId === 'photo-1')
    const article = profile!.items.find((i) => i.bookmarkId === 'article-1')
    expect(photo?.contentType).toBe('photo')
    expect(article?.contentType).toBe('article')
  })

  it('prefers the article link cover/title over the recorded thumbnail/text', async () => {
    testInstance.db
      .insert(bookmarks)
      .values({
        id: 'article-2',
        userId: 'user-w',
        author: 'articleauthor',
        text: 'https://t.co/shortlink',
        tweetUrl: 'https://x.com/articleauthor/status/article-2',
        processedAt: '2026-06-06T09:00:00Z',
        category: 'article',
      })
      .run()
    testInstance.db
      .insert(bookmarkLinks)
      .values({
        userId: 'user-w',
        platform: 'twitter',
        bookmarkId: 'article-2',
        expandedUrl: 'https://example.com/article',
        linkType: 'article',
        previewTitle: 'The Real Headline',
        previewImageUrl: 'https://example.com/cover.jpg',
      })
      .run()

    const profile = await getAuthorProfile('articleauthor')
    const item = profile!.items.find((i) => i.bookmarkId === 'article-2')
    expect(item?.contentType).toBe('article')
    expect(item?.text).toBe('The Real Headline')
    expect(item?.thumbnailUrl).toBe('https://example.com/cover.jpg')
  })

  it('caps items at 30 but reports the full totalCount', async () => {
    for (let i = 0; i < 35; i++) {
      seedActivity({
        bookmarkId: `many-${i}`,
        author: 'prolificauthor',
        createdAt: `2026-06-06T${String(i % 24).padStart(2, '0')}:00:00Z`,
      })
    }

    const profile = await getAuthorProfile('prolificauthor')
    expect(profile).not.toBeNull()
    expect(profile!.items.length).toBe(30)
    expect(profile!.totalCount).toBe(35)
  })

  it('ignores non-twitter platform activity/bookmarks for the same handle', async () => {
    seedActivity({
      bookmarkId: 'tk-1',
      author: 'crossplatform',
      platform: 'tiktok',
      url: '/@crossplatform/video/tk-1',
      createdAt: '2026-06-06T10:00:00Z',
    })

    const profile = await getAuthorProfile('crossplatform')
    expect(profile).toBeNull()
  })
})
