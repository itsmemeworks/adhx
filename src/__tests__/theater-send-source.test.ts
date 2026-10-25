import { describe, it, expect } from 'vitest'
import { resolveSendSource, sendSourceKey } from '@/components/theater/useSendFile'
import type { TrendingItem } from '@/lib/trending/query'

/**
 * `resolveSendSource` matrix (Send-the-file flow, spec §2/§8). Every source
 * is the same-origin kept-file route (`/api/files/<platform>/<id>/<slot>`):
 * photo → `photo-1` with `download=1`; Twitter/TikTok/Instagram video → the
 * video-src SSOT (`reelVideoSrc`) plus a `video-1` download variant;
 * text/article → null (nothing sendable). The Instagram case is a deliberate
 * regression test: Instagram must resolve its own route, never fall through
 * to the Twitter one (a bug that's bitten this repo before).
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

  it('twitter video → the twitter kept-file video route', () => {
    const result = resolveSendSource(item({ platform: 'twitter', contentType: 'video' }))
    expect(result).toEqual({
      src: '/api/files/twitter/123/video-1?a=jack&v=2',
      downloadSrc: '/api/files/twitter/123/video-1?a=jack&download=1&v=2',
      filename: 'adhx-twitter-123.mp4',
      kind: 'video',
    })
  })

  it('twitter video albums still send the first clip (no picker)', () => {
    const result = resolveSendSource(
      item({ platform: 'twitter', contentType: 'video', videoCount: 3 }),
    )
    expect(result?.src).toBe('/api/files/twitter/123/video-1?a=jack&v=2')
  })

  it('twitter photo → the kept-file download variant, first/primary photo', () => {
    const result = resolveSendSource(item({ platform: 'twitter', contentType: 'photo' }))
    expect(result).toEqual({
      src: '/api/files/twitter/123/photo-1?a=jack&download=1&v=2',
      downloadSrc: '/api/files/twitter/123/photo-1?a=jack&download=1&v=2',
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

  it('twitter video with no author → nothing sendable (download proxy requires it)', () => {
    expect(resolveSendSource(item({ platform: 'twitter', contentType: 'video', author: '' }))).toBe(
      null,
    )
  })

  it('tiktok → its own kept-file video route, regardless of recorded contentType (single-format platform)', () => {
    const result = resolveSendSource(
      item({ platform: 'tiktok', author: '@bob', bookmarkId: '7', contentType: undefined }),
    )
    expect(result).toEqual({
      src: '/api/files/tiktok/7/video-1?a=bob&v=2',
      downloadSrc: '/api/files/tiktok/7/video-1?a=bob&download=1&v=2',
      filename: 'adhx-tiktok-7.mp4',
      kind: 'video',
    })
  })

  it('instagram → its own kept-file route, never the Twitter one (regression guard)', () => {
    const result = resolveSendSource(
      item({ platform: 'instagram', bookmarkId: 'DXVsqQ7CSXw', contentType: undefined }),
    )
    expect(result).toEqual({
      src: '/api/files/instagram/DXVsqQ7CSXw/video-1?v=2',
      downloadSrc: '/api/files/instagram/DXVsqQ7CSXw/video-1?download=1&v=2',
      filename: 'adhx-instagram-DXVsqQ7CSXw.mp4',
      kind: 'video',
    })
    expect(result?.src).not.toContain('/api/files/twitter/')
  })

  it('Instagram photo → the downloadable same-origin kept-file photo', () => {
    expect(
      resolveSendSource(
        item({ platform: 'instagram', bookmarkId: 'DcHXej3lt5W', contentType: 'photo' }),
      ),
    ).toEqual({
      src: '/api/files/instagram/DcHXej3lt5W/photo-1?download=1&v=2',
      downloadSrc: '/api/files/instagram/DcHXej3lt5W/photo-1?download=1&v=2',
      filename: 'adhx-instagram-DcHXej3lt5W.jpg',
      kind: 'photo',
    })
  })

  it('keys prefetched blobs by the resolved photo/video source', () => {
    const photo = item({
      platform: 'instagram',
      bookmarkId: 'same-id',
      contentType: 'photo',
    })
    const video = item({
      platform: 'instagram',
      bookmarkId: 'same-id',
      contentType: 'video',
    })
    const photoSource = resolveSendSource(photo)
    const videoSource = resolveSendSource(video)

    expect(photoSource).not.toBeNull()
    expect(videoSource).not.toBeNull()
    expect(sendSourceKey(photo, photoSource!)).not.toBe(sendSourceKey(video, videoSource!))
  })
})
