import { describe, it, expect } from 'vitest'
import { instagramWarmSrc, resolvePlaybackSource } from '@/components/theater/usePlaybackSource'
import type { TrendingItem } from '@/lib/trending/query'

/**
 * Per-platform playback resolution matrix (spec §6, PR-1 scope). Twitter/TikTok
 * video → MP4 via the video-src SSOT; Instagram/YouTube → poster-only for now
 * (their real stages land in PR 2); everything else → no media pipeline.
 *
 * The Instagram case is a deliberate regression test: Instagram must NOT fall
 * through to the Twitter FxTwitter proxy (a bug that's bitten this repo before
 * — see per-platform-video-src repo notes).
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

describe('resolvePlaybackSource', () => {
  it('returns none for a null item', () => {
    expect(resolvePlaybackSource(null)).toEqual({ kind: 'none', src: null, poster: null })
  })

  it('twitter video → the FxTwitter MP4 proxy', () => {
    const result = resolvePlaybackSource(item({ platform: 'twitter', contentType: 'video' }))
    expect(result).toEqual({
      kind: 'video',
      src: '/api/media/video?author=jack&tweetId=123&quality=hd',
      poster: 'https://pbs.twimg.com/thumb.jpg',
    })
  })

  it('twitter non-video (photo/text) → no media pipeline', () => {
    expect(resolvePlaybackSource(item({ platform: 'twitter', contentType: 'photo' })).kind).toBe(
      'none',
    )
    expect(resolvePlaybackSource(item({ platform: 'twitter', contentType: 'text' })).kind).toBe(
      'none',
    )
    expect(resolvePlaybackSource(item({ platform: 'twitter', contentType: undefined })).kind).toBe(
      'none',
    )
  })

  it('tiktok → the TikTok MP4 proxy, regardless of recorded contentType', () => {
    const result = resolvePlaybackSource(
      item({ platform: 'tiktok', author: 'bob', bookmarkId: '7', contentType: undefined }),
    )
    expect(result.kind).toBe('video')
    expect(result.src).toBe('/api/media/tiktok/video?username=bob&id=7')
  })

  it('instagram → poster only here (StageInstagram owns the probe-gated <video>), never the Twitter proxy', () => {
    const result = resolvePlaybackSource(
      item({ platform: 'instagram', bookmarkId: 'DXVsqQ7CSXw', contentType: 'video' }),
    )
    expect(result.kind).toBe('poster')
    // No MP4 src is resolved at all — in particular, never the Twitter proxy.
    expect(result.src).toBe(null)
  })

  it('youtube → poster only (no MP4 exists; official iframe only)', () => {
    const result = resolvePlaybackSource(
      item({ platform: 'youtube', bookmarkId: 'Y9aytLYBajw', contentType: 'video' }),
    )
    expect(result).toEqual({
      kind: 'poster',
      src: null,
      poster: 'https://pbs.twimg.com/thumb.jpg',
    })
  })

  it('unknown platforms/types → none, but poster still carries the thumbnail', () => {
    const result = resolvePlaybackSource(
      item({ platform: 'twitter', contentType: 'article', thumbnailUrl: 'https://x/img.jpg' }),
    )
    expect(result).toEqual({ kind: 'none', src: null, poster: 'https://x/img.jpg' })
  })

  it('poster falls back to null when there is no thumbnail', () => {
    const result = resolvePlaybackSource(item({ thumbnailUrl: undefined, contentType: 'text' }))
    expect(result.poster).toBe(null)
  })
})

describe('instagramWarmSrc', () => {
  it('resolves the mirror proxy URL for an instagram item', () => {
    expect(
      instagramWarmSrc(
        item({ platform: 'instagram', contentType: 'video', bookmarkId: 'DXVsqQ7CSXw' }),
      ),
    ).toBe('/api/media/instagram/video?id=DXVsqQ7CSXw')
  })

  it('does not warm the Reel video mirror for an Instagram image post', () => {
    expect(
      instagramWarmSrc(
        item({ platform: 'instagram', contentType: 'photo', bookmarkId: 'DcHXej3lt5W' }),
      ),
    ).toBeNull()
  })

  it('returns null for non-instagram platforms', () => {
    expect(instagramWarmSrc(item({ platform: 'twitter', bookmarkId: '123' }))).toBe(null)
    expect(instagramWarmSrc(item({ platform: 'tiktok', bookmarkId: '123' }))).toBe(null)
    expect(instagramWarmSrc(item({ platform: 'youtube', bookmarkId: '123' }))).toBe(null)
  })

  it('returns null when there is no source id, or no item at all', () => {
    expect(instagramWarmSrc(item({ platform: 'instagram', bookmarkId: undefined }))).toBe(null)
    expect(instagramWarmSrc(item({ platform: 'instagram', bookmarkId: '' }))).toBe(null)
    expect(instagramWarmSrc(null)).toBe(null)
  })
})
