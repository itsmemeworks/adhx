import { describe, it, expect, afterEach, vi } from 'vitest'
import { envNextUiDefault, parseFlagValue, resolveNextUi } from '@/lib/next-ui/flag'

const cookieJar = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
  }),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  cookieJar.clear()
})

describe('parseFlagValue', () => {
  it.each([
    ['1', true],
    ['true', true],
    [' ON ', true],
    ['yes', true],
    ['0', false],
    ['false', false],
    ['off', false],
    ['no', false],
  ])('%j → %s', (raw, expected) => {
    expect(parseFlagValue(raw)).toBe(expected)
  })

  it.each([null, undefined, '', 'maybe', '2'])('%j → null', (raw) => {
    expect(parseFlagValue(raw)).toBeNull()
  })
})

describe('resolveNextUi', () => {
  it('is on by default since the cutover', () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_UI', '')
    expect(envNextUiDefault()).toBe(true)
    expect(resolveNextUi()).toBe(true)
  })

  it('can still be turned off for a build', () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_UI', '0')
    expect(resolveNextUi()).toBe(false)
    expect(resolveNextUi({ stored: '1' })).toBe(true)
  })

  it('follows NEXT_PUBLIC_NEXT_UI when nothing overrides it', () => {
    vi.stubEnv('NEXT_PUBLIC_NEXT_UI', '1')
    expect(resolveNextUi()).toBe(true)
    expect(resolveNextUi({ query: 'junk', stored: null })).toBe(true)
  })

  it('lets the stored override beat env, and the URL beat both', () => {
    expect(resolveNextUi({ env: '0', stored: '1' })).toBe(true)
    expect(resolveNextUi({ env: '1', stored: '0' })).toBe(false)
    expect(resolveNextUi({ env: '0', stored: '0', query: '1' })).toBe(true)
    expect(resolveNextUi({ env: '1', stored: '1', query: '0' })).toBe(false)
  })

  it('ignores unrecognised values at each level', () => {
    expect(resolveNextUi({ env: '1', stored: 'x', query: 'y' })).toBe(true)
    expect(resolveNextUi({ env: 'garbage' })).toBe(true)
  })
})

describe('isNextUiEnabled (server)', () => {
  it('reads the query, then the cookie mirror, then env', async () => {
    const { isNextUiEnabled } = await import('@/lib/next-ui/server')
    vi.stubEnv('NEXT_PUBLIC_NEXT_UI', '0')
    expect(await isNextUiEnabled()).toBe(false)

    cookieJar.set('adhx_next_ui', '1')
    expect(await isNextUiEnabled()).toBe(true)
    expect(await isNextUiEnabled({ next_ui: '0' })).toBe(false)
    expect(await isNextUiEnabled(new URLSearchParams('next_ui=0'))).toBe(false)
    expect(await isNextUiEnabled({ next_ui: ['1', '0'] })).toBe(true)
  })

  it('obeys NEXT_UI_FORCE over every per-browser choice', async () => {
    const { isNextUiEnabled } = await import('@/lib/next-ui/server')
    cookieJar.set('adhx_next_ui', '1')
    vi.stubEnv('NEXT_UI_FORCE', 'off')
    expect(await isNextUiEnabled({ next_ui: '1' })).toBe(false)
    vi.stubEnv('NEXT_UI_FORCE', 'on')
    cookieJar.set('adhx_next_ui', '0')
    expect(await isNextUiEnabled({ next_ui: '0' })).toBe(true)
  })
})
