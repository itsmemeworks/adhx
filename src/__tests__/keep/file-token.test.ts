import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedItemResponse } from '@/lib/feed/build-item'
import type { SearchItem } from '@/lib/semantic/items'

vi.mock('@/lib/db', () => ({ db: {}, runInTransaction: (fn: () => unknown) => fn() }))

const { FILE_TOKEN_MS, fileToken, validFileToken, withFileGrant, withFileToken } =
  await import('@/lib/keep/file-access')
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
  const grant = { userId: 'owner', keyId: 'phone-key-1' }
  const at = Date.parse('2026-10-30T12:00:00.000Z')
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(at)
  })
  afterEach(() => vi.useRealTimers())

  it('names its phone key and a day’s expiry, and signs one post only', () => {
    const token = fileToken('youtube', 'abc', 'phone-key-1')
    const [expires, keyId, sig] = token.split('.')
    expect(keyId).toBe('phone-key-1')
    expect(Number.parseInt(expires, 36) * 1000).toBe(at + FILE_TOKEN_MS)
    expect(sig).toHaveLength(32)
    expect(fileToken('youtube', 'abd', 'phone-key-1')).not.toBe(token)
    expect(fileToken('youtube', 'abc', 'phone-key-2')).not.toBe(token)
  })

  it('refuses malformed and expired tokens before reading anything', () => {
    for (const bad of [null, '', 'x'.repeat(32), 'a.b', 'a.b.c.d', 'zz.bad key.sig']) {
      expect(validFileToken('youtube', 'abc', bad)).toBe(false)
    }
    const old = fileToken('youtube', 'abc', 'phone-key-1', at - 1000)
    expect(validFileToken('youtube', 'abc', old)).toBe(false)
    const tooLong = fileToken('youtube', 'abc', 'phone-key-1', at + 30 * FILE_TOKEN_MS)
    expect(validFileToken('youtube', 'abc', tooLong)).toBe(false)
  })

  it('adds a token only inside a phone request, and only to that post’s /api/files URLs', () => {
    expect(withFileToken('/api/files/youtube/abc/video-1', 'youtube', 'abc')).toBe(
      '/api/files/youtube/abc/video-1',
    )
    withFileGrant(grant, () => {
      const k = fileToken('youtube', 'abc', 'phone-key-1')
      expect(withFileToken('/api/files/youtube/abc/video-1', 'youtube', 'abc')).toBe(
        `/api/files/youtube/abc/video-1?k=${k}`,
      )
      expect(withFileToken('/api/files/twitter/abc/photo-1?a=alice', 'twitter', 'abc')).toBe(
        `/api/files/twitter/abc/photo-1?a=alice&k=${fileToken('twitter', 'abc', 'phone-key-1')}`,
      )
      expect(withFileToken('https://i.ytimg.com/x.jpg', 'youtube', 'abc')).toBe(
        'https://i.ytimg.com/x.jpg',
      )
      expect(withFileToken('/api/files/youtube/other/video-1', 'youtube', 'abc')).toBe(
        '/api/files/youtube/other/video-1',
      )
    })
  })

  it('gives the phone tokened URLs for the viewer’s own Just for me save only', () => {
    withFileGrant(grant, () => {
      const k = fileToken('youtube', 'abc', 'phone-key-1')
      const mine = toPhonePost(item(true), false)
      expect(mine.media[0].url).toBe(`/api/files/youtube/abc/video-1?k=${k}`)
      expect(mine.media[0].posterUrl).toBe(`/api/files/youtube/abc/poster?k=${k}`)
      const shared = toPhonePost(item(false), false)
      expect(shared.media[0].url).toBe('/api/files/youtube/abc/video-1')
      expect(shared.media[0].posterUrl).toBe('/api/files/youtube/abc/poster')
    })
  })
})
