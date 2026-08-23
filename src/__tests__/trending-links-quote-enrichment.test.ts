import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, createTestBookmark, type TestDbInstance } from './api/setup'
import { activity, bookmarks, bookmarkLinks, type NewActivity } from '@/lib/db/schema'

/**
 * Regression coverage for recording + serving `textLinks`/`quote` at preview
 * time (not just for saved posts). See `record.ts`'s `packTextLinks`/
 * `packQuote` and `query.ts`'s enrichment precedence.
 */

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { getTrendingItems } from '@/lib/trending/query'

function seedActivity(overrides: Partial<NewActivity> & { createdAt: string; bookmarkId: string }) {
  const row: NewActivity = {
    action: 'save',
    platform: 'twitter',
    author: 'someauthor',
    url: `/someauthor/status/${overrides.bookmarkId}`,
    ...overrides,
  }
  testInstance.db.insert(activity).values(row).run()
}

describe('getTrendingItems textLinks/quote enrichment', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('serves recorded textLinks for a preview-only post', async () => {
    seedActivity({
      bookmarkId: 'preview1',
      createdAt: '2026-06-06T10:00:00Z',
      textLinks: JSON.stringify([
        { shortUrl: 'https://t.co/abc', expandedUrl: 'https://example.com/a', linkType: 'link' },
      ]),
    })

    const { items } = await getTrendingItems()
    const item = items.find((i) => i.bookmarkId === 'preview1')
    expect(item?.textLinks).toEqual([
      { shortUrl: 'https://t.co/abc', expandedUrl: 'https://example.com/a', linkType: 'link' },
    ])
  })

  it('prefers bookmark_links over recorded textLinks for a saved post', async () => {
    testInstance.db
      .insert(bookmarks)
      .values(createTestBookmark('owner-1', 'saved1', { platform: 'twitter' }))
      .run()
    testInstance.db
      .insert(bookmarkLinks)
      .values({
        userId: 'owner-1',
        platform: 'twitter',
        bookmarkId: 'saved1',
        originalUrl: 'https://t.co/real',
        expandedUrl: 'https://real-source.example/x',
        linkType: 'link',
      })
      .run()
    seedActivity({
      bookmarkId: 'saved1',
      createdAt: '2026-06-06T10:00:00Z',
      textLinks: JSON.stringify([
        {
          shortUrl: 'https://t.co/stale',
          expandedUrl: 'https://stale.example/x',
          linkType: 'link',
        },
      ]),
    })

    const { items } = await getTrendingItems()
    const item = items.find((i) => i.bookmarkId === 'saved1')
    expect(item?.textLinks).toEqual([
      {
        shortUrl: 'https://t.co/real',
        expandedUrl: 'https://real-source.example/x',
        linkType: 'link',
      },
    ])
  })

  it('serves recorded quote for a preview-only quote post', async () => {
    seedActivity({
      bookmarkId: 'qpreview1',
      createdAt: '2026-06-06T10:00:00Z',
      quoteJson: JSON.stringify({
        author: 'quoter',
        authorName: 'Quoter',
        text: 'quoted text',
        authorAvatarUrl: 'https://pbs.twimg.com/q.jpg',
      }),
    })

    const { items } = await getTrendingItems()
    const item = items.find((i) => i.bookmarkId === 'qpreview1')
    expect(item?.quote).toEqual({
      author: 'quoter',
      authorName: 'Quoter',
      text: 'quoted text',
      authorAvatarUrl: 'https://pbs.twimg.com/q.jpg',
    })
  })

  it('derives quote from the saved bookmark quoteContext when nothing was recorded', async () => {
    testInstance.db
      .insert(bookmarks)
      .values(
        createTestBookmark('owner-1', 'qsaved1', {
          platform: 'twitter',
          isQuote: true,
          quoteContext: JSON.stringify({
            tweetId: '999',
            author: 'bookmarkquoter',
            authorName: 'Bookmark Quoter',
            text: 'context quote text',
            authorProfileImageUrl: 'https://pbs.twimg.com/bq.jpg',
          }),
        }),
      )
      .run()
    seedActivity({ bookmarkId: 'qsaved1', createdAt: '2026-06-06T10:00:00Z' })

    const { items } = await getTrendingItems()
    const item = items.find((i) => i.bookmarkId === 'qsaved1')
    expect(item?.quote).toEqual({
      author: 'bookmarkquoter',
      authorName: 'Bookmark Quoter',
      text: 'context quote text',
      authorAvatarUrl: 'https://pbs.twimg.com/bq.jpg',
      bookmarkId: '999',
    })
  })

  it('recorded quote_json wins over the saved bookmark quoteContext', async () => {
    testInstance.db
      .insert(bookmarks)
      .values(
        createTestBookmark('owner-1', 'qboth1', {
          platform: 'twitter',
          isQuote: true,
          quoteContext: JSON.stringify({
            tweetId: '999',
            author: 'stalequoter',
            text: 'stale quote text',
          }),
        }),
      )
      .run()
    seedActivity({
      bookmarkId: 'qboth1',
      createdAt: '2026-06-06T10:00:00Z',
      quoteJson: JSON.stringify({ author: 'freshquoter', text: 'fresh quote text' }),
    })

    const { items } = await getTrendingItems()
    const item = items.find((i) => i.bookmarkId === 'qboth1')
    expect(item?.quote).toMatchObject({ author: 'freshquoter', text: 'fresh quote text' })
  })

  it('never leaks the raw stored textLinks/quoteJson columns onto the item', async () => {
    seedActivity({
      bookmarkId: 'clean1',
      createdAt: '2026-06-06T10:00:00Z',
      textLinks: JSON.stringify([{ expandedUrl: 'https://example.com/a' }]),
      quoteJson: JSON.stringify({ author: 'a', text: 'b' }),
    })

    const { items } = await getTrendingItems()
    const item = items.find((i) => i.bookmarkId === 'clean1') as unknown as Record<string, unknown>
    expect(item).not.toHaveProperty('quoteJson')
    expect(typeof item?.textLinks === 'object' || item?.textLinks === undefined).toBe(true)
  })

  it('malformed stored JSON serves as absent rather than throwing', async () => {
    seedActivity({
      bookmarkId: 'malformed1',
      createdAt: '2026-06-06T10:00:00Z',
      textLinks: '{not json',
      quoteJson: '{also not json',
    })

    const { items } = await getTrendingItems()
    const item = items.find((i) => i.bookmarkId === 'malformed1')
    expect(item?.textLinks).toBeUndefined()
    expect(item?.quote).toBeUndefined()
  })
})
