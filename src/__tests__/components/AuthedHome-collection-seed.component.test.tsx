/**
 * @vitest-environment jsdom
 *
 * Regression guard for the collection-seeding product decision reversal
 * (CLAUDE.md "Main Feed" / AuthedHome.tsx comment above `buildActiveQueueQuery`):
 * a previous iteration (#342) seeded the collection queue from the CURRENT
 * filter/platform/tag/search state, so opening collection while e.g. viewing
 * "photos only" or a specific tag only worked through that subset. The owner
 * reversed that — the collection theater is strictly the full active backlog, every time.
 * This verifies opening the theater's collection tab while the grid has a
 * non-default filter/platform/tag active still requests the FULL active
 * queue (hideArchived=true, filter=all, no platform/tag/search params).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState, useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
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

describe('AuthedHome collection seeding ignores active filters', () => {
  it('requests the full unread queue (hideArchived=true, filter=all) on open-theater, even with photos/instagram/tag/search active', async () => {
    render(<FeedPage />)

    // Let the initial (filtered) grid fetch happen first.
    await waitFor(() => expect(feedRequests.length).toBeGreaterThan(0))
    feedRequests = []

    window.dispatchEvent(new CustomEvent('open-theater', { detail: { tab: 'personal' } }))

    await waitFor(() => expect(screen.getByTestId('theater-shell')).toBeInTheDocument())
    await waitFor(() => expect(feedRequests.length).toBeGreaterThan(0))

    const collectionRequest = feedRequests[feedRequests.length - 1]
    expect(collectionRequest).toContain('hideArchived=true')
    expect(collectionRequest).toContain('filter=all')
    expect(collectionRequest).not.toContain('platform=')
    expect(collectionRequest).not.toContain('tag=')
    expect(collectionRequest).not.toContain('search=')
  })
})

/**
 * The deep link that opens the collection theater from another route. It was
 * `?triage=1` and is now `?collection=1`; the old name has to keep working
 * because it is in links people have already shared.
 *
 * This exists because the rename's own search-and-replace collapsed the two
 * checks into the SAME param — leaving `?triage=1` silently dead, with no
 * error, and nothing testing it. Caught in review, not by the suite.
 */
describe('AuthedHome collection deep link', () => {
  async function opensCollection(query: string): Promise<boolean> {
    currentQuery = query
    currentParamsObj = new URLSearchParams(query)
    feedRequests = []
    const { unmount } = render(<FeedPage />)
    try {
      await waitFor(() => expect(feedRequests.length).toBeGreaterThan(0))
      // The theater mounts only once the active queue has been fetched.
      await waitFor(() => expect(screen.queryByTestId('theater-shell')).toBeInTheDocument(), {
        timeout: 2000,
      }).catch(() => {})
      return !!screen.queryByTestId('theater-shell')
    } finally {
      unmount()
    }
  }

  it('opens on ?collection=1', async () => {
    expect(await opensCollection('collection=1')).toBe(true)
  })

  it('still opens on the superseded ?triage=1', async () => {
    expect(await opensCollection('triage=1')).toBe(true)
  })

  it('does not open without either param', async () => {
    expect(await opensCollection('filter=all')).toBe(false)
  })
})
