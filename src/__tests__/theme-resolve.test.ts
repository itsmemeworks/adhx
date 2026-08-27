import { describe, it, expect } from 'vitest'
import { resolveInitialTheme } from '@/lib/theme/context'

/**
 * resolveInitialTheme() Tests
 *
 * Pure resolution logic for the very first paint (theater-first.md §7):
 * an unset preference defaults to dark on theater-dark routes — the home
 * theater ('/') and the dark ranked-list Browse view ('/trending' and its
 * '/trending/[filter]' hubs, added in Phase 3) — and to the device preference
 * everywhere else. Any explicit stored value ('light' | 'dark' | 'system')
 * behaves exactly as it did before any theater route existed. This must stay
 * in lockstep with the inline FOUC script in src/app/layout.tsx.
 */
describe('resolveInitialTheme', () => {
  it('defaults to dark on the home theater route when unset', () => {
    expect(resolveInitialTheme(null, '/', false)).toBe('dark')
    expect(resolveInitialTheme(undefined, '/', false)).toBe('dark')
    expect(resolveInitialTheme(null, '/', true)).toBe('dark')
    expect(resolveInitialTheme(null, '/live', false)).toBe('dark')
    expect(resolveInitialTheme(null, '/saved', true)).toBe('dark')
    expect(resolveInitialTheme(null, '/collection', true)).toBe('dark')
  })

  it('defaults to dark on /trending and its filter hubs when unset', () => {
    expect(resolveInitialTheme(null, '/trending', false)).toBe('dark')
    expect(resolveInitialTheme(undefined, '/trending', false)).toBe('dark')
    expect(resolveInitialTheme(null, '/trending/videos', false)).toBe('dark')
    expect(resolveInitialTheme(null, '/trending/photos', true)).toBe('dark')
    expect(resolveInitialTheme(undefined, '/trending/just-saved', false)).toBe('dark')
  })

  it('follows the device preference on other routes when unset', () => {
    expect(resolveInitialTheme(null, '/settings', false)).toBe('light')
    expect(resolveInitialTheme(null, '/settings', true)).toBe('dark')
    // A path that merely starts with "trending" (not the /trending route
    // itself) must NOT match — guards against a naive `.includes()` check.
    expect(resolveInitialTheme(null, '/trending-archive', false)).toBe('light')
  })

  it('defaults to dark on every preview-page shape when unset', () => {
    expect(resolveInitialTheme(null, '/someuser/status/123', false)).toBe('dark')
    expect(resolveInitialTheme(undefined, '/someuser/status/123', false)).toBe('dark')
    expect(resolveInitialTheme(null, '/reel/abc123', false)).toBe('dark')
    expect(resolveInitialTheme(null, '/reels/abc123', true)).toBe('dark')
    expect(resolveInitialTheme(null, '/p/DcHXej3lt5W', false)).toBe('dark')
    expect(resolveInitialTheme(null, '/shorts/dQw4w9WgXcQ', false)).toBe('dark')
    expect(resolveInitialTheme(null, '/@someuser/video/1234567890', false)).toBe('dark')
    expect(resolveInitialTheme(null, '/someuser/video/1234567890', true)).toBe('dark')
  })

  it('does not treat non-preview lookalikes as theater-dark routes', () => {
    expect(resolveInitialTheme(null, '/settings', false)).toBe('light')
    expect(resolveInitialTheme(null, '/t/someuser/sometag', false)).toBe('light')
    // Not enough path segments to be a status/video URL.
    expect(resolveInitialTheme(null, '/someuser/status', false)).toBe('light')
    // Shorts id must be exactly 11 chars.
    expect(resolveInitialTheme(null, '/shorts/tooshort', false)).toBe('light')
  })

  it('explicit stored "system" always follows the device, even on theater-dark routes', () => {
    expect(resolveInitialTheme('system', '/', false)).toBe('light')
    expect(resolveInitialTheme('system', '/', true)).toBe('dark')
    expect(resolveInitialTheme('system', '/trending', false)).toBe('light')
    expect(resolveInitialTheme('system', '/trending/videos', true)).toBe('dark')
    expect(resolveInitialTheme('system', '/settings', true)).toBe('dark')
  })

  it('explicit stored "light" or "dark" wins everywhere, regardless of route or device', () => {
    expect(resolveInitialTheme('light', '/', true)).toBe('light')
    expect(resolveInitialTheme('dark', '/', false)).toBe('dark')
    expect(resolveInitialTheme('light', '/trending', true)).toBe('light')
    expect(resolveInitialTheme('dark', '/trending/photos', false)).toBe('dark')
    expect(resolveInitialTheme('light', '/settings', true)).toBe('light')
    expect(resolveInitialTheme('dark', '/settings', false)).toBe('dark')
  })
})
