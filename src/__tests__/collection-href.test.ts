import { describe, it, expect } from 'vitest'
import { collectionPath, sameBookmark, COLLECTION_QUEUE_LIMIT } from '@/lib/theater/collection-href'

describe('collectionPath', () => {
  it('is a bare /collection with no open id', () => {
    expect(collectionPath()).toBe('/collection')
    expect(collectionPath({})).toBe('/collection')
  })

  it('pairs open + platform, and skips the feed-wide "all" filter value', () => {
    expect(collectionPath({ open: '123', platform: 'tiktok' })).toBe(
      '/collection?open=123&platform=tiktok',
    )
    expect(collectionPath({ open: '123', platform: 'all' })).toBe('/collection?open=123')
  })
})

describe('sameBookmark', () => {
  it('treats missing platform as twitter — and does not collide across platforms', () => {
    expect(sameBookmark({ id: '123' }, '123', 'twitter')).toBe(true)
    expect(sameBookmark({ id: '123', platform: 'tiktok' }, '123', 'twitter')).toBe(false)
    expect(sameBookmark({ id: '123', platform: 'tiktok' }, '123', 'tiktok')).toBe(true)
  })
})

describe('COLLECTION_QUEUE_LIMIT', () => {
  it('matches the feed API cap', () => {
    expect(COLLECTION_QUEUE_LIMIT).toBe(100)
  })
})
