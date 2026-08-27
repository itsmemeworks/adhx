/**
 * @vitest-environment jsdom
 *
 * Regression guard: Header used to have a dead GitHub-link block gated on
 * `!authStatus.authenticated`, placed after an earlier `if (authStatus !==
 * null && !authStatus.authenticated) return null` — so the component always
 * bailed out before that block could render. The link was removed rather than
 * fixed (GitHub discoverability now lives in PublicNav, the
 * actual signed-out surfaces). This test guards against it reappearing here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Header } from '@/components/Header'

// Mutable so individual tests can simulate being on a route other than `/`
// (e.g. /tags) — real usePathname() would return whatever route Header is
// mounted under.
let mockPathname = '/'
const pushSpy = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/theme/context', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
  useThemeOptional: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}))

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
}

function mockFetch(authenticated: boolean, xConnected = true) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/auth/twitter/status')) {
      return jsonResponse(
        authenticated
          ? { authenticated: true, user: { id: '1', username: 'tester' } }
          : { authenticated: false },
      )
    }
    if (url.startsWith('/api/auth/me')) {
      return jsonResponse(
        authenticated
          ? {
              authenticated: true,
              user: { id: '1', username: 'tester', displayName: 'tester', avatarUrl: null },
              identities: xConnected
                ? { x: { username: 'tester' }, email: null }
                : { x: null, email: { email: 'tester@example.com' } },
              xConnected,
            }
          : {
              authenticated: false,
              user: null,
              identities: { x: null, email: null },
              xConnected: false,
            },
      )
    }
    if (url.startsWith('/api/stats')) return jsonResponse({ total: 0, active: 0 })
    if (url.startsWith('/api/sync/cooldown')) {
      return jsonResponse({ canSync: true, cooldownRemaining: 0, lastSyncAt: null })
    }
    return jsonResponse({})
  }) as unknown as typeof fetch
}

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    mockPathname = '/'
    pushSpy.mockClear()
  })

  it('renders nothing (no GitHub link) when signed out', async () => {
    mockFetch(false)
    const { container } = render(<Header />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('never renders a GitHub link once authenticated', async () => {
    mockFetch(true)
    render(<Header />)

    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /github/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/view on github/i)).not.toBeInTheDocument()
  })

  describe('leaderboard flash guard (avoids a header flash over the board on load)', () => {
    it('renders nothing on /leaderboard while auth is still unresolved', () => {
      mockPathname = '/leaderboard'
      // A promise that never resolves during this test — simulates the
      // window between mount and the /api/auth/me response, where
      // `authStatus` is still `null` (unresolved), not yet `{ authenticated:
      // false }`.
      global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch
      const { container } = render(<Header />)

      expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing on the old /collections URL while auth is still unresolved', () => {
      mockPathname = '/collections'
      global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch
      const { container } = render(<Header />)

      expect(container).toBeEmptyDOMElement()
    })

    it('renders the bar on /leaderboard once auth resolves to authenticated', async () => {
      mockPathname = '/leaderboard'
      mockFetch(true)
      render(<Header />)

      await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())
    })

    it('still renders nothing on other routes while auth is unresolved (unchanged prior behavior — this guard must not become global)', () => {
      mockPathname = '/'
      global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch
      const { container } = render(<Header />)

      // Unlike the leaderboard routes, elsewhere the component renders its
      // full JSX tree while auth is unresolved (most of it gated on
      // `authStatus?.authenticated`, so it collapses to just the sticky
      // header shell + logo) — it does not bail out to `null`.
      expect(container).not.toBeEmptyDOMElement()
      expect(screen.getByLabelText('ADHX home')).toBeInTheDocument()
    })
  })

  it('shows Library · Theater · Tags · Leaderboard nav as links, with no Add button', async () => {
    mockFetch(true)
    render(<Header />)

    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    // Desktop primary nav — every entry is a real route now that the theater
    // has its own (`/` = Live, `/saved` = Saved, `/library` = the
    // grid). Theater used to be a button dispatching `open-theater`.
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library')
    expect(screen.getByRole('link', { name: 'Theater' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Tags' })).toHaveAttribute('href', '/tags')
    expect(screen.getByRole('link', { name: 'Leaderboard' })).toHaveAttribute(
      'href',
      '/leaderboard',
    )

    // "Live" is gone — renamed to "Theater" (the mode contains both the live
    // pulse and the collection-as-theater tabs, so it's not just "Live"), and
    // "Collection" is gone — the grid is "Library" now.
    expect(screen.queryByRole('button', { name: 'Live' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Collection' })).not.toBeInTheDocument()

    // The `+` Add button and its modal trigger are removed
    expect(screen.queryByRole('button', { name: /add link/i })).not.toBeInTheDocument()
  })

  it('points Theater at `/` — the live theater is a route, not an overlay event', async () => {
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const theaterLink = screen.getByRole('link', { name: 'Theater' })
    expect(theaterLink).toHaveAttribute('href', '/')
    theaterLink.click()

    const liveEvent = dispatchSpy.mock.calls
      .map((call) => call[0] as CustomEvent)
      .find((e) => e.type === 'open-theater')
    expect(liveEvent).toBeUndefined()
  })

  it('carries Library + Theater as links in the avatar menu too', async () => {
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    const avatarButton = screen.getByRole('button', { name: 'Account menu' })
    expect(avatarButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(avatarButton)
    expect(avatarButton).toHaveAttribute('aria-expanded', 'true')

    const theaterLinks = screen.getAllByRole('link', { name: 'Theater' })
    expect(theaterLinks.some((l) => l.getAttribute('href') === '/')).toBe(true)
    const libraryLinks = screen.getAllByRole('link', { name: 'Library' })
    expect(libraryLinks.some((l) => l.getAttribute('href') === '/library')).toBe(true)
  })

  it('shows a Leaderboard link in the avatar menu too, pointing at /leaderboard', async () => {
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    const avatarButtons = screen.getAllByRole('button')
    const avatarButton = avatarButtons.find((btn) => btn.className.includes('w-[33px]'))
    fireEvent.click(avatarButton!)

    const menuLeaderboardLinks = screen.getAllByRole('link', { name: 'Leaderboard' })
    expect(menuLeaderboardLinks.some((l) => l.getAttribute('href') === '/leaderboard')).toBe(true)
  })

  it('shows a Tags nav link (top bar + avatar menu)', async () => {
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    // Desktop primary nav
    const navTagsLink = screen.getByRole('link', { name: 'Tags' })
    expect(navTagsLink).toHaveAttribute('href', '/tags')

    // Avatar menu also carries a Tags entry
    // Distinguish from the Collection entry and mobile search icon, which also
    // carry `rounded-full` — the avatar toggle is the only 33px round button.
    // Use fireEvent (not a raw `.click()`) so the resulting setState is
    // flushed before we assert on the menu contents.
    const avatarButtons = screen.getAllByRole('button')
    const avatarButton = avatarButtons.find((btn) => btn.className.includes('w-[33px]'))
    fireEvent.click(avatarButton!)

    const menuTagsLinks = screen.getAllByRole('link', { name: 'Tags' })
    expect(menuTagsLinks.some((l) => l.getAttribute('href') === '/tags')).toBe(true)
  })

  // The Collection entry is gone with the concept it was named for (owner: "remove
  // the concept of collection… it's essentially 'show me everything that's not
  // archived'"). Its job — reach your collection — is the nav's own entries,
  // and it carried both the gamified streak and an accent CTA.
  it('no longer renders a Collection entry', async () => {
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    expect(screen.queryByTitle('Collection your unread')).not.toBeInTheDocument()
    expect(screen.queryByText('Collection')).not.toBeInTheDocument()
  })

  it('keeps Theater pointing at `/` from any route (no ?live=1 hand-off)', async () => {
    // The theater used to be an overlay the feed page owned, so reaching it
    // from elsewhere meant `router.push('/?live=1')`. It's a route now, so the
    // same plain link works from anywhere.
    mockPathname = '/tags'
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    expect(screen.getByRole('link', { name: 'Theater' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute('href', '/library')
  })

  it('marks Theater as current on both of its routes', async () => {
    mockPathname = '/saved'
    mockFetch(true)
    const { rerender } = render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    // `/saved` is the theater's Saved tab, so the Theater entry —
    // not Library — is the active one there.
    expect(screen.getByRole('link', { name: 'Theater' }).className).toContain('text-clay')
    expect(screen.getByRole('link', { name: 'Library' }).className).not.toContain('bg-clay')

    mockPathname = '/live'
    rerender(<Header />)
    expect(screen.getByRole('link', { name: 'Theater' }).className).toContain('text-clay')
  })

  it('on /tags: search is an icon that expands to "Tags"; typing dispatches "tags-search" instead of navigating', async () => {
    mockPathname = '/tags'
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    expect(screen.queryByPlaceholderText('Search')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Tags' }))

    const input = screen.getByPlaceholderText('Tags')
    expect(screen.queryByPlaceholderText('Search')).not.toBeInTheDocument()

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    fireEvent.change(input, { target: { value: 'work' } })

    const tagsSearchEvent = dispatchSpy.mock.calls
      .map((call) => call[0] as CustomEvent)
      .find((e) => e.type === 'tags-search')
    expect(tagsSearchEvent?.detail).toBe('work')

    // No navigation should follow — /tags search never touches the URL.
    await new Promise((r) => setTimeout(r, 350))
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('on /library: search is an icon that expands to "Search" and writes /library?search=', async () => {
    mockPathname = '/library'
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    fireEvent.click(await screen.findByRole('button', { name: 'Search' }))
    const input = screen.getByPlaceholderText('Search')
    fireEvent.change(input, { target: { value: 'rust' } })

    await waitFor(() => {
      expect(pushSpy).toHaveBeenCalled()
      const url = pushSpy.mock.calls[pushSpy.mock.calls.length - 1][0] as string
      expect(url).toMatch(/^\/library\?/)
      expect(url).toContain('search=rust')
    })
  })

  it('hides search on pages that are not library or tags', async () => {
    mockPathname = '/settings'
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tags' })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Tags')).not.toBeInTheDocument()
  })

  it('hides "Sync bookmarks" in the avatar menu for an email-only account (no X connected)', async () => {
    mockFetch(true, false)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    // Distinguish from the Collection entry and mobile search icon, which also
    // carry `rounded-full` — the avatar toggle is the only 33px round button.
    // Use fireEvent (not a raw `.click()`) so the resulting setState is
    // flushed before we assert on the menu contents.
    const avatarButtons = screen.getAllByRole('button')
    const avatarButton = avatarButtons.find((btn) => btn.className.includes('w-[33px]'))
    fireEvent.click(avatarButton!)

    expect(screen.queryByText('Sync bookmarks')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Sync in /)).not.toBeInTheDocument()
    expect(screen.getByText('@tester')).toBeInTheDocument()
    expect(screen.queryByText('tester@example.com')).not.toBeInTheDocument()
  })

  it('shows "Sync bookmarks" in the avatar menu for an X-connected account', async () => {
    mockFetch(true, true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    // Distinguish from the Collection entry and mobile search icon, which also
    // carry `rounded-full` — the avatar toggle is the only 33px round button.
    // Use fireEvent (not a raw `.click()`) so the resulting setState is
    // flushed before we assert on the menu contents.
    const avatarButtons = screen.getAllByRole('button')
    const avatarButton = avatarButtons.find((btn) => btn.className.includes('w-[33px]'))
    fireEvent.click(avatarButton!)

    expect(screen.getByText('Sync bookmarks')).toBeInTheDocument()
  })
})
