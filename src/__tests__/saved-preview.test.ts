import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from './api/setup'
import { bookmarkMedia, bookmarks } from '@/lib/db/schema'

let testInstance: TestDbInstance

vi.mock('@/lib/db', () => ({
  get db() {
    return testInstance.db
  },
}))

import { getSavedPreviewDisplay } from '@/lib/theater/saved-preview'

describe('getSavedPreviewDisplay', () => {
  beforeEach(() => {
    testInstance = createTestDb()
  })
  afterEach(() => testInstance.close())

  it('returns display fields for a saved post and never includes userId', () => {
    testInstance.db
      .insert(bookmarks)
      .values(
        createTestBookmark(USER_A, 'reel-1', {
          platform: 'instagram',
          author: 'chef',
          authorName: 'Chef',
          text: 'A pasta reel',
          category: 'video',
        }),
      )
      .run()

    const row = getSavedPreviewDisplay('instagram', 'reel-1')
    expect(row).toEqual({
      author: 'chef',
      authorName: 'Chef',
      text: 'A pasta reel',
      category: 'video',
      mediaCount: 0,
    })
    expect(row).not.toHaveProperty('userId')
  })

  it('returns one row when several users saved the same post', () => {
    testInstance.db
      .insert(bookmarks)
      .values([
        createTestBookmark(USER_A, 'tt-1', {
          platform: 'tiktok',
          author: 'alice',
          authorName: 'Alice',
          text: 'Same caption',
          category: 'video',
        }),
        createTestBookmark(USER_B, 'tt-1', {
          platform: 'tiktok',
          author: 'alice',
          authorName: 'Alice',
          text: 'Same caption',
          category: 'video',
        }),
      ])
      .run()

    expect(getSavedPreviewDisplay('tiktok', 'tt-1')).toEqual({
      author: 'alice',
      authorName: 'Alice',
      text: 'Same caption',
      category: 'video',
      mediaCount: 0,
    })
  })

  it('prefers a repaired Instagram photo row over a legacy video classification', () => {
    testInstance.db
      .insert(bookmarks)
      .values([
        createTestBookmark(USER_A, 'ig-shape', {
          platform: 'instagram',
          author: 'creator',
          text: 'Legacy row',
          category: 'video',
        }),
        createTestBookmark(USER_B, 'ig-shape', {
          platform: 'instagram',
          author: 'creator',
          text: 'Repaired row',
          category: 'photo',
        }),
      ])
      .run()

    expect(getSavedPreviewDisplay('instagram', 'ig-shape')).toMatchObject({
      text: 'Repaired row',
      category: 'photo',
    })
  })

  it('counts only the selected saver’s platform-matching carousel media', () => {
    testInstance.db
      .insert(bookmarks)
      .values([
        createTestBookmark(USER_A, 'ig-carousel', {
          platform: 'instagram',
          author: 'creator',
          text: 'Legacy two-slide row',
          category: 'video',
        }),
        createTestBookmark(USER_B, 'ig-carousel', {
          platform: 'instagram',
          author: 'creator',
          text: 'Six slides',
          category: 'photo',
        }),
      ])
      .run()
    testInstance.db
      .insert(bookmarkMedia)
      .values([
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `ig-carousel_${index + 1}`,
          userId: USER_B,
          platform: 'instagram' as const,
          bookmarkId: 'ig-carousel',
          mediaType: 'photo',
          originalUrl: `https://scontent.example/${index + 1}.jpg`,
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          id: `ig-carousel_legacy_${index + 1}`,
          userId: USER_A,
          platform: 'instagram' as const,
          bookmarkId: 'ig-carousel',
          mediaType: 'photo',
          originalUrl: `https://legacy.example/${index + 1}.jpg`,
        })),
        {
          id: 'same-id-other-platform',
          userId: USER_B,
          platform: 'twitter' as const,
          bookmarkId: 'ig-carousel',
          mediaType: 'photo',
          originalUrl: 'https://pbs.twimg.com/other.jpg',
        },
      ])
      .run()

    expect(getSavedPreviewDisplay('instagram', 'ig-carousel')).toMatchObject({
      text: 'Six slides',
      category: 'photo',
      mediaCount: 6,
    })
  })

  it('returns null when nobody has saved that platform+id', () => {
    expect(getSavedPreviewDisplay('youtube', 'missing')).toBeNull()
  })
})
