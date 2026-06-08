import { describe, it, expect } from 'vitest'
import {
  INSTAGRAM_MIRRORS,
  instagramVideoUrls,
  isAllowedInstagramMirrorUrl,
} from '@/lib/media/mirrors'

/**
 * The pluggable video-mirror registry: how Instagram Reels resolve to a
 * streamable MP4, and the SSRF allowlist that gates the proxy.
 */

describe('Instagram mirror registry', () => {
  it('builds an ordered candidate URL per configured mirror', () => {
    const urls = instagramVideoUrls('DYP6_iUlDzp')
    expect(urls.length).toBe(INSTAGRAM_MIRRORS.length)
    // vxinstagram (the current primary) → /offload/{id}/0.mp4
    expect(urls[0]).toBe('https://www.vxinstagram.com/offload/DYP6_iUlDzp/0.mp4')
  })

  it('url-encodes the reel id', () => {
    expect(instagramVideoUrls('a/b?c')[0]).toContain('offload/a%2Fb%3Fc/0.mp4')
  })

  it('SSRF allowlist accepts mirror hosts + their CDN, https only', () => {
    expect(isAllowedInstagramMirrorUrl('https://www.vxinstagram.com/offload/x/0.mp4')).toBe(true)
    expect(isAllowedInstagramMirrorUrl('https://d.rapidcdn.app/v2?token=abc')).toBe(true)
  })

  it('SSRF allowlist rejects other hosts, http, and suffix spoofs', () => {
    expect(isAllowedInstagramMirrorUrl('http://www.vxinstagram.com/x')).toBe(false) // not https
    expect(isAllowedInstagramMirrorUrl('https://evil.com/x')).toBe(false)
    expect(isAllowedInstagramMirrorUrl('https://vxinstagram.com.evil.com/x')).toBe(false)
    expect(isAllowedInstagramMirrorUrl('not a url')).toBe(false)
  })
})
