import { describe, it, expect, vi } from 'vitest'
import {
  collectionPath,
  sameBookmark,
  COLLECTION_QUEUE_LIMIT,
  isSavedPath,
} from '@/lib/theater/collection-href'

vi.mock('next/navigation', () => ({
  permanentRedirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

describe('collectionPath', () => {
  it('is a bare /saved with no open id', () => {
    expect(collectionPath()).toBe('/saved')
    expect(collectionPath({})).toBe('/saved')
  })

  it('pairs open + platform, and skips the feed-wide "all" filter value', () => {
    expect(collectionPath({ open: '123', platform: 'tiktok' })).toBe(
      '/saved?open=123&platform=tiktok',
    )
    expect(collectionPath({ open: '123', platform: 'all' })).toBe('/saved?open=123')
  })
})

describe('isSavedPath', () => {
  it('matches /saved and the legacy /collection URL', () => {
    expect(isSavedPath('/saved')).toBe(true)
    expect(isSavedPath('/collection')).toBe(true)
    expect(isSavedPath('/live')).toBe(false)
    expect(isSavedPath('/collections')).toBe(false)
  })
})

describe('/collection redirect stub', () => {
  it('308s to /saved', async () => {
    const Redirect = (await import('@/app/collection/page')).default
    await expect(Redirect({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/saved')
  })

  it('preserves open + platform on the new URL', async () => {
    const Redirect = (await import('@/app/collection/page')).default
    await expect(
      Redirect({ searchParams: Promise.resolve({ open: '123', platform: 'tiktok' }) }),
    ).rejects.toThrow('REDIRECT:/saved?open=123&platform=tiktok')
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
