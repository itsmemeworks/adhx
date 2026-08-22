import { describe, it, expect, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { isAllowedActivityOrigin } from '@/lib/activity/origin'

function req(url: string, origin?: string): NextRequest {
  const headers = new Headers()
  if (origin) headers.set('origin', origin)
  return new NextRequest(url, { method: 'POST', headers })
}

describe('isAllowedActivityOrigin', () => {
  const prev = process.env.NEXT_PUBLIC_APP_URL
  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = prev
  })

  it('allows a request with no Origin (curl / tests)', () => {
    expect(isAllowedActivityOrigin(req('http://localhost:3000/api/activity/share'))).toBe(true)
  })

  it('allows the request host and NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://adhx.com'
    expect(
      isAllowedActivityOrigin(req('https://adhx.com/api/activity/share', 'https://adhx.com')),
    ).toBe(true)
    expect(
      isAllowedActivityOrigin(
        req('http://localhost:3000/api/activity/share', 'http://localhost:3000'),
      ),
    ).toBe(true)
  })

  it('rejects a cross-site Origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://adhx.com'
    expect(
      isAllowedActivityOrigin(req('https://adhx.com/api/activity/share', 'https://evil.example')),
    ).toBe(false)
  })
})
