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
import { render, screen, waitFor } from '@testing-library/react'
import { Header } from '@/components/Header'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/theme/context', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
  useThemeOptional: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}))

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
}

function mockFetch(authenticated: boolean) {
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
              identities: { x: { username: 'tester' }, email: null },
              xConnected: true,
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

  it('shows Collection · Live nav, with no Trending tab and no Add button', async () => {
    mockFetch(true)
    render(<Header />)

    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    // Desktop primary nav
    expect(screen.getByRole('link', { name: 'Collection' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Live' })).toBeInTheDocument()

    // Trending is gone everywhere (top nav + avatar menu)
    expect(screen.queryByRole('link', { name: /trending/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /trending/i })).not.toBeInTheDocument()

    // The `+` Add button and its modal trigger are removed
    expect(screen.queryByRole('button', { name: /add link/i })).not.toBeInTheDocument()
  })

  it('dispatches open-theater with tab "live" when Live is clicked', async () => {
    mockFetch(true)
    render(<Header />)
    await waitFor(() => expect(screen.getByLabelText('ADHX home')).toBeInTheDocument())

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    screen.getByRole('button', { name: 'Live' }).click()

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
    const menuLiveButton = screen.getAllByRole('button', { name: 'Live' })[0]
    menuLiveButton.click()

    const liveEvent = dispatchSpy.mock.calls
      .map((call) => call[0] as CustomEvent)
      .find((e) => e.type === 'open-theater')
    expect(liveEvent?.detail).toEqual({ tab: 'live' })
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
})
