/**
 * @vitest-environment jsdom
 *
 * Component tests for the Settings Username card (`UsernameRow` in
 * `SettingsClient.tsx`) and the shared `UsernameChooser` it mounts inline.
 * Covers: the free-first-claim ("Choose") state, live availability feedback,
 * a successful claim flipping the row to read-only without a reload, the
 * "N changes left" state once a username has been chosen, and the fully
 * read-only state once the change cap is spent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SettingsClient } from '@/app/settings/SettingsClient'

vi.mock('@/lib/theme/context', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
  useThemeOptional: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}))

// The chooser debounces its availability check by 350ms.
const DEBOUNCE_WAIT = { timeout: 2000 }

interface MeUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string
  usernameChosen: boolean
  usernameChangeCount: number
}

interface Me {
  authenticated: boolean
  user: MeUser
  identities: { x: { username: string } | null; email: { email: string } | null }
  xConnected: boolean
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)
}

/**
 * Stubs `fetch` for a SettingsClient render. `me` is a mutable holder so a
 * POST /api/auth/username can update it before the component's `refresh()`
 * re-fetches /api/auth/me — exercising the "flips to read-only without a
 * reload" behavior for real, not just via a canned second response.
 */
function mockFetch(
  me: { current: Me },
  opts: { available?: boolean; claim?: Partial<Me['user']> } = {},
) {
  const available = opts.available ?? true
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method || 'GET'

    if (url.startsWith('/api/auth/me')) return jsonResponse(me.current)
    if (url.startsWith('/api/auth/username?check=')) {
      const sanitized = new URL(url, 'http://localhost').searchParams.get('check') || ''
      return jsonResponse({ available, sanitized })
    }
    if (method === 'POST' && url === '/api/auth/username') {
      if (!opts.claim) return jsonResponse({ error: 'taken' })
      me.current = { ...me.current, user: { ...me.current.user, ...opts.claim } }
      return jsonResponse({
        ok: true,
        username: me.current.user.username,
        changesRemaining: 2 - me.current.user.usernameChangeCount,
      })
    }
    if (url.startsWith('/api/sync/history')) {
      return jsonResponse({ syncs: [], lastSyncAt: null, totalBookmarks: 0 })
    }
    if (url.startsWith('/api/sync/cooldown')) {
      return jsonResponse({ canSync: true, cooldownRemaining: 0, lastSyncAt: null })
    }
    return jsonResponse({})
  }) as unknown as typeof fetch
}

function meFixture(user: Partial<MeUser>): { current: Me } {
  return {
    current: {
      authenticated: true,
      user: {
        id: 'u1',
        username: 'auto123',
        displayName: 'A',
        avatarUrl: '',
        usernameChosen: false,
        usernameChangeCount: 0,
        ...user,
      },
      // No linked email/X — the email row's own "Add email" form has no
      // "Change" button, so it can't collide with the Username row's
      // Choose/Change affordance under test here.
      identities: { x: null, email: null },
      xConnected: false,
    },
  }
}

describe('SettingsClient — Username row', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a "Choose" affordance for an account that has never claimed a username', async () => {
    const me = meFixture({ username: 'auto123', usernameChosen: false })
    mockFetch(me)

    render(<SettingsClient />)

    await waitFor(() => expect(screen.getByText('@auto123')).toBeInTheDocument())
    expect(screen.getByText('Your public handle on shared playlists')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose' })).toBeInTheDocument()
  })

  it('shows live availability feedback in the inline chooser', async () => {
    const me = meFixture({ username: 'auto123', usernameChosen: false })
    mockFetch(me, { available: false })

    render(<SettingsClient />)
    await waitFor(() => expect(screen.getByText('@auto123')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }))

    const input = screen.getByLabelText('Username')
    fireEvent.change(input, { target: { value: 'popular' } })

    await waitFor(
      () => expect(screen.getByText('Taken — try another')).toBeInTheDocument(),
      DEBOUNCE_WAIT,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('a successful claim flips the row to read-only without a reload', async () => {
    const me = meFixture({ username: 'auto123', usernameChosen: false })
    mockFetch(me, {
      available: true,
      claim: { username: 'chosen', usernameChosen: true, usernameChangeCount: 0 },
    })

    render(<SettingsClient />)
    await waitFor(() => expect(screen.getByText('@auto123')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }))

    const input = screen.getByLabelText('Username')
    fireEvent.change(input, { target: { value: 'chosen' } })
    await waitFor(() => expect(screen.getByText('Available')).toBeInTheDocument(), DEBOUNCE_WAIT)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getByText('@chosen')).toBeInTheDocument())
    // The chooser form is gone — the row collapsed back to read display.
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    expect(screen.getByText('2 changes left')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
  })

  it('shows the remaining-changes count and a "Change" affordance for a chosen account', async () => {
    const me = meFixture({ username: 'current', usernameChosen: true, usernameChangeCount: 1 })
    mockFetch(me)

    render(<SettingsClient />)
    await waitFor(() => expect(screen.getByText('@current')).toBeInTheDocument())
    expect(screen.getByText('1 change left')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.queryByText(/keep redirecting/i)).not.toBeInTheDocument()
    expect(screen.queryByText('1 change left')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('is fully read-only with no affordance once both changes are spent', async () => {
    const me = meFixture({ username: 'current', usernameChosen: true, usernameChangeCount: 2 })
    mockFetch(me)

    render(<SettingsClient />)
    await waitFor(() => expect(screen.getByText('@current')).toBeInTheDocument())
    expect(screen.getByText('No changes left')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose' })).not.toBeInTheDocument()
  })
})
