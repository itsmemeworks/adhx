/**
 * @vitest-environment jsdom
 *
 * Regression guard: Header used to have a dead GitHub-link block gated on
 * `!authStatus.authenticated`, placed after an earlier `if (authStatus !==
 * null && !authStatus.authenticated) return null` — so the component always
 * bailed out before that block could render. The link was removed rather than
 * fixed (GitHub discoverability now lives in PublicNav/PreviewShell, the
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
    if (url.startsWith('/api/stats')) return jsonResponse({ total: 0, unread: 0 })
    if (url.startsWith('/api/triage/streak')) return jsonResponse({ current: 0 })
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

  it('shows Collection · Theater · Tags · Leaderboard nav, with no Add button', async () => {
    mockFetch(true)
    render(<Header />)

    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    // Desktop primary nav
    expect(screen.getByRole('link', { name: 'Collection' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Theater' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tags' })).toHaveAttribute('href', '/tags')
    expect(screen.getByRole('link', { name: 'Leaderboard' })).toHaveAttribute(
      'href',
      '/collections',
    )

    // "Live" is gone — renamed to "Theater" (the mode contains both the live
    // pulse and the collection-as-theater tabs, so it's not just "Live").
    expect(screen.queryByRole('button', { name: 'Live' })).not.toBeInTheDocument()

    // The `+` Add button and its modal trigger are removed
    expect(screen.queryByRole('button', { name: /add link/i })).not.toBeInTheDocument()
  })

  it('dispatches open-theater with tab "live" when Theater is clicked', async () => {
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    screen.getByRole('button', { name: 'Theater' }).click()

    const liveEvent = dispatchSpy.mock.calls
      .map((call) => call[0] as CustomEvent)
      .find((e) => e.type === 'open-theater')
    expect(liveEvent).toBeDefined()
    expect(liveEvent?.detail).toEqual({ tab: 'live' })
  })

  it('dispatches open-theater with tab "live" from the avatar menu entry too', async () => {
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    // Open the avatar menu (the small round button with no accessible name
    // other than its image/initial — grab it by its position among buttons).
    const avatarButtons = screen.getAllByRole('button')
    const avatarButton = avatarButtons.find((btn) => btn.className.includes('rounded-full'))
    expect(avatarButton).toBeDefined()
    avatarButton!.click()

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const menuLiveButton = screen.getAllByRole('button', { name: 'Theater' })[0]
    menuLiveButton.click()

    const liveEvent = dispatchSpy.mock.calls
      .map((call) => call[0] as CustomEvent)
      .find((e) => e.type === 'open-theater')
    expect(liveEvent?.detail).toEqual({ tab: 'live' })
  })

  it('shows a Leaderboard link in the avatar menu too, pointing at /collections', async () => {
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    const avatarButtons = screen.getAllByRole('button')
    const avatarButton = avatarButtons.find((btn) => btn.className.includes('w-[33px]'))
    fireEvent.click(avatarButton!)

    const menuLeaderboardLinks = screen.getAllByRole('link', { name: 'Leaderboard' })
    expect(menuLeaderboardLinks.some((l) => l.getAttribute('href') === '/collections')).toBe(true)
  })

  it('shows a Tags nav link (top bar + avatar menu)', async () => {
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    // Desktop primary nav
    const navTagsLink = screen.getByRole('link', { name: 'Tags' })
    expect(navTagsLink).toHaveAttribute('href', '/tags')

    // Avatar menu also carries a Tags entry
    // Distinguish from the Triage pill and mobile search icon, which also
    // carry `rounded-full` — the avatar toggle is the only 33px round button.
    // Use fireEvent (not a raw `.click()`) so the resulting setState is
    // flushed before we assert on the menu contents.
    const avatarButtons = screen.getAllByRole('button')
    const avatarButton = avatarButtons.find((btn) => btn.className.includes('w-[33px]'))
    fireEvent.click(avatarButton!)

    const menuTagsLinks = screen.getAllByRole('link', { name: 'Tags' })
    expect(menuTagsLinks.some((l) => l.getAttribute('href') === '/tags')).toBe(true)
  })

  it('dispatches open-theater {tab: "triage"} plus the legacy open-triage event from the Triage pill', async () => {
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    screen.getByTitle('Triage your unread').click()

    const dispatchedTypes = dispatchSpy.mock.calls.map((call) => (call[0] as CustomEvent).type)
    expect(dispatchedTypes).toContain('open-triage')

    const theaterEvent = dispatchSpy.mock.calls
      .map((call) => call[0] as CustomEvent)
      .find((e) => e.type === 'open-theater')
    expect(theaterEvent?.detail).toEqual({ tab: 'triage' })
  })

  it('navigates to /?live=1 instead of dispatching when Theater is clicked off the feed page', async () => {
    mockPathname = '/tags'
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    screen.getByRole('button', { name: 'Theater' }).click()

    expect(pushSpy).toHaveBeenCalledWith('/?live=1')
    const liveEvent = dispatchSpy.mock.calls
      .map((call) => call[0] as CustomEvent)
      .find((e) => e.type === 'open-theater')
    expect(liveEvent).toBeUndefined()
  })

  it('navigates to /?live=1 from the avatar menu entry too when off the feed page', async () => {
    mockPathname = '/tags'
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    // Distinguish from the Triage pill and mobile search icon, which also
    // carry `rounded-full` — the avatar toggle is the only 33px round button.
    // Use fireEvent (not a raw `.click()`) so the resulting setState is
    // flushed before we assert on the menu contents.
    const avatarButtons = screen.getAllByRole('button')
    const avatarButton = avatarButtons.find((btn) => btn.className.includes('w-[33px]'))
    fireEvent.click(avatarButton!)

    const menuLiveButton = screen.getAllByRole('button', { name: 'Theater' })[0]
    menuLiveButton.click()

    expect(pushSpy).toHaveBeenCalledWith('/?live=1')
  })

  it('on /tags: search placeholder changes and typing dispatches "tags-search" instead of navigating', async () => {
    mockPathname = '/tags'
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    const input = screen.getByPlaceholderText('Search your tags…')
    expect(screen.queryByPlaceholderText('Search your collection…')).not.toBeInTheDocument()

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

  it('on other pages: search placeholder stays "Search your collection…"', async () => {
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    expect(screen.getByPlaceholderText('Search your collection…')).toBeInTheDocument()
  })

  it('hides "Sync bookmarks" in the avatar menu for an email-only account (no X connected)', async () => {
    mockFetch(true, false)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    // Distinguish from the Triage pill and mobile search icon, which also
    // carry `rounded-full` — the avatar toggle is the only 33px round button.
    // Use fireEvent (not a raw `.click()`) so the resulting setState is
    // flushed before we assert on the menu contents.
    const avatarButtons = screen.getAllByRole('button')
    const avatarButton = avatarButtons.find((btn) => btn.className.includes('w-[33px]'))
    fireEvent.click(avatarButton!)

    expect(screen.queryByText('Sync bookmarks')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Sync in /)).not.toBeInTheDocument()
  })

  it('shows "Sync bookmarks" in the avatar menu for an X-connected account', async () => {
    mockFetch(true, true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    // Distinguish from the Triage pill and mobile search icon, which also
    // carry `rounded-full` — the avatar toggle is the only 33px round button.
    // Use fireEvent (not a raw `.click()`) so the resulting setState is
    // flushed before we assert on the menu contents.
    const avatarButtons = screen.getAllByRole('button')
    const avatarButton = avatarButtons.find((btn) => btn.className.includes('w-[33px]'))
    fireEvent.click(avatarButton!)

    expect(screen.getByText('Sync bookmarks')).toBeInTheDocument()
  })
})
