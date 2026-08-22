import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDb, createTestBookmark, USER_A, USER_B, type TestDbInstance } from './api/setup'
import { bookmarks } from '@/lib/db/schema'

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
        }),
      )
      .run()

    const row = getSavedPreviewDisplay('instagram', 'reel-1')
    expect(row).toEqual({
      author: 'chef',
      authorName: 'Chef',
      text: 'A pasta reel',
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
        }),
        createTestBookmark(USER_B, 'tt-1', {
          platform: 'tiktok',
          author: 'alice',
          authorName: 'Alice',
          text: 'Same caption',
        }),
      ])
      .run()

    expect(getSavedPreviewDisplay('tiktok', 'tt-1')).toEqual({
      author: 'alice',
      authorName: 'Alice',
      text: 'Same caption',
    })
  })

  it('returns null when nobody has saved that platform+id', () => {
    expect(getSavedPreviewDisplay('youtube', 'missing')).toBeNull()
  })
})
