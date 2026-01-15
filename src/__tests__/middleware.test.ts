import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'

/**
 * Middleware Tests: URL Normalization
 *
 * Tests that pasted Twitter/X URLs are properly redirected to clean format.
 */

function createRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, 'https://adhx.com'))
}

describe('Middleware: URL Normalization', () => {
  describe('Pasted Twitter/X URLs', () => {
    it('redirects https://x.com URLs to clean format', () => {
      const request = createRequest('/https://x.com/testuser/status/123456789')
      const response = middleware(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/testuser/status/123456789'
      )
    })

    it('redirects https://twitter.com URLs to clean format', () => {
      const request = createRequest(
        '/https://twitter.com/anotheruser/status/987654321'
      )
      const response = middleware(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/anotheruser/status/987654321'
      )
    })

    it('redirects http:// URLs (without https)', () => {
      const request = createRequest('/http://x.com/user123/status/111222333')
      const response = middleware(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/user123/status/111222333'
      )
    })

    it('redirects x.com URLs without protocol', () => {
      const request = createRequest('/x.com/noprotocol/status/444555666')
      const response = middleware(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/noprotocol/status/444555666'
      )
    })

    it('redirects twitter.com URLs without protocol', () => {
      const request = createRequest('/twitter.com/oldschool/status/777888999')
      const response = middleware(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/oldschool/status/777888999'
      )
    })

    it('preserves query parameters during redirect', () => {
      const request = createRequest(
        '/https://x.com/testuser/status/123?ref=share'
      )
      const response = middleware(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/testuser/status/123?ref=share'
      )
    })

    it('handles case-insensitive domain matching', () => {
      const request = createRequest('/https://X.COM/MixedCase/status/123')
      const response = middleware(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/MixedCase/status/123'
      )
    })
  })

  describe('Clean URLs (no redirect needed)', () => {
    it('passes through clean username/status/id URLs', () => {
      const request = createRequest('/testuser/status/123456789')
      const response = middleware(request)

      // NextResponse.next() returns a response without redirect
      expect(response.headers.get('location')).toBeNull()
    })

    it('passes through API routes', () => {
      const request = createRequest('/api/feed')
      const response = middleware(request)

      expect(response.headers.get('location')).toBeNull()
    })

    it('passes through root path', () => {
      const request = createRequest('/')
      const response = middleware(request)

      expect(response.headers.get('location')).toBeNull()
    })
  })

  describe('Edge cases', () => {
    it('handles usernames with underscores', () => {
      const request = createRequest(
        '/https://x.com/user_name_123/status/999888777'
      )
      const response = middleware(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/user_name_123/status/999888777'
      )
    })

    it('handles maximum length usernames (15 chars)', () => {
      const request = createRequest(
        '/https://x.com/abcdefghijklmno/status/123'
      )
      const response = middleware(request)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/abcdefghijklmno/status/123'
      )
    })

    it('does not redirect URLs with extra path segments', () => {
      // URLs with stuff after the tweet ID should still work
      const request = createRequest(
        '/https://x.com/user/status/123/photo/1'
      )
      const response = middleware(request)

      // Should still redirect to the base tweet URL
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        'https://adhx.com/user/status/123'
      )
    })
  })
})
