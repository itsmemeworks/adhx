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
})
