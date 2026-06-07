import { describe, it, expect } from 'vitest'
import { detectPlatformPost, PLATFORM_PATTERNS } from '@/lib/platform/url'

/**
 * Platform URL Detection Tests
 *
 * `detectPlatformPost` is the single source of truth for recognising a
 * platform post/video link and building its on-ADHX preview path. These cases
 * mirror every edge case the prior call sites (parse-share-url, the bookmark
 * add route, the share target) handled, so behaviour stays identical.
 */

describe('detectPlatformPost — X / Twitter', () => {
  it('parses x.com and twitter.com', () => {
    expect(detectPlatformPost('https://x.com/elonmusk/status/1234567890')).toEqual({
      platform: 'twitter',
      id: '1234567890',
      author: 'elonmusk',
      previewPath: '/elonmusk/status/1234567890',
    })
    expect(detectPlatformPost('https://twitter.com/jack/status/9876543210')).toEqual({
      platform: 'twitter',
      id: '9876543210',
      author: 'jack',
      previewPath: '/jack/status/9876543210',
    })
  })

  it('handles no-protocol, www, query params, trailing segments, whitespace, case', () => {
    expect(detectPlatformPost('x.com/user/status/111')?.previewPath).toBe('/user/status/111')
    expect(detectPlatformPost('https://www.x.com/user/status/111')?.previewPath).toBe(
      '/user/status/111',
    )
    expect(detectPlatformPost('https://x.com/user/status/111?s=20&t=abc')?.previewPath).toBe(
      '/user/status/111',
    )
    expect(detectPlatformPost('https://x.com/user/status/111/photo/1')?.previewPath).toBe(
      '/user/status/111',
    )
    expect(detectPlatformPost('  https://x.com/my_user_name/status/111  ')?.previewPath).toBe(
      '/my_user_name/status/111',
    )
    expect(detectPlatformPost('https://X.COM/user/status/111')?.previewPath).toBe(
      '/user/status/111',
    )
  })

  it('rejects usernames over 15 chars and non-numeric ids', () => {
    // \w{1,15} caps the username; a 16-char handle won't match.
    expect(detectPlatformPost('https://x.com/abcdefghijklmnop/status/111')).toBeNull()
    expect(detectPlatformPost('https://x.com/user/status/abc')).toBeNull()
  })
})

describe('detectPlatformPost — Instagram', () => {
  it('maps reels / reel / p to /reels/{id}', () => {
    expect(detectPlatformPost('https://www.instagram.com/reels/DXVsqQ7CSXw')).toEqual({
      platform: 'instagram',
      id: 'DXVsqQ7CSXw',
      previewPath: '/reels/DXVsqQ7CSXw',
    })
    expect(detectPlatformPost('https://instagram.com/reel/DXVsqQ7CSXw/')?.previewPath).toBe(
      '/reels/DXVsqQ7CSXw',
    )
    expect(detectPlatformPost('https://instagram.com/p/DXVsqQ7CSXw/')?.previewPath).toBe(
      '/reels/DXVsqQ7CSXw',
    )
  })

  it('has no author for Instagram', () => {
    expect(detectPlatformPost('https://instagram.com/reels/DXVsqQ7CSXw')?.author).toBeUndefined()
  })
})

describe('detectPlatformPost — TikTok', () => {
  it('maps @user/video/{id} to /@user/video/{id}', () => {
    expect(
      detectPlatformPost('https://www.tiktok.com/@sophieraiin/video/7619017281691045134'),
    ).toEqual({
      platform: 'tiktok',
      id: '7619017281691045134',
      author: 'sophieraiin',
      previewPath: '/@sophieraiin/video/7619017281691045134',
    })
  })

  it('handles vm. and m. subdomains and dotted handles', () => {
    expect(detectPlatformPost('https://m.tiktok.com/@user.name/video/123456')?.previewPath).toBe(
      '/@user.name/video/123456',
    )
    expect(detectPlatformPost('vm.tiktok.com/@user/video/123456')?.platform).toBe('tiktok')
  })

  it('decodes a URL-encoded %40 handle', () => {
    expect(
      detectPlatformPost('https://www.tiktok.com/%40sophieraiin/video/7619017281691045134'),
    ).toEqual({
      platform: 'tiktok',
      id: '7619017281691045134',
      author: 'sophieraiin',
      previewPath: '/@sophieraiin/video/7619017281691045134',
    })
  })

  it('rejects video ids shorter than 6 digits', () => {
    expect(detectPlatformPost('https://www.tiktok.com/@user/video/12345')).toBeNull()
  })
})

describe('detectPlatformPost — YouTube', () => {
  it('maps shorts / youtu.be / watch / embed to /shorts/{id}', () => {
    expect(detectPlatformPost('https://youtube.com/shorts/Y9aytLYBajw?si=abc')).toEqual({
      platform: 'youtube',
      id: 'Y9aytLYBajw',
      previewPath: '/shorts/Y9aytLYBajw',
    })
    expect(detectPlatformPost('https://youtu.be/Y9aytLYBajw')?.previewPath).toBe(
      '/shorts/Y9aytLYBajw',
    )
    expect(
      detectPlatformPost('https://www.youtube.com/watch?v=Y9aytLYBajw&t=5s')?.previewPath,
    ).toBe('/shorts/Y9aytLYBajw')
    expect(detectPlatformPost('https://www.youtube.com/embed/Y9aytLYBajw')?.previewPath).toBe(
      '/shorts/Y9aytLYBajw',
    )
  })

  it('has no author for YouTube', () => {
    expect(detectPlatformPost('https://youtu.be/Y9aytLYBajw')?.author).toBeUndefined()
  })

  it('returns null for a YouTube host with no extractable id', () => {
    expect(detectPlatformPost('https://youtube.com/feed/subscriptions')).toBeNull()
  })
})

describe('detectPlatformPost — rejections', () => {
  it('returns null for unsupported / malformed URLs', () => {
    expect(detectPlatformPost('https://google.com')).toBeNull()
    expect(detectPlatformPost('https://x.com/user')).toBeNull()
    expect(detectPlatformPost('https://x.com/user/status/abc')).toBeNull()
    expect(detectPlatformPost('not a url at all')).toBeNull()
    expect(detectPlatformPost('')).toBeNull()
  })
})

describe('PLATFORM_PATTERNS', () => {
  it('exposes the canonical regexes', () => {
    expect(PLATFORM_PATTERNS.twitter.test('https://x.com/u/status/1')).toBe(true)
    expect(PLATFORM_PATTERNS.instagram.test('https://instagram.com/reel/abc')).toBe(true)
    expect(PLATFORM_PATTERNS.tiktok.test('https://www.tiktok.com/@u/video/123456')).toBe(true)
    expect(PLATFORM_PATTERNS.youtube.test('https://youtu.be/abc')).toBe(true)
  })
})
