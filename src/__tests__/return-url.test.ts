import { describe, it, expect } from 'vitest'
import { isSafeReturnUrl } from '@/lib/auth/return-url'

describe('isSafeReturnUrl', () => {
  it('allows same-origin relative paths', () => {
    expect(isSafeReturnUrl('/feed')).toBe(true)
    expect(isSafeReturnUrl('/user/status/123')).toBe(true)
  })

  it('rejects protocol-relative URLs (//evil.com)', () => {
    expect(isSafeReturnUrl('//evil.com')).toBe(false)
  })

  it('rejects backslash-prefixed URLs (/\\evil.com)', () => {
    expect(isSafeReturnUrl('/\\evil.com')).toBe(false)
  })

  it('rejects absolute URLs', () => {
    expect(isSafeReturnUrl('https://evil.com')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isSafeReturnUrl('')).toBe(false)
  })

  it('rejects null/undefined', () => {
    expect(isSafeReturnUrl(null)).toBe(false)
    expect(isSafeReturnUrl(undefined)).toBe(false)
  })
})
