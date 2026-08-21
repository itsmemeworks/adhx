import { describe, it, expect } from 'vitest'
import { resolveSendSource } from '@/components/theater/useSendFile'
import type { TrendingItem } from '@/lib/trending/query'

/**
 * `resolveSendSource` matrix (Send-the-file flow, spec §2/§8). Twitter photo
 * → the `/api/media/image` proxy's download variant; Twitter/TikTok/Instagram
 * video → the video-src SSOT (`reelVideoSrc`); YouTube → null (no MP4 mirror
 * exists — official iframe only); text/article/quote → null (nothing
 * sendable). The Instagram case is a deliberate regression test: Instagram
 * must resolve its own mirror, never fall through to the Twitter FxTwitter
 * proxy (a bug that's bitten this repo before).
 */

const base: TrendingItem = {
  action: 'save',
  platform: 'twitter',
  bookmarkId: '123',
  author: 'jack',
  url: '/jack/status/123',
  createdAt: '2026-06-08T00:00:00Z',
  thumbnailUrl: 'https://pbs.twimg.com/thumb.jpg',
}

const item = (over: Partial<TrendingItem>): TrendingItem => ({ ...base, ...over })

describe('resolveSendSource', () => {
  it('returns null for a null item', () => {
    expect(resolveSendSource(null)).toBe(null)
  })

  it('returns null when the item has no bookmarkId', () => {
    expect(resolveSendSource(item({ bookmarkId: null }))).toBe(null)
    expect(resolveSendSource(item({ bookmarkId: undefined }))).toBe(null)
  })

  it('twitter video → the FxTwitter MP4 proxy', () => {
    const result = resolveSendSource(item({ platform: 'twitter', contentType: 'video' }))
    expect(result).toEqual({
      src: '/api/media/video?author=jack&tweetId=123&quality=hd',
      filename: 'adhx-twitter-123.mp4',
      kind: 'video',
    })
  })

  it('twitter photo → the image proxy download variant, first/primary photo', () => {
    const result = resolveSendSource(item({ platform: 'twitter', contentType: 'photo' }))
    expect(result).toEqual({
      src: '/api/media/image?author=jack&tweetId=123&index=1&download=1',
      filename: 'adhx-twitter-123.jpg',
      kind: 'photo',
    })
  })

  it('twitter text/article/unknown → nothing sendable', () => {
    expect(resolveSendSource(item({ platform: 'twitter', contentType: 'text' }))).toBe(null)
    expect(resolveSendSource(item({ platform: 'twitter', contentType: 'article' }))).toBe(null)
    expect(resolveSendSource(item({ platform: 'twitter', contentType: undefined }))).toBe(null)
  })

  it('twitter photo with no author → nothing sendable (image proxy requires it)', () => {
    expect(resolveSendSource(item({ platform: 'twitter', contentType: 'photo', author: '' }))).toBe(
      null,
    )
  })

  it('tiktok → its own MP4 proxy, regardless of recorded contentType (single-format platform)', () => {
    const result = resolveSendSource(
      item({ platform: 'tiktok', author: '@bob', bookmarkId: '7', contentType: undefined }),
    )
    expect(result).toEqual({
      src: '/api/media/tiktok/video?username=%40bob&id=7',
      filename: 'adhx-tiktok-7.mp4',
      kind: 'video',
    })
  })

  it('instagram → its own mirror, never the Twitter proxy (regression guard)', () => {
    const result = resolveSendSource(
      item({ platform: 'instagram', bookmarkId: 'DXVsqQ7CSXw', contentType: undefined }),
    )
    expect(result).toEqual({
      src: '/api/media/instagram/video?id=DXVsqQ7CSXw',
      filename: 'adhx-instagram-DXVsqQ7CSXw.mp4',
      kind: 'video',
    })
    expect(result?.src).not.toContain('/api/media/video?')
  })

  it('youtube → null (no MP4 mirror exists — official iframe only)', () => {
    expect(resolveSendSource(item({ platform: 'youtube', contentType: 'video' }))).toBe(null)
  })
})
