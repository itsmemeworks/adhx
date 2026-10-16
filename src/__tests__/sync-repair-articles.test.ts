import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '@/lib/db/schema'
import { createTestBookmark, createTestDb, type TestDbInstance } from './api/setup'
import { extractEnrichmentData, fetchTweetData } from '@/lib/media/fxembed'
import { repairUnloadedArticles } from '@/lib/sync/repair-articles'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

vi.mock('@/lib/media/fxembed', () => ({
  fetchTweetData: vi.fn(async () => ({ tweet: {} })),
  extractEnrichmentData: vi.fn(() => ({
    article: {
      url: 'https://x.com/ana/article/1',
      title: 'How to Build a Company Brain',
      description: 'It gets smarter every week',
      imageUrl: 'https://pbs.twimg.com/a.jpg',
      content: { blocks: [{ text: 'Start here' }] },
    },
  })),
}))

describe('articles that never loaded', () => {
  beforeEach(() => {
    testInstance = createTestDb()
    testInstance.sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS bookmark_links_identity_idx
      ON bookmark_links(user_id, platform, bookmark_id, expanded_url)
    `)
  })
  afterEach(() => {
    testInstance.close()
    vi.clearAllMocks()
  })

  it('fetches a bare article link again and stores it for every saver', async () => {
    const bare = { text: 'https://x.com/i/article/99', category: 'tweet' as const }
    testInstance.db
      .insert(schema.bookmarks)
      .values(createTestBookmark('u1', '1', bare))
      .run()
    testInstance.db
      .insert(schema.bookmarks)
      .values(createTestBookmark('u2', '1', bare))
      .run()
    testInstance.db
      .insert(schema.bookmarks)
      .values(createTestBookmark('u1', '2', { text: 'just a post' }))
      .run()

    expect(await repairUnloadedArticles({ pauseMs: 0 })).toEqual([
      { platform: 'twitter', postId: '1' },
    ])
    expect(fetchTweetData).toHaveBeenCalledTimes(1)
    const links = testInstance.db.select().from(schema.bookmarkLinks).all()
    expect(links.map((l) => l.userId).sort()).toEqual(['u1', 'u2'])
    expect(links[0]).toMatchObject({
      linkType: 'article',
      previewTitle: 'How to Build a Company Brain',
    })
    const rows = testInstance.db.select().from(schema.bookmarks).all()
    expect(rows.filter((r) => r.id === '1').every((r) => r.category === 'article')).toBe(true)

    // Loaded now, so the next pass leaves it alone.
    expect(await repairUnloadedArticles({ pauseMs: 0 })).toEqual([])
  })

  it('leaves it for next time when the article still can’t be fetched', async () => {
    vi.mocked(extractEnrichmentData).mockReturnValueOnce(null)
    testInstance.db
      .insert(schema.bookmarks)
      .values(createTestBookmark('u1', '3', { text: 'https://x.com/i/article/7' }))
      .run()
    expect(await repairUnloadedArticles({ pauseMs: 0 })).toEqual([])
    expect(testInstance.db.select().from(schema.bookmarkLinks).all()).toEqual([])
  })
})
