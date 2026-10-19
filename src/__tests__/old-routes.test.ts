import { describe, it, expect } from 'vitest'
import { libraryToSearch, savedToPlay, startHref, TAGS_TO_CHANNELS } from '@/lib/next-ui/routes'
import { isSafeReturnUrl } from '@/lib/auth/return-url'

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
