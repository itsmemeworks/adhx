/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TheaterAvatarMenu } from '@/components/theater/TheaterAvatarMenu'
import { invalidateAuthMe } from '@/components/auth'

// Mutable so individual tests can simulate viewing the burger menu from
// somewhere other than the home theater (a shared preview page) — real
// usePathname() would return whatever route the component is mounted under.
let mockPathname = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

const AUTHED_ME = {
  authenticated: true,
  user: {
    id: 'u1',
    username: 'weedauwl',
    displayName: 'Pete',
    avatarUrl: null,
  },
  identities: {
    x: { username: 'weedauwl' },
    email: null,
  },
  xConnected: true,
}

const SIGNED_OUT_ME = {
  authenticated: false,
  user: null,
  identities: { x: null, email: null },
  xConnected: false,
}

function mockAuthMe(response: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/auth/me') {
        return Promise.resolve({ ok: true, json: async () => response })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    }),
  )
}

describe('TheaterAvatarMenu', () => {
  beforeEach(() => {
    // useAuthMe caches module-level state across renders/tests, so force a
    // refetch for every test.
    invalidateAuthMe()
    mockPathname = '/'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    invalidateAuthMe()
  })

  it('renders nothing when signed out and allowSignedOut is not set (triage/collection mounts)', async () => {
    mockAuthMe(SIGNED_OUT_ME)
    const { container } = render(<TheaterAvatarMenu />)
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/auth/me'))
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the avatar button when authenticated', async () => {
    mockAuthMe(AUTHED_ME)
    render(<TheaterAvatarMenu />)
    expect(await screen.findByLabelText('Account menu')).toBeInTheDocument()
  })

  it('opens the menu with the full nav set plus account actions', async () => {
    mockAuthMe(AUTHED_ME)
    render(<TheaterAvatarMenu />)
    const button = await screen.findByLabelText('Account menu')

    expect(screen.queryByText('Your collection')).not.toBeInTheDocument()
    fireEvent.click(button)

    expect(screen.getByText('Your collection')).toBeInTheDocument()
    expect(screen.getByText('Theater')).toBeInTheDocument()
    expect(screen.getByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('Leaderboard')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Sign out')).toBeInTheDocument()
    expect(screen.getByText('@weedauwl')).toBeInTheDocument()
  })

  it('matches the authed Header avatar menu’s nav hrefs — Collection/Tags/Leaderboard/Settings', async () => {
    mockAuthMe(AUTHED_ME)
    render(<TheaterAvatarMenu />)
    fireEvent.click(await screen.findByLabelText('Account menu'))

    expect(screen.getByText('Your collection').closest('a')).toHaveAttribute('href', '/')
    expect(screen.getByText('Tags').closest('a')).toHaveAttribute('href', '/tags')
    expect(screen.getByText('Leaderboard').closest('a')).toHaveAttribute('href', '/leaderboard')
    expect(screen.getByText('Settings').closest('a')).toHaveAttribute('href', '/settings')
  })

  it('on the home theater, Theater closes the menu instead of navigating', async () => {
    mockPathname = '/'
    mockAuthMe(AUTHED_ME)
    render(<TheaterAvatarMenu />)
    fireEvent.click(await screen.findByLabelText('Account menu'))

    const theaterEntry = screen.getByText('Theater').closest('button')
    expect(theaterEntry).toBeInTheDocument()

    fireEvent.click(theaterEntry!)
    expect(screen.queryByText('Theater')).not.toBeInTheDocument()
  })

  it('from a shared preview page, Theater is a link home', async () => {
    mockPathname = '/naval/status/123'
    mockAuthMe(AUTHED_ME)
    render(<TheaterAvatarMenu />)
    fireEvent.click(await screen.findByLabelText('Account menu'))

    expect(screen.getByText('Theater').closest('a')).toHaveAttribute('href', '/')
  })

  // Owner follow-up: the home theater's URL-sync effect rewrites the
  // address bar to per-post preview paths mid-session (theaterUrlSyncPath),
  // so `usePathname` alone reads as a shared-preview-page pathname even
  // while the visitor is still inside the home theater. `theaterActive`
  // lets the mounting chrome override that.
  it('theaterActive marks Theater current (close-only button) even when the URL has been rewritten mid-session', async () => {
    mockPathname = '/naval/status/123'
    mockAuthMe(AUTHED_ME)
    render(<TheaterAvatarMenu theaterActive />)
    fireEvent.click(await screen.findByLabelText('Account menu'))

    const theaterEntry = screen.getByText('Theater').closest('button')
    expect(theaterEntry).toBeInTheDocument()
    expect(theaterEntry).toHaveAttribute('aria-current', 'page')
    expect(theaterEntry!.querySelector('[data-testid="menu-current-dot"]')).toBeInTheDocument()

    fireEvent.click(theaterEntry!)
    expect(screen.queryByText('Theater')).not.toBeInTheDocument()
  })

  it('without theaterActive, the same rewritten pathname still renders Theater as an unmarked link', async () => {
    mockPathname = '/naval/status/123'
    mockAuthMe(AUTHED_ME)
    render(<TheaterAvatarMenu />)
    fireEvent.click(await screen.findByLabelText('Account menu'))

    const theaterLink = screen.getByText('Theater').closest('a')!
    expect(theaterLink).toHaveAttribute('href', '/')
    expect(theaterLink).not.toHaveAttribute('aria-current')
    expect(theaterLink.querySelector('[data-testid="menu-current-dot"]')).not.toBeInTheDocument()
  })

  it('POSTs logout and redirects on Sign out', async () => {
    mockAuthMe(AUTHED_ME)
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
    })

    render(<TheaterAvatarMenu />)
    fireEvent.click(await screen.findByLabelText('Account menu'))
    fireEvent.click(screen.getByText('Sign out'))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
        }),
      ),
    )
    await waitFor(() => expect(window.location.href).toBe('/'))

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('marks Tags as current (clay dot + aria-current) when on /tags', async () => {
    mockPathname = '/tags'
    mockAuthMe(AUTHED_ME)
    render(<TheaterAvatarMenu />)
    fireEvent.click(await screen.findByLabelText('Account menu'))

    const tagsLink = screen.getByText('Tags').closest('a')!
    expect(tagsLink).toHaveAttribute('aria-current', 'page')
    expect(tagsLink.querySelector('[data-testid="menu-current-dot"]')).toBeInTheDocument()

    // Not the currently-viewed entries.
    expect(screen.getByText('Settings').closest('a')).not.toHaveAttribute('aria-current')
  })

  it('marks Settings as current when on /settings', async () => {
    mockPathname = '/settings'
    mockAuthMe(AUTHED_ME)
    render(<TheaterAvatarMenu />)
    fireEvent.click(await screen.findByLabelText('Account menu'))

    const settingsLink = screen.getByText('Settings').closest('a')!
    expect(settingsLink).toHaveAttribute('aria-current', 'page')
    expect(settingsLink.querySelector('[data-testid="menu-current-dot"]')).toBeInTheDocument()
  })

  it('closes the menu on Escape', async () => {
    mockAuthMe(AUTHED_ME)
    render(<TheaterAvatarMenu />)
    fireEvent.click(await screen.findByLabelText('Account menu'))
    expect(screen.getByText('Your collection')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Your collection')).not.toBeInTheDocument()
  })

  it('closes the menu on outside click', async () => {
    mockAuthMe(AUTHED_ME)
    render(<TheaterAvatarMenu />)
    fireEvent.click(await screen.findByLabelText('Account menu'))
    expect(screen.getByText('Your collection')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('Your collection')).not.toBeInTheDocument()
  })
})

describe('TheaterAvatarMenu — signed-out burger (allowSignedOut)', () => {
  beforeEach(() => {
    invalidateAuthMe()
    mockPathname = '/'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    invalidateAuthMe()
  })

  it('renders a burger (not the avatar) with Theater/Leaderboard/Sign in', async () => {
    mockAuthMe(SIGNED_OUT_ME)
    render(<TheaterAvatarMenu allowSignedOut />)

    const button = await screen.findByLabelText('Menu')
    expect(screen.queryByLabelText('Account menu')).not.toBeInTheDocument()

    fireEvent.click(button)
    expect(screen.getByText('Theater')).toBeInTheDocument()
    expect(screen.getByText('Leaderboard')).toBeInTheDocument()
    expect(screen.getByText('Sign in')).toBeInTheDocument()
  })

  it('the Leaderboard entry links to /leaderboard', async () => {
    mockAuthMe(SIGNED_OUT_ME)
    render(<TheaterAvatarMenu allowSignedOut />)
    fireEvent.click(await screen.findByLabelText('Menu'))

    expect(screen.getByText('Leaderboard').closest('a')).toHaveAttribute('href', '/leaderboard')
  })

  it('on the home theater (pathname "/"), Theater is a close-the-menu button, not a link', async () => {
    mockPathname = '/'
    mockAuthMe(SIGNED_OUT_ME)
    render(<TheaterAvatarMenu allowSignedOut />)
    fireEvent.click(await screen.findByLabelText('Menu'))

    const theaterEntry = screen.getByText('Theater').closest('button')
    expect(theaterEntry).toBeInTheDocument()

    fireEvent.click(theaterEntry!)
    expect(screen.queryByText('Theater')).not.toBeInTheDocument()
  })

  it('from a shared preview page (pathname !== "/"), Theater is a link home', async () => {
    mockPathname = '/naval/status/123'
    mockAuthMe(SIGNED_OUT_ME)
    render(<TheaterAvatarMenu allowSignedOut />)
    fireEvent.click(await screen.findByLabelText('Menu'))

    expect(screen.getByText('Theater').closest('a')).toHaveAttribute('href', '/')
  })

  it('theaterActive marks Theater current (close-only button) even with a rewritten pathname', async () => {
    mockPathname = '/naval/status/123'
    mockAuthMe(SIGNED_OUT_ME)
    render(<TheaterAvatarMenu allowSignedOut theaterActive />)
    fireEvent.click(await screen.findByLabelText('Menu'))

    const theaterEntry = screen.getByText('Theater').closest('button')
    expect(theaterEntry).toBeInTheDocument()
    expect(theaterEntry).toHaveAttribute('aria-current', 'page')
    expect(theaterEntry!.querySelector('[data-testid="menu-current-dot"]')).toBeInTheDocument()
  })

  it('marks Leaderboard as current (clay dot + aria-current) when on /leaderboard, including sub-paths', async () => {
    mockPathname = '/leaderboard/week'
    mockAuthMe(SIGNED_OUT_ME)
    render(<TheaterAvatarMenu allowSignedOut />)
    fireEvent.click(await screen.findByLabelText('Menu'))

    const leaderboardLink = screen.getByText('Leaderboard').closest('a')!
    expect(leaderboardLink).toHaveAttribute('aria-current', 'page')
    expect(leaderboardLink.querySelector('[data-testid="menu-current-dot"]')).toBeInTheDocument()
  })

  it('does not mark Leaderboard current when elsewhere', async () => {
    mockPathname = '/naval/status/123'
    mockAuthMe(SIGNED_OUT_ME)
    render(<TheaterAvatarMenu allowSignedOut />)
    fireEvent.click(await screen.findByLabelText('Menu'))

    const leaderboardLink = screen.getByText('Leaderboard').closest('a')!
    expect(leaderboardLink).not.toHaveAttribute('aria-current')
    expect(
      leaderboardLink.querySelector('[data-testid="menu-current-dot"]'),
    ).not.toBeInTheDocument()
  })

  it('the Sign in entry closes the menu and calls onRequestSignIn', async () => {
    mockAuthMe(SIGNED_OUT_ME)
    const onRequestSignIn = vi.fn()
    render(<TheaterAvatarMenu allowSignedOut onRequestSignIn={onRequestSignIn} />)
    fireEvent.click(await screen.findByLabelText('Menu'))

    fireEvent.click(screen.getByText('Sign in'))
    expect(onRequestSignIn).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Sign in')).not.toBeInTheDocument()
  })

  it('signed in with allowSignedOut set still renders the normal avatar menu, not the burger', async () => {
    mockAuthMe(AUTHED_ME)
    render(<TheaterAvatarMenu allowSignedOut />)

    expect(await screen.findByLabelText('Account menu')).toBeInTheDocument()
    expect(screen.queryByLabelText('Menu')).not.toBeInTheDocument()
  })
})
