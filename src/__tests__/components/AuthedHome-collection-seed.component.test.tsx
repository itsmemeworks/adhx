/**
 * @vitest-environment jsdom
 *
 * The library grid no longer mounts a personal TheaterShell overlay. Leftover
 * deep links (`?collection=1`, `?triage=1`, `open-theater`) navigate to the
 * one personal theater at `/collection`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState, useEffect } from 'react'
import { render, waitFor } from '@testing-library/react'
import FeedPage from '@/app/AuthedHome'

let currentQuery = 'filter=photos&platform=instagram&tag=work&search=hello'
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
  usePathname: () => '/library',
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
vi.mock('@/components/theater/TheaterShell', () => ({
  TheaterShell: () => <div data-testid="theater-shell" />,
}))

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
}

let feedRequests: string[] = []

beforeEach(() => {
  currentQuery = 'filter=photos&platform=instagram&tag=work&search=hello'
  currentParamsObj = new URLSearchParams(currentQuery)
  urlListeners.clear()
  pushSpy.mockClear()
  replaceSpy.mockClear()
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

describe('AuthedHome leaves the personal theater to /collection', () => {
  it('navigates to /collection on leftover open-theater, and never mounts an overlay', async () => {
    const { queryByTestId } = render(<FeedPage />)

    await waitFor(() => expect(feedRequests.length).toBeGreaterThan(0))
    window.dispatchEvent(new CustomEvent('open-theater', { detail: { tab: 'personal' } }))

    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/collection'))
    expect(queryByTestId('theater-shell')).not.toBeInTheDocument()
  })
})

describe('AuthedHome collection deep link', () => {
  async function navigatesToCollection(query: string): Promise<boolean> {
    currentQuery = query
    currentParamsObj = new URLSearchParams(query)
    feedRequests = []
    replaceSpy.mockClear()
    const { unmount, queryByTestId } = render(<FeedPage />)
    try {
      await waitFor(() => expect(feedRequests.length).toBeGreaterThan(0))
      const hit = replaceSpy.mock.calls.some(([url]) => String(url).startsWith('/collection'))
      expect(queryByTestId('theater-shell')).not.toBeInTheDocument()
      return hit
    } finally {
      unmount()
    }
  }

  it('sends ?collection=1 to /collection', async () => {
    expect(await navigatesToCollection('collection=1')).toBe(true)
  })

  it('still sends the superseded ?triage=1 to /collection', async () => {
    expect(await navigatesToCollection('triage=1')).toBe(true)
  })

  it('does not navigate without either param', async () => {
    expect(await navigatesToCollection('filter=all')).toBe(false)
  })
})
