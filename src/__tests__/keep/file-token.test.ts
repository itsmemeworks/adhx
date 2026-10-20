import { describe, expect, it, vi } from 'vitest'
import type { FeedItemResponse } from '@/lib/feed/build-item'
import type { SearchItem } from '@/lib/semantic/items'

vi.mock('@/lib/db', () => ({ db: {}, runInTransaction: (fn: () => unknown) => fn() }))

const { fileToken, validFileToken, withFileToken } = await import('@/lib/keep/file-access')
const { toPhonePost } = await import('@/lib/app/phone-post')

function item(isPrivate: boolean): SearchItem {
  const post = {
    platform: 'youtube',
    id: 'abc',
    author: 'alice',
    authorName: 'Alice',
    authorProfileImageUrl: null,
    text: '',
    createdAt: null,
    processedAt: '2026-10-20T00:00:00.000Z',
    category: 'video',
    tweetUrl: null,
    media: [
      {
        mediaType: 'video',
        url: '/api/files/youtube/abc/video-1',
        thumbnailUrl: '/api/files/youtube/abc/poster',
        width: 1,
        height: 1,
        durationMs: 1,
      },
    ],
    articlePreview: null,
    savers: [],
    isPrivate,
  } as unknown as FeedItemResponse
  return { post, saved: true, matched: [], strength: 'good' }
}

describe('file tokens for Just for me posts', () => {
  it('signs one post, never another', () => {
    const token = fileToken('youtube', 'abc')
    expect(token).toHaveLength(32)
    expect(validFileToken('youtube', 'abc', token)).toBe(true)
    expect(validFileToken('youtube', 'abd', token)).toBe(false)
    expect(validFileToken('youtube', 'abc', null)).toBe(false)
    expect(validFileToken('youtube', 'abc', 'x'.repeat(32))).toBe(false)
  })

  it('only adds the token to that post’s own /api/files URLs', () => {
    const k = fileToken('youtube', 'abc')
    expect(withFileToken('/api/files/youtube/abc/video-1', 'youtube', 'abc')).toBe(
      `/api/files/youtube/abc/video-1?k=${k}`,
    )
    expect(withFileToken('/api/files/twitter/abc/photo-1?a=alice', 'twitter', 'abc')).toBe(
      `/api/files/twitter/abc/photo-1?a=alice&k=${fileToken('twitter', 'abc')}`,
    )
    expect(withFileToken('https://i.ytimg.com/x.jpg', 'youtube', 'abc')).toBe(
      'https://i.ytimg.com/x.jpg',
    )
    expect(withFileToken('/api/files/youtube/other/video-1', 'youtube', 'abc')).toBe(
      '/api/files/youtube/other/video-1',
    )
  })

  it('gives the phone tokened URLs for the viewer’s own Just for me save only', () => {
    const k = fileToken('youtube', 'abc')
    const mine = toPhonePost(item(true), false)
    expect(mine.media[0].url).toBe(`/api/files/youtube/abc/video-1?k=${k}`)
    expect(mine.media[0].posterUrl).toBe(`/api/files/youtube/abc/poster?k=${k}`)
    const shared = toPhonePost(item(false), false)
    expect(shared.media[0].url).toBe('/api/files/youtube/abc/video-1')
    expect(shared.media[0].posterUrl).toBe('/api/files/youtube/abc/poster')
  })
})
