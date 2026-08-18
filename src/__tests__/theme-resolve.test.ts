import { describe, it, expect } from 'vitest'
import { resolveInitialTheme } from '@/lib/theme/context'

/**
 * resolveInitialTheme() Tests
 *
 * Pure resolution logic for the very first paint (theater-first.md §7):
 * an unset preference defaults to dark on the theater route ('/'), and to
 * the device preference everywhere else. Any explicit stored value ('light'
 * | 'dark' | 'system') behaves exactly as it did before the theater route
 * existed. This must stay in lockstep with the inline FOUC script in
 * src/app/layout.tsx.
 */
describe('resolveInitialTheme', () => {
  it('defaults to dark on the theater route when unset', () => {
    expect(resolveInitialTheme(null, '/', false)).toBe('dark')
    expect(resolveInitialTheme(undefined, '/', false)).toBe('dark')
    expect(resolveInitialTheme(null, '/', true)).toBe('dark')
  })

  it('follows the device preference on other routes when unset', () => {
    expect(resolveInitialTheme(null, '/settings', false)).toBe('light')
    expect(resolveInitialTheme(null, '/settings', true)).toBe('dark')
    expect(resolveInitialTheme(undefined, '/trending', true)).toBe('dark')
  })

  it('explicit stored "system" always follows the device, even on the theater route', () => {
    expect(resolveInitialTheme('system', '/', false)).toBe('light')
    expect(resolveInitialTheme('system', '/', true)).toBe('dark')
    expect(resolveInitialTheme('system', '/settings', true)).toBe('dark')
  })

  it('explicit stored "light" or "dark" wins everywhere, regardless of route or device', () => {
    expect(resolveInitialTheme('light', '/', true)).toBe('light')
    expect(resolveInitialTheme('dark', '/', false)).toBe('dark')
    expect(resolveInitialTheme('light', '/settings', true)).toBe('light')
    expect(resolveInitialTheme('dark', '/settings', false)).toBe('dark')
  })
})
