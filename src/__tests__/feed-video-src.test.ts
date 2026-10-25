import { describe, it, expect } from 'vitest'
import { feedVideoSrc, feedHoverSrc } from '@/components/feed/video-src'
import type { FeedItem } from '@/components/feed/types'

/**
 * Per-platform video source resolution for the in-app feed/collection cards.
 *
 * This is the regression we hit twice: each surface special-cased TikTok and let
 * Instagram fall through to the Twitter proxy, so IG video played on the preview
 * page but was dead in the feed. These tests lock the URL each platform resolves
 * to so it can't silently drift again.
 */

const item = (over: Partial<FeedItem>): FeedItem =>
  ({
    id: '123',
    platform: 'twitter',
    author: 'alice',
    text: '',
    media: null,
    ...over,
  }) as unknown as FeedItem

describe('feedVideoSrc — inline playback (focus/collection)', () => {
  it('Twitter → the kept-file route for video #1 (built from author + id)', () => {
    expect(feedVideoSrc(item({ platform: 'twitter', author: 'jack', id: '99' }))).toBe(
      '/api/files/twitter/99/video-1?a=jack&v=2',
    )
  })

  it('TikTok → its own kept-file route with the author, NOT the Twitter route', () => {
    expect(feedVideoSrc(item({ platform: 'tiktok', author: 'bob', id: '7' }))).toBe(
      '/api/files/tiktok/7/video-1?a=bob&v=2',
    )
  })

  it('Instagram → its own kept-file route, NOT the Twitter route', () => {
    const src = feedVideoSrc(item({ platform: 'instagram', id: 'DXVsqQ7CSXw' }))
    expect(src).toBe('/api/files/instagram/DXVsqQ7CSXw/video-1?v=2')
    expect(src).not.toContain('/api/files/twitter/')
  })

  it('a new network gets its own route too', () => {
    expect(
      feedVideoSrc(item({ platform: 'youtube' as FeedItem['platform'], id: 'jNQXAC9IVRw' })),
    ).toBe('/api/files/youtube/jNQXAC9IVRw/video-1?v=2')
  })
})

describe('feedHoverSrc — gallery hover-to-play', () => {
  it('Twitter → the kept-file route for video #1', () => {
    expect(feedHoverSrc(item({ platform: 'twitter', author: 'jack', id: '99' }))).toBe(
      '/api/files/twitter/99/video-1?a=jack&v=2',
    )
  })

  it('TikTok + Instagram → their kept-file route (hover-play enabled)', () => {
    expect(feedHoverSrc(item({ platform: 'tiktok', author: 'bob', id: '7' }))).toBe(
      '/api/files/tiktok/7/video-1?a=bob&v=2',
    )
    expect(feedHoverSrc(item({ platform: 'instagram', id: 'abc' }))).toBe(
      '/api/files/instagram/abc/video-1?v=2',
    )
  })
})
