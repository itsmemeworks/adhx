import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { libraryToSearch, savedToPlay, startHref, TAGS_TO_CHANNELS } from '@/lib/next-ui/routes'
import { isSafeReturnUrl } from '@/lib/auth/return-url'
import { GET as switchLook } from '@/app/api/next-ui/route'

describe('old entry points → new screens', () => {
  it('maps Saved deep links onto the theater', () => {
    expect(savedToPlay()).toBe('/play?recent=1')
    expect(savedToPlay('123', 'instagram')).toBe('/play?recent=1&start=instagram%3A123')
    expect(savedToPlay('123', 'all')).toBe('/play?recent=1&start=twitter%3A123')
    expect(savedToPlay('../x', 'twitter')).toBe('/play?recent=1')
  })

  it('maps library search and tags', () => {
    expect(libraryToSearch(' frogs ')).toBe('/search?q=frogs')
    expect(libraryToSearch(undefined)).toBe('/search')
    expect(TAGS_TO_CHANNELS).toBe('/channels')
  })
})

describe('sign-in keeps where you were', () => {
  it('returns to the same search, not a bare /search', () => {
    const href = startHref('/search', { q: 'frog', scope: 'everyone', next_ui: '1', x: ['a'] })
    const returnTo = new URL(href, 'https://adhx.test').searchParams.get('returnTo')
    expect(returnTo).toBe('/search?q=frog&scope=everyone')
    expect(isSafeReturnUrl(returnTo)).toBe(true)
    expect(startHref('/channels')).toBe('/start?returnTo=%2Fchannels')
  })
})

describe('GET /api/next-ui', () => {
  const call = (query: string) =>
    switchLook(new NextRequest(`http://localhost/api/next-ui?${query}`))

  it('remembers an opt-out with a cookie and goes where asked', () => {
    const res = call('value=0&to=%2Ftags')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('/tags')
    expect(res.headers.get('set-cookie')).toMatch(/adhx_next_ui=0/)
  })

  it('never redirects off-site, and clears the choice without a value', () => {
    expect(call('value=1&to=https%3A%2F%2Fevil.example').headers.get('location')).toBe('/')
    expect(call('').headers.get('set-cookie')).toMatch(/adhx_next_ui=;/)
  })
})
