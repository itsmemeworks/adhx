import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '../proxy'

/**
 * Proxy Tests: URL Normalization
 *
 * Tests that pasted Twitter/X URLs are properly redirected to clean format.
 *
 * IMPORTANT: Browsers normalize // to / in URL paths. When a user visits:
 *   adhx.com/https://x.com/user/status/123
 * The actual path the server receives is:
 *   /https:/x.com/user/status/123  (single slash after colon)
 *
 * Tests use the normalized paths that proxy actually receives.
 */

function createRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, 'https://adhx.com'))
}

describe('Proxy: URL Normalization', () => {
  describe('Pasted Twitter/X URLs', () => {
    // Note: Tests use single slash after protocol (https:/x.com) because
    // browsers normalize // to / in URL paths before the server receives them

    it('redirects https:/x.com URLs to clean format (browser-normalized path)', () => {
      // Browser normalizes https://x.com to https:/x.com in the path
      const request = createRequest('/https:/x.com/testuser/status/123456789')
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/testuser/status/123456789'
      )
    })

    it('redirects https:/twitter.com URLs to clean format', () => {
      const request = createRequest(
        '/https:/twitter.com/anotheruser/status/987654321'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/anotheruser/status/987654321'
      )
    })

    it('redirects http:/ URLs (without https)', () => {
      const request = createRequest('/http:/x.com/user123/status/111222333')
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/user123/status/111222333'
      )
    })

    it('redirects x.com URLs without protocol', () => {
      const request = createRequest('/x.com/noprotocol/status/444555666')
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/noprotocol/status/444555666'
      )
    })

    it('redirects twitter.com URLs without protocol', () => {
      const request = createRequest('/twitter.com/oldschool/status/777888999')
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/oldschool/status/777888999'
      )
    })

    it('preserves query parameters during redirect', () => {
      const request = createRequest(
        '/https:/x.com/testuser/status/123?ref=share'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/testuser/status/123?ref=share'
      )
    })

    it('handles case-insensitive domain matching', () => {
      const request = createRequest('/https:/X.COM/MixedCase/status/123')
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/MixedCase/status/123'
      )
    })
  })

  describe('Clean URLs (no redirect needed)', () => {
    it('passes through clean username/status/id URLs', () => {
      const request = createRequest('/testuser/status/123456789')
      const response = proxy(request)

      // NextResponse.next() returns a response without redirect
      expect(response.headers.get('location')).toBeNull()
    })

    it('passes through API routes', () => {
      const request = createRequest('/api/feed')
      const response = proxy(request)

      expect(response.headers.get('location')).toBeNull()
    })

    it('passes through root path', () => {
      const request = createRequest('/')
      const response = proxy(request)

      expect(response.headers.get('location')).toBeNull()
    })
  })

  describe('Edge cases', () => {
    it('handles usernames with underscores', () => {
      const request = createRequest(
        '/https:/x.com/user_name_123/status/999888777'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/user_name_123/status/999888777'
      )
    })

    it('handles maximum length usernames (15 chars)', () => {
      const request = createRequest(
        '/https:/x.com/abcdefghijklmno/status/123'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/abcdefghijklmno/status/123'
      )
    })

    it('does not redirect URLs with extra path segments', () => {
      // URLs with stuff after the tweet ID should still work
      const request = createRequest(
        '/https:/x.com/user/status/123/photo/1'
      )
      const response = proxy(request)

      // Should still redirect to the base tweet URL
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/user/status/123'
      )
    })
  })

  /**
   * Regression tests for real-world URLs that users paste.
   * These are exact examples that were found to fail in production.
   *
   * CRITICAL: Browsers normalize // to / in URL paths!
   * When user visits: adhx.com/https://x.com/user/status/123
   * Server receives:  /https:/x.com/user/status/123  (single slash)
   */
  describe('Real-world URL regression tests', () => {
    it('handles full x.com URL with query params (s=20 share param)', () => {
      // Real URL user pastes: localhost:3000/https://x.com/crypto_iso/status/2011807169427988497?s=20
      // What server actually receives (browser normalizes // to /):
      const request = createRequest(
        '/https:/x.com/crypto_iso/status/2011807169427988497?s=20'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/crypto_iso/status/2011807169427988497?s=20'
      )
    })

    it('handles x.com URL with long tweet ID (19 digits)', () => {
      // Twitter snowflake IDs are typically 18-19 digits
      const request = createRequest(
        '/https:/x.com/someuser/status/1234567890123456789'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/someuser/status/1234567890123456789'
      )
    })

    it('handles twitter.com URL copied from mobile app', () => {
      // Mobile Twitter app often copies with twitter.com domain
      const request = createRequest(
        '/https:/twitter.com/elonmusk/status/1234567890123456789?t=abc123'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/elonmusk/status/1234567890123456789?t=abc123'
      )
    })

    it('handles URL without protocol (user types x.com directly)', () => {
      // User might manually type adhx.com/x.com/...
      const request = createRequest('/x.com/user/status/123456789')
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/user/status/123456789'
      )
    })

    it('handles URL with multiple query params', () => {
      const request = createRequest(
        '/https:/x.com/user/status/123?s=20&t=abc&ref=copy'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/user/status/123?s=20&t=abc&ref=copy'
      )
    })
  })

  describe('Pasted TikTok URLs', () => {
    it('redirects https:/www.tiktok.com/@user/video/{id} to /@user/video/{id}', () => {
      const request = createRequest(
        '/https:/www.tiktok.com/@sophieraiin/video/7619017281691045134',
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/@sophieraiin/video/7619017281691045134',
      )
    })

    it('redirects URLs without protocol', () => {
      const request = createRequest('/tiktok.com/@user/video/7619017281691045134')
      const response = proxy(request)
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/@user/video/7619017281691045134',
      )
    })

    it('redirects vm. and m. subdomain URLs', () => {
      for (const sub of ['vm.', 'm.']) {
        const request = createRequest(`/https:/${sub}tiktok.com/@user/video/7619017281691045134`)
        const response = proxy(request)
        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe(
          'https://adhx.com/@user/video/7619017281691045134',
        )
      }
    })

    it('preserves query parameters', () => {
      const request = createRequest(
        '/https:/www.tiktok.com/@user/video/7619017281691045134?lang=en',
      )
      const response = proxy(request)
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/@user/video/7619017281691045134?lang=en',
      )
    })

    it('passes through the clean /@user/video/{id} path (no loop)', () => {
      const request = createRequest('/@sophieraiin/video/7619017281691045134')
      const response = proxy(request)
      expect(response.headers.get('location')).toBeNull()
    })
  })

  describe('Pasted TikTok short links', () => {
    it('hands a vm.tiktok.com short link to the resolver route', () => {
      const request = createRequest('/https:/vm.tiktok.com/ZNRvLPpVV/')
      const response = proxy(request)
      expect(response.status).toBe(307)
      const loc = new URL(response.headers.get('location')!)
      expect(loc.pathname).toBe('/api/tiktok/resolve')
      expect(loc.searchParams.get('go')).toBe('1')
      expect(loc.searchParams.get('url')).toBe('https://vm.tiktok.com/ZNRvLPpVV/')
    })

    it('handles vt.tiktok.com and /t/{code} short links', () => {
      for (const path of ['/vt.tiktok.com/ZSabc123/', '/https:/www.tiktok.com/t/ZNRvLPpVV']) {
        const response = proxy(createRequest(path))
        expect(response.status).toBe(307)
        expect(new URL(response.headers.get('location')!).pathname).toBe('/api/tiktok/resolve')
      }
    })
  })

  describe('Pasted Instagram URLs', () => {
    it('redirects https:/www.instagram.com/reels/{id} to /reels/{id}', () => {
      const request = createRequest(
        '/https:/www.instagram.com/reels/DXVsqQ7CSXw'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/reels/DXVsqQ7CSXw'
      )
    })

    it('redirects singular /reel/ URLs to plural /reels/', () => {
      const request = createRequest(
        '/https:/www.instagram.com/reel/DXVsqQ7CSXw'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/reels/DXVsqQ7CSXw'
      )
    })

    it('redirects /p/ (post) URLs to /reels/{id}', () => {
      const request = createRequest(
        '/https:/www.instagram.com/p/DXVsqQ7CSXw'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/reels/DXVsqQ7CSXw'
      )
    })

    it('redirects without protocol', () => {
      const request = createRequest('/instagram.com/reels/DXVsqQ7CSXw')
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/reels/DXVsqQ7CSXw'
      )
    })

    it('strips trailing path segments (e.g. /comments, /likes)', () => {
      const request = createRequest(
        '/https:/www.instagram.com/reels/DXVsqQ7CSXw/comments'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/reels/DXVsqQ7CSXw'
      )
    })

    it('preserves query parameters', () => {
      const request = createRequest(
        '/https:/www.instagram.com/reels/DXVsqQ7CSXw?igsh=abc123'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/reels/DXVsqQ7CSXw?igsh=abc123'
      )
    })

    it('is case-insensitive on the domain', () => {
      const request = createRequest(
        '/https:/WWW.Instagram.COM/Reels/DXVsqQ7CSXw'
      )
      const response = proxy(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/reels/DXVsqQ7CSXw'
      )
    })

    it('passes through the clean /reels/{id} path (no loop)', () => {
      const request = createRequest('/reels/DXVsqQ7CSXw')
      const response = proxy(request)

      expect(response.headers.get('location')).toBeNull()
    })
  })

  describe('Pasted YouTube URLs', () => {
    it('redirects https:/youtube.com/shorts/{id} to /shorts/{id}', () => {
      const response = proxy(createRequest('/https:/youtube.com/shorts/Y9aytLYBajw'))
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('https://adhx.com/shorts/Y9aytLYBajw')
    })

    it('handles www. and m. subdomains and a trailing ?si tracking param', () => {
      const response = proxy(createRequest('/https:/www.youtube.com/shorts/Y9aytLYBajw?si=Ns240PHC8T7l5ZZC'))
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('https://adhx.com/shorts/Y9aytLYBajw')
    })

    it('redirects youtu.be/{id} short links to /shorts/{id}', () => {
      const response = proxy(createRequest('/https:/youtu.be/Y9aytLYBajw'))
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('https://adhx.com/shorts/Y9aytLYBajw')
    })

    it('redirects watch?v={id} (id lives in the query string)', () => {
      const response = proxy(createRequest('/https:/www.youtube.com/watch?v=Y9aytLYBajw&feature=share'))
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('https://adhx.com/shorts/Y9aytLYBajw')
    })

    it('passes through the clean /shorts/{id} path (no loop)', () => {
      const response = proxy(createRequest('/shorts/Y9aytLYBajw'))
      expect(response.headers.get('location')).toBeNull()
    })
  })
})
