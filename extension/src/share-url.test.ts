import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_ORIGIN,
  firstSupportedShareUrl,
  isSupportedShareUrl,
  shareTargetUrl,
} from './share-url'

describe('isSupportedShareUrl', () => {
  it('accepts the platforms the share page already routes', () => {
    expect(isSupportedShareUrl('https://x.com/naval/status/1002103360646823936')).toBe(true)
    expect(isSupportedShareUrl('https://www.instagram.com/reels/DXVsqQ7CSXw')).toBe(true)
    expect(
      isSupportedShareUrl('https://www.tiktok.com/@sophieraiin/video/7619017281691045134'),
    ).toBe(true)
    expect(isSupportedShareUrl('https://vm.tiktok.com/ZMABcd123')).toBe(true)
  })

  it('accepts YouTube (Shorts, watch, youtu.be)', () => {
    expect(isSupportedShareUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(true)
    expect(isSupportedShareUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
    expect(isSupportedShareUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
  })

  it('accepts the other link networks ADHX keeps', () => {
    for (const url of [
      'https://www.facebook.com/reel/1234567890',
      'https://www.reddit.com/r/pics/comments/abc123/title/',
      'https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/',
      'https://vimeo.com/76979871',
      'https://soundcloud.com/artist/track-name',
      'https://www.pinterest.com/pin/123456789012/',
      'https://pin.it/abc123',
      'https://clips.twitch.tv/SomeClipSlug',
      'https://www.threads.net/@zuck/post/C1a2B3c4D5e',
      'https://imgur.com/a/AbCdE12',
      'https://bsky.app/profile/jay.bsky.team/post/3kabc123def45',
    ]) {
      expect(isSupportedShareUrl(url), url).toBe(true)
    }
  })

  it('accepts a host with no protocol (typed / copied path)', () => {
    expect(isSupportedShareUrl('x.com/jack/status/20')).toBe(true)
  })

  it('rejects unrelated pages so a toolbar click does not leave the tab', () => {
    expect(isSupportedShareUrl('https://x.com/home')).toBe(false)
    expect(isSupportedShareUrl('https://www.youtube.com/')).toBe(false)
    expect(isSupportedShareUrl('https://adhx.com/trending')).toBe(false)
    expect(isSupportedShareUrl('javascript:alert(1)')).toBe(false)
  })
})

describe('firstSupportedShareUrl', () => {
  it('prefers a link URL over the page URL', () => {
    expect(
      firstSupportedShareUrl(
        'https://x.com/jack/status/20',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      ),
    ).toBe('https://x.com/jack/status/20')
  })

  it('pulls an embedded URL out of selected caption text', () => {
    expect(firstSupportedShareUrl('check this out https://vm.tiktok.com/ZMABcd123/ wow')).toBe(
      'https://vm.tiktok.com/ZMABcd123/',
    )
  })

  it('returns null when nothing is a post link', () => {
    expect(firstSupportedShareUrl('https://x.com/home', 'not a link')).toBeNull()
  })
})

describe('shareTargetUrl', () => {
  it('builds the same /share?url= target the iOS shortcut and PWA use', () => {
    expect(shareTargetUrl('https://x.com/jack/status/20')).toBe(
      `${DEFAULT_APP_ORIGIN}/share?url=${encodeURIComponent('https://x.com/jack/status/20')}`,
    )
    expect(shareTargetUrl('https://x.com/jack/status/20', 'http://localhost:3001/')).toBe(
      'http://localhost:3001/share?url=https%3A%2F%2Fx.com%2Fjack%2Fstatus%2F20',
    )
  })
})
