import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import type { TwitterBookmark } from '@/lib/twitter/client'
import { createTestDb, type TestDbInstance } from './api/setup'
import { extractEnrichmentData } from '@/lib/media/fxembed'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
  runInTransaction<R>(fn: () => R): R {
    return testInstance.sqlite.transaction(fn)()
  },
}))

vi.mock('@/lib/media/fxembed', () => ({
  fetchTweetData: vi.fn(async () => ({ tweet: {} })),
  extractEnrichmentData: vi.fn(() => null),
}))

vi.mock('@/lib/sentry', () => ({
  captureException: vi.fn(),
}))

function tweet(id = 'tweet-1'): TwitterBookmark {
  return {
    id,
    text: 'A bookmark with a link',
    authorId: 'author-1',
    author: { id: 'author-1', username: 'alice', name: 'Alice' },
    entities: {
      urls: [
        {
          url: 'https://t.co/one',
          expandedUrl: 'https://example.com/article',
          displayUrl: 'example.com/article',
        },
        {
          url: 'https://t.co/two',
          expandedUrl: 'https://example.com/article',
          displayUrl: 'example.com/article',
        },
      ],
    },
  }
}

describe('saveBookmark insert awareness', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    testInstance.sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS bookmark_links_identity_idx
      ON bookmark_links(user_id, platform, bookmark_id, expanded_url)
    `)
  })

  afterEach(() => {
    testInstance.close()
  })

  it('reports whether the main bookmark insert won', async () => {
    const { saveBookmark } = await import('@/lib/sync/save-bookmark')
    const insertedDuringSync = new Set<string>()

    const first = await saveBookmark(tweet(), 'user-1', insertedDuringSync)
    const second = await saveBookmark(tweet(), 'user-1', insertedDuringSync)

    expect(first.inserted).toBe(true)
    expect(first.bookmark.id).toBe('tweet-1')
    expect(second.inserted).toBe(false)
  })

  it('deduplicates links and does not add child rows after a lost insert race', async () => {
    const { saveBookmark } = await import('@/lib/sync/save-bookmark')
    const insertedDuringSync = new Set<string>()

    await saveBookmark(tweet(), 'user-1', insertedDuringSync)
    await saveBookmark(tweet(), 'user-1', insertedDuringSync)

    const links = await testInstance.db
      .select()
      .from(schema.bookmarkLinks)
      .where(
        and(
          eq(schema.bookmarkLinks.userId, 'user-1'),
          eq(schema.bookmarkLinks.bookmarkId, 'tweet-1'),
        ),
      )
    expect(links).toHaveLength(1)
    expect(links[0].expandedUrl).toBe('https://example.com/article')
  })

  it('merges sparse entity links with richer article enrichment', async () => {
    vi.mocked(extractEnrichmentData).mockReturnValueOnce({
      authorProfileImageUrl: 'https://pbs.twimg.com/alice.jpg',
      authorName: 'Alice',
      external: null,
      article: {
        url: 'https://example.com/article',
        title: 'Rich article title',
        description: 'Rich article description',
        imageUrl: 'https://example.com/cover.jpg',
        content: null,
      },
    })

    const { saveBookmark } = await import('@/lib/sync/save-bookmark')
    await saveBookmark(tweet(), 'user-1', new Set<string>())

    const links = await testInstance.db
      .select()
      .from(schema.bookmarkLinks)
      .where(
        and(
          eq(schema.bookmarkLinks.userId, 'user-1'),
          eq(schema.bookmarkLinks.bookmarkId, 'tweet-1'),
        ),
      )
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      originalUrl: 'https://t.co/one',
      linkType: 'article',
      previewTitle: 'Rich article title',
      previewDescription: 'Rich article description',
      previewImageUrl: 'https://example.com/cover.jpg',
    })
  })

  it('merges complementary link enrichment after losing the bookmark insert race', async () => {
    await testInstance.db.insert(schema.bookmarks).values({
      id: 'tweet-1',
      userId: 'user-1',
      platform: 'twitter',
      author: 'alice',
      text: 'Sparse winner',
      tweetUrl: 'https://x.com/alice/status/tweet-1',
      processedAt: new Date().toISOString(),
    })
    await testInstance.db.insert(schema.bookmarkLinks).values({
      userId: 'user-1',
      platform: 'twitter',
      bookmarkId: 'tweet-1',
      originalUrl: 'https://t.co/one',
      expandedUrl: 'https://example.com/article',
      domain: 'example.com',
      linkType: 'link',
    })
    vi.mocked(extractEnrichmentData).mockReturnValueOnce({
      authorProfileImageUrl: 'https://pbs.twimg.com/alice.jpg',
      authorName: 'Alice',
      external: null,
      article: {
        url: 'https://example.com/article',
        title: 'Complete article title',
        description: 'Complete article description',
        imageUrl: 'https://example.com/complete-cover.jpg',
        content: {
          blocks: [{ key: 'body', type: 'unstyled', text: 'Complete article body' }],
          entityMap: {},
          mediaEntities: {},
        },
      },
    })

    const { saveBookmark } = await import('@/lib/sync/save-bookmark')
    const result = await saveBookmark(tweet(), 'user-1', new Set<string>())

    expect(result.inserted).toBe(false)
    const links = await testInstance.db
      .select()
      .from(schema.bookmarkLinks)
      .where(
        and(
          eq(schema.bookmarkLinks.userId, 'user-1'),
          eq(schema.bookmarkLinks.platform, 'twitter'),
          eq(schema.bookmarkLinks.bookmarkId, 'tweet-1'),
          eq(schema.bookmarkLinks.expandedUrl, 'https://example.com/article'),
        ),
      )
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      originalUrl: 'https://t.co/one',
      linkType: 'article',
      domain: 'example.com',
      previewTitle: 'Complete article title',
      previewDescription: 'Complete article description',
      previewImageUrl: 'https://example.com/complete-cover.jpg',
    })
    expect(links[0].contentJson).toContain('Complete article body')
  })
})
