import { describe, it, expect } from 'vitest'
import { isReelPlayable } from '@/lib/trending/filter'
import type { TrendingItem } from '@/lib/trending/query'

/**
 * isReelPlayable gates which trending items the /trending/play reel can stream.
 * v1 = TikTok + X video (clean MP4 + native `ended`); YouTube (iframe) and
 * Instagram (poster-only) are excluded, and a source id is required.
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

  it('excludes YouTube and Instagram (no inline MP4 auto-advance)', () => {
    expect(isReelPlayable(item({ platform: 'youtube', bookmarkId: 'Y9aytLYBajw' }))).toBe(false)
    expect(isReelPlayable(item({ platform: 'instagram', bookmarkId: 'DXVsqQ7CSXw' }))).toBe(false)
  })

  it('excludes non-video types and items without a source id', () => {
    expect(isReelPlayable(item({ platform: 'twitter', contentType: 'photo' }))).toBe(false)
    expect(isReelPlayable(item({ platform: 'twitter', contentType: 'text' }))).toBe(false)
    expect(isReelPlayable(item({ bookmarkId: null }))).toBe(false)
    expect(isReelPlayable(item({ bookmarkId: '' }))).toBe(false)
  })
})
