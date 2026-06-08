import { describe, it, expect } from 'vitest'
import { isReelPlayable } from '@/lib/trending/filter'
import { reelVideoSrc } from '@/components/trending/ReelPlayer'
import type { TrendingItem } from '@/lib/trending/query'

/**
 * isReelPlayable gates which trending items the /trending/play reel can stream.
 * TikTok + X + Instagram video (clean MP4 + native `ended`); YouTube (iframe)
 * is excluded, and a source id is required.
 */

const base: TrendingItem = {
  action: 'save',
  platform: 'tiktok',
  bookmarkId: '7629699933892775198',
  author: 'someone',
  url: '/@someone/video/7629699933892775198',
  createdAt: '2026-06-08T00:00:00Z',
  contentType: 'video',
}

const item = (over: Partial<TrendingItem>): TrendingItem => ({ ...base, ...over })

describe('isReelPlayable', () => {
  it('plays TikTok videos with a source id', () => {
    expect(isReelPlayable(item({ platform: 'tiktok' }))).toBe(true)
  })

  it('plays X videos (contentType video, or a video-thumb poster)', () => {
    expect(isReelPlayable(item({ platform: 'twitter', contentType: 'video' }))).toBe(true)
    expect(
      isReelPlayable(
        item({
          platform: 'twitter',
          contentType: undefined,
          thumbnailUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/123/img.jpg',
        }),
      ),
    ).toBe(true)
  })

  it('plays Instagram Reels (restored via the mirror registry)', () => {
    expect(isReelPlayable(item({ platform: 'instagram', bookmarkId: 'DXVsqQ7CSXw' }))).toBe(true)
  })

  it('excludes YouTube (iframe embed — no inline MP4 auto-advance)', () => {
    expect(isReelPlayable(item({ platform: 'youtube', bookmarkId: 'Y9aytLYBajw' }))).toBe(false)
  })

  it('excludes non-video types and items without a source id', () => {
    expect(isReelPlayable(item({ platform: 'twitter', contentType: 'photo' }))).toBe(false)
    expect(isReelPlayable(item({ platform: 'twitter', contentType: 'text' }))).toBe(false)
    expect(isReelPlayable(item({ bookmarkId: null }))).toBe(false)
    expect(isReelPlayable(item({ bookmarkId: '' }))).toBe(false)
  })
})

describe('reelVideoSrc — per-platform stream URL in the reel', () => {
  it('TikTok → the TikTok proxy (username + id)', () => {
    expect(reelVideoSrc(item({ platform: 'tiktok', author: 'bob', bookmarkId: '7' }))).toBe(
      '/api/media/tiktok/video?username=bob&id=7',
    )
  })

  it('Instagram → the IG proxy (id only)', () => {
    expect(reelVideoSrc(item({ platform: 'instagram', bookmarkId: 'DXVsqQ7CSXw' }))).toBe(
      '/api/media/instagram/video?id=DXVsqQ7CSXw',
    )
  })

  it('X → the FxTwitter proxy (author + tweetId, hd)', () => {
    expect(reelVideoSrc(item({ platform: 'twitter', author: 'jack', bookmarkId: '99' }))).toBe(
      '/api/media/video?author=jack&tweetId=99&quality=hd',
    )
  })
})
