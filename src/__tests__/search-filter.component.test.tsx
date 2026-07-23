/**
 * @vitest-environment jsdom
 */

/**
 * Regression test: typing in the Header search box must actually filter the
 * feed (i.e. `/api/feed` must eventually be — and stay — fetched with the
 * typed `search` term).
 *
 * Root cause: page.tsx's own URL-writer effect (`?filter=&platform=&sort=...`)
 * rebuilt the ENTIRE query string from scratch using its local component
 * state, including `search`. But `search` is written to the URL by Header's
 * independently-debounced `router.push`, and page.tsx's local `search` state
 * only catches up a render later. When that writer effect fired before the
 * catch-up render committed, it reconstructed the URL from a stale (empty)
 * `search` and stripped the term Header had just pushed — and because
 * page.tsx's own "read search back out of the URL" effect then saw the
 * stripped URL, it reset its local `search` state back to empty, undoing the
 * filter. Header's debounce effect also listed `searchParams` as a
 * dependency, so any of page.tsx's unrelated navigations (filter/sort/etc.)
 * could reset the user's in-flight debounce timer mid-keystroke.
 *
 * This test mounts the REAL Header and the REAL feed page together against a
 * shared, minimal `next/navigation` fake that behaves like the real router
 * (push/replace mutate one URL and re-render every subscriber) so the actual
 * effect-ordering bug reproduces under real React scheduling rather than a
 * hand-rolled model of it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState, useEffect } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Header } from '@/components/Header'
import FeedPage from '@/app/page'

// ─────────────────────────────────────────────────────────────────────────
// Fake router: a single shared "URL" that both Header and the feed page
// subscribe to via useSearchParams(), just like real Next.js navigation.
//
// Real Next.js hands out a REFERENTIALLY STABLE searchParams object that
// only changes identity when the URL actually changes. Recreating a new
// URLSearchParams on every call (i.e. every render) makes any effect that
// depends on it — including the fix under test — look like it changes on
// every single render, which spins into an infinite render loop. So the
// object is only ever replaced inside setQuery(), on an actual navigation.
// ─────────────────────────────────────────────────────────────────────────
let currentQuery = ''
let currentParamsObj = new URLSearchParams(currentQuery)
const urlListeners = new Set<() => void>()

function setQuery(next: string) {
  // Real Next.js is a no-op (no new searchParams identity, no re-render) when
  // navigating to the URL that's already current. Without this guard, an
  // effect that unconditionally calls router.replace() on every run (as the
  // filter-writer effect does) would recreate the searchParams object even
  // when nothing changed, which — because that object is also one of the
  // effect's own dependencies — spins into an infinite render loop here even
  // though the real router would have stopped it.
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
  useRouter: () => ({ push: pushSpy, replace: replaceSpy, prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => {
    // Force a re-render on every URL change, mirroring how Next.js
    // re-renders every subscriber of useSearchParams() on navigation.
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

// Heavy/irrelevant children — stub them out so the test exercises only the
// URL <-> state wiring under scrutiny.
vi.mock('@/components/feed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/feed')>()
  return {
    ...actual,
    FeedGrid: () => null,
    FilterBar: () => null,
  }
})
vi.mock('@/components/feed/TriageMode', () => ({ TriageMode: () => null }))
vi.mock('@/components/KeyboardShortcutsModal', () => ({ KeyboardShortcutsModal: () => null }))
vi.mock('@/components/LandingPage', () => ({ LandingPage: () => null }))
vi.mock('@/components/AddTweetModal', () => ({ AddTweetModal: () => null }))
vi.mock('@/components/sync/SyncProgress', () => ({ SyncProgress: () => null }))

// ─────────────────────────────────────────────────────────────────────────
// Fetch mock: route by URL, tracking every /api/feed call so we can assert
// on the sequence of search terms actually requested.
// ─────────────────────────────────────────────────────────────────────────
let feedRequests: string[] = []

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response)
}

beforeEach(() => {
  currentQuery = ''
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
        items: [],
        stats: { total: 0, unread: 0 },
        pagination: { page: 1, totalPages: 1 },
      })
    }
    if (url.startsWith('/api/auth/twitter/status')) {
      return jsonResponse({ authenticated: true, user: { id: '1', username: 'tester' } })
    }
    if (url.startsWith('/api/tags')) return jsonResponse({ tags: [] })
    if (url.startsWith('/api/stats')) return jsonResponse({ total: 0, unread: 0 })
    if (url.startsWith('/api/triage/streak')) return jsonResponse({ currentStreak: 0 })
    if (url.startsWith('/api/sync/cooldown')) {
      return jsonResponse({ canSync: true, cooldownRemaining: 0, lastSyncAt: null })
    }
    return jsonResponse({})
  }) as unknown as typeof fetch
})

describe('Header search -> feed filtering (regression)', () => {
  it('typing a search term results in /api/feed being fetched with that term, and it sticks', async () => {
    render(
      <>
        <Header />
        <FeedPage />
      </>,
    )

    // Wait for the initial (unfiltered) feed fetch so we have a clean baseline.
    await waitFor(() => expect(feedRequests.length).toBeGreaterThan(0))
    feedRequests = []

    const input = await screen.findByLabelText('Search bookmarks')
    fireEvent.change(input, { target: { value: 'rust' } })

    // Real 300ms debounce in Header — wait past it, then let the URL update
    // propagate through page.tsx's read-sync effect and trigger a refetch.
    await waitFor(
      () => {
        const last = feedRequests[feedRequests.length - 1]
        expect(last).toBeDefined()
        expect(last).toContain('search=rust')
      },
      { timeout: 2000 },
    )

    // The critical regression check: the search must not be silently reverted
    // by a follow-up fetch once things settle (that reversion — a fetch with
    // search stripped — was the actual user-visible bug).
    await new Promise((r) => setTimeout(r, 400))
    const last = feedRequests[feedRequests.length - 1]
    expect(last).toContain('search=rust')
    expect(currentQuery).toContain('search=rust')
  })

  it("preserves an existing ?search= when page.tsx's own filter-writer effect fires for an unrelated state change", async () => {
    currentQuery = 'search=kept'
    currentParamsObj = new URLSearchParams(currentQuery)

    render(<FeedPage />)

    await waitFor(() => expect(feedRequests.length).toBeGreaterThan(0))
    expect(feedRequests[feedRequests.length - 1]).toContain('search=kept')

    replaceSpy.mockClear()

    // 'u' toggles unreadOnly — a state this component owns and writes to the
    // URL via the same effect that used to also (incorrectly) rebuild `search`
    // from local state.
    fireEvent.keyDown(window, { key: 'u' })

    await waitFor(() => expect(replaceSpy).toHaveBeenCalled())
    const lastReplaceUrl = replaceSpy.mock.calls[replaceSpy.mock.calls.length - 1][0] as string
    expect(lastReplaceUrl).toContain('search=kept')
  })
})
