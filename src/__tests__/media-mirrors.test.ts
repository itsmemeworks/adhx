import { describe, it, expect } from 'vitest'
import {
  INSTAGRAM_MIRRORS,
  instagramVideoUrls,
  isAllowedInstagramMirrorUrl,
  isRetryableStatus,
  type VideoMirror,
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

/**
 * Retry policy. vxinstagram's cache is lazily populated, so the first request
 * for a Reel 404s for ~10-20s while its backend fetches the post and only then
 * starts serving the MP4. Treating that 404 as fatal (which this resolver did
 * until 2026-07-27) failed every first-ever request for a given Reel — these
 * tests pin the behaviour so it can't regress back.
 */
describe('mirror retry policy', () => {
  const mirror = INSTAGRAM_MIRRORS[0]

  it('retries the cold-cache 404 for a mirror that declares it', () => {
    expect(mirror.retryStatuses).toContain(404)
    expect(isRetryableStatus(404, mirror)).toBe(true)
  })

  it('always retries rate-limits and upstream 5xx', () => {
    expect(isRetryableStatus(429, mirror)).toBe(true)
    expect(isRetryableStatus(500, mirror)).toBe(true)
    expect(isRetryableStatus(503, mirror)).toBe(true)
  })

  it('does not retry statuses that will never improve', () => {
    for (const status of [400, 401, 403, 410, 451]) {
      expect(isRetryableStatus(status, mirror)).toBe(false)
    }
  })

  it('does not retry a 404 for a mirror that has not declared it retryable', () => {
    const strict: VideoMirror = { name: 'strict', videoUrl: () => 'https://x/y', hosts: ['x'] }
    expect(isRetryableStatus(404, strict)).toBe(false)
    expect(isRetryableStatus(500, strict)).toBe(true)
  })

  it('budgets enough backoff to outlast the measured cold fetch', () => {
    const attempts = mirror.attempts ?? 3
    const base = mirror.backoffMs ?? 400
    // Backoff is base * attemptNumber between attempts.
    let total = 0
    for (let i = 0; i < attempts - 1; i++) total += base * (i + 1)
    // The cold fetch was measured resolving at ~10-20s.
    expect(total).toBeGreaterThanOrEqual(20_000)
  })
})
