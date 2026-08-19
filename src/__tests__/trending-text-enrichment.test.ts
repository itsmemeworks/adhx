import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, createTestBookmark, type TestDbInstance } from './api/setup'
import { activity, bookmarks, bookmarkLinks, type NewActivity } from '@/lib/db/schema'

/**
 * Regression coverage for serving FULL post text on saved posts, not the
 * 240/500-char write-time cap on `activity.text` (see `record.ts`'s
 * `TEXT_CAP`). Before this fix, the theater's "Show more" on a saved post
 * could expand to an already-truncated string ending in "…".
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

describe('getTrendingItems text enrichment', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('serves the full bookmark text for a saved post, not the capped recorded text', async () => {
    const fullText = 'x'.repeat(400) // longer than the 240-char legacy write-time cap
    testInstance.db
      .insert(bookmarks)
      .values(createTestBookmark('owner-1', 'long1', { platform: 'twitter', text: fullText }))
      .run()
    // Recorded activity text simulates the old capped write (ends in an ellipsis).
    seedActivity({
      bookmarkId: 'long1',
      createdAt: '2026-06-06T10:00:00Z',
      text: `${fullText.slice(0, 239)}…`,
    })

    const { items } = await getTrendingItems()

    const item = items.find((i) => i.bookmarkId === 'long1')
    expect(item?.text).toBe(fullText)
    expect(item?.text?.endsWith('…')).toBe(false)
  })

  it('still prefers the article title over the full bookmark text for article posts', async () => {
    testInstance.db
      .insert(bookmarks)
      .values(
        createTestBookmark('owner-1', 'article1', {
          platform: 'twitter',
          category: 'article',
          text: 'this is just the wrapper tweet with a t.co link',
        }),
      )
      .run()
    testInstance.db
      .insert(bookmarkLinks)
      .values({
        userId: 'owner-1',
        platform: 'twitter',
        bookmarkId: 'article1',
        originalUrl: 'https://t.co/abc',
        expandedUrl: 'https://example.com/article',
        linkType: 'article',
        previewTitle: 'The Real Article Headline',
      })
      .run()
    seedActivity({ bookmarkId: 'article1', createdAt: '2026-06-06T10:00:00Z' })

    const { items } = await getTrendingItems()

    const item = items.find((i) => i.bookmarkId === 'article1')
    expect(item?.contentType).toBe('article')
    expect(item?.text).toBe('The Real Article Headline')
  })

  it('falls back to the recorded (capped) text for preview-only posts with no saved bookmark', async () => {
    const cappedText = `${'y'.repeat(239)}…`
    seedActivity({ bookmarkId: 'previewonly', createdAt: '2026-06-06T10:00:00Z', text: cappedText })

    const { items } = await getTrendingItems()

    const item = items.find((i) => i.bookmarkId === 'previewonly')
    expect(item?.text).toBe(cappedText)
  })

  it('caps served text at 2000 chars even for a very long saved bookmark', async () => {
    const hugeText = 'z'.repeat(3000)
    testInstance.db
      .insert(bookmarks)
      .values(createTestBookmark('owner-1', 'huge1', { platform: 'twitter', text: hugeText }))
      .run()
    seedActivity({ bookmarkId: 'huge1', createdAt: '2026-06-06T10:00:00Z', text: 'short recorded' })

    const { items } = await getTrendingItems()

    const item = items.find((i) => i.bookmarkId === 'huge1')
    expect(item?.text?.length).toBe(2000)
    expect(item?.text?.endsWith('…')).toBe(true)
  })
})
