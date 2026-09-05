import { describe, it, expect } from 'vitest'
import { isSafeReturnUrl } from '@/lib/auth/return-url'

describe('isSafeReturnUrl', () => {
  it('allows same-origin relative paths', () => {
    expect(isSafeReturnUrl('/feed')).toBe(true)
    expect(isSafeReturnUrl('/user/status/123')).toBe(true)
    expect(isSafeReturnUrl('/saved?open=123#queue')).toBe(true)
    expect(isSafeReturnUrl('/search?q=https%3A%2F%2Fexample.com')).toBe(true)
  })

  it.each(['\t', '\n', '\r'])('rejects URL-normalized whitespace %j', (control) => {
    const value = `/${control}/evil.example`
    expect(new URL(value, 'https://adhx.com').origin).toBe('https://evil.example')
    expect(isSafeReturnUrl(value)).toBe(false)
    expect(isSafeReturnUrl(`/${control}\\evil.example`)).toBe(false)
  })

  it.each(['\0', '\u001f', '\u007f'])('rejects control characters %j', (control) => {
    expect(isSafeReturnUrl(`/saved${control}`)).toBe(false)
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
