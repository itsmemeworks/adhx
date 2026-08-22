/**
 * @vitest-environment jsdom
 *
 * Regression test: the Header's "Live" nav item dispatches `open-theater`,
 * but that event only has a listener while AuthedHome (the feed page, `/`)
 * is mounted. From any other route (e.g. /tags), Header now navigates to
 * `/?live=1` instead — mirroring the existing `?collection=1` pattern used by
 * the Collection entry. This verifies AuthedHome actually honors that param:
 * it should open the theater on the "live" tab once authenticated, then
 * strip the param from the URL.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState, useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import FeedPage from '@/app/AuthedHome'

let currentQuery = 'live=1'
let currentParamsObj = new URLSearchParams(currentQuery)
const urlListeners = new Set<() => void>()

function setQuery(next: string) {
  if (next === currentQuery) return
  currentQuery = next
  currentParamsObj = new URLSearchParams(next)
  urlListeners.forEach((l) => l())
}

const pushSpy = vi.fn((url: string) => {
  const qIdx = url.indexOf('?')
  setQuery(qIdx === -1 ? '' : url.slice(qIdx + 1))
})
const replaceSpy = vi.fn((url: string) => {
  const qIdx = url.indexOf('?')
  setQuery(qIdx === -1 ? '' : url.slice(qIdx + 1))
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, replace: replaceSpy, prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => {
    const [, forceRender] = useState(0)
    useEffect(() => {
      const l = () => forceRender((n: number) => n + 1)
      urlListeners.add(l)
      return () => {
        urlListeners.delete(l)
      }
    }, [])
    return currentParamsObj
  },
}))

vi.mock('@/lib/theme/context', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
  useThemeOptional: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}))

vi.mock('@/components/feed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/feed')>()
  return {
    ...actual,
    FeedGrid: () => null,
    FilterBar: () => null,
  }
})
vi.mock('@/components/KeyboardShortcutsModal', () => ({ KeyboardShortcutsModal: () => null }))
vi.mock('@/components/LandingPage', () => ({ LandingPage: () => null }))
vi.mock('@/components/PasteToPreview', () => ({ PasteToPreview: () => null }))
vi.mock('@/components/sync/SyncProgress', () => ({ SyncProgress: () => null }))

// Capture the props TheaterShell is opened with, rather than rendering the
// real (heavy) theater.
const theaterShellSpy = vi.fn()
vi.mock('@/components/theater/TheaterShell', () => ({
  TheaterShell: (props: { initialPersonalTab?: string; mode: string }) => {
    theaterShellSpy(props)
    return <div data-testid="theater-shell" data-tab={props.initialPersonalTab} />
  },
}))

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
}

let feedRequests: string[] = []

beforeEach(() => {
  currentQuery = 'live=1'
  currentParamsObj = new URLSearchParams(currentQuery)
  urlListeners.clear()
  pushSpy.mockClear()
  replaceSpy.mockClear()
  theaterShellSpy.mockClear()
  feedRequests = []

  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()

    if (url.startsWith('/api/feed')) {
      feedRequests.push(url)
      return jsonResponse({
        items: [{ id: 't1', platform: 'twitter', isArchived: false }],
        stats: { total: 1, active: 1 },
        pagination: { page: 1, totalPages: 1 },
      })
    }
    if (url.startsWith('/api/auth/me')) {
      return jsonResponse({
        authenticated: true,
        user: { id: '1', username: 'tester', displayName: 'tester', avatarUrl: null },
        identities: { x: { username: 'tester' }, email: null },
        xConnected: true,
      })
    }
    if (url.startsWith('/api/tags')) return jsonResponse({ tags: [] })
    return jsonResponse({})
  }) as unknown as typeof fetch
})

describe('AuthedHome ?live=1 handling', () => {
  it('opens the theater on the "live" tab and strips the param from the URL', async () => {
    render(<FeedPage />)

    await waitFor(() => expect(screen.getByTestId('theater-shell')).toBeInTheDocument())
    expect(screen.getByTestId('theater-shell')).toHaveAttribute('data-tab', 'live')

    // The `live` param should have been stripped from the URL.
    await waitFor(() => expect(currentQuery).not.toContain('live=1'))
  })
})
