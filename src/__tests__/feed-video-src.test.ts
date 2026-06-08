import { describe, it, expect } from 'vitest'
import { feedVideoSrc, feedHoverSrc } from '@/components/feed/video-src'
import type { FeedItem } from '@/components/feed/types'

/**
 * Per-platform video source resolution for the in-app feed/triage cards.
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

const withVideo = (platform: FeedItem['platform'], url: string): FeedItem =>
  item({ platform, media: [{ mediaType: 'video', url }] as unknown as FeedItem['media'] })

describe('feedVideoSrc — inline playback (focus/triage)', () => {
  it('Twitter → the FxTwitter proxy at hd quality (built from author + id)', () => {
    expect(feedVideoSrc(item({ platform: 'twitter', author: 'jack', id: '99' }))).toBe(
      '/api/media/video?author=jack&tweetId=99&quality=hd',
    )
  })

  it('TikTok → the feed-provided proxy URL (media[0].url), NOT the Twitter proxy', () => {
    const src = feedVideoSrc(withVideo('tiktok', '/api/media/tiktok/video?username=bob&id=7'))
    expect(src).toBe('/api/media/tiktok/video?username=bob&id=7')
  })

  it('Instagram → the feed-provided proxy URL (media[0].url), NOT the Twitter proxy', () => {
    const src = feedVideoSrc(withVideo('instagram', '/api/media/instagram/video?id=DXVsqQ7CSXw'))
    expect(src).toBe('/api/media/instagram/video?id=DXVsqQ7CSXw')
    expect(src).not.toContain('/api/media/video?author=')
  })

  it('falls back to the Twitter proxy if a non-Twitter row is missing its url', () => {
    expect(feedVideoSrc(item({ platform: 'instagram', media: null }))).toContain(
      '/api/media/video?author=',
    )
  })
})

describe('feedHoverSrc — gallery hover-to-play', () => {
  it('Twitter → the light preview quality tier', () => {
    expect(feedHoverSrc(item({ platform: 'twitter', author: 'jack', id: '99' }))).toBe(
      '/api/media/video?author=jack&tweetId=99&quality=preview',
    )
  })

  it('TikTok + Instagram → their stream URL (hover-play enabled)', () => {
    expect(feedHoverSrc(withVideo('tiktok', '/api/media/tiktok/video?username=bob&id=7'))).toBe(
      '/api/media/tiktok/video?username=bob&id=7',
    )
    expect(feedHoverSrc(withVideo('instagram', '/api/media/instagram/video?id=abc'))).toBe(
      '/api/media/instagram/video?id=abc',
    )
  })

  it('YouTube → null (iframe only, no MP4 to hover-play)', () => {
    expect(feedHoverSrc(withVideo('youtube', 'irrelevant'))).toBeNull()
  })
})
