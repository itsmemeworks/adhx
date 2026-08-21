/**
 * @vitest-environment jsdom
 *
 * Component tests for the rebuilt Settings page's "Sign-in & connection" and
 * "Sync X bookmarks" cards — the identity + sync-gating logic added on top of
 * the new `/api/auth/me` contract (accounts + magic-link work).
 *
 * Note: `getAllByText('@tester')[0]` (not `getByText`) is used throughout —
 * the card's Username row (see `UsernameRow.component.test.tsx`) renders
 * `@{username}` too, so an X-derived account with a matching handle shows
 * "@tester" twice on screen (the X row and the Username row).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SettingsClient } from '@/app/settings/SettingsClient'

vi.mock('@/lib/theme/context', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
  useThemeOptional: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}))

const ME_BOTH = {
  authenticated: true,
  user: { id: 'u1', username: 'tester', displayName: 'Tester', avatarUrl: '' },
  identities: { x: { username: 'tester' }, email: { email: 'tester@example.com' } },
  xConnected: true,
}

const ME_EMAIL_ONLY = {
  authenticated: true,
  user: { id: 'u1', username: 'tester', displayName: 'Tester', avatarUrl: '' },
  identities: { x: null, email: { email: 'tester@example.com' } },
  xConnected: false,
}

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response)
}

function mockFetch(me: object, overrides: Partial<Record<string, FetchImpl>> = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method || 'GET'
    const key = `${method} ${url.split('?')[0]}`

    if (overrides[key]) return overrides[key](input, init)

    if (url.startsWith('/api/auth/me')) return jsonResponse(me)
    if (url.startsWith('/api/sync/history')) {
      return jsonResponse({ syncs: [], lastSyncAt: null, totalBookmarks: 0 })
    }
    if (url.startsWith('/api/sync/cooldown')) {
      return jsonResponse({ canSync: true, cooldownRemaining: 0, lastSyncAt: null })
    }
    if (url.startsWith('/api/triage/streak')) {
      return jsonResponse({
        current: 0,
        longest: 0,
        lastActiveDate: null,
        triagedTotal: 0,
        triagedThisWeek: 0,
      })
    }
    return jsonResponse({})
  }) as unknown as typeof fetch

  global.fetch = fetchMock
  return fetchMock
}

describe('SettingsClient — Sign-in & connection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders both identity rows as connected when X and email are linked', async () => {
    mockFetch(ME_BOTH)
    render(<SettingsClient />)

    await waitFor(() => expect(screen.getAllByText('@tester')[0]).toBeInTheDocument())
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('tester@example.com')).toBeInTheDocument()
    expect(screen.getByText('Magic link')).toBeInTheDocument()
    // Sync card should show the full sync UI (xConnected)
    expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument()
  })

  it('shows a Connect-with-X nudge in the sync card when only email is linked', async () => {
    mockFetch(ME_EMAIL_ONLY)
    render(<SettingsClient />)

    await waitFor(() => expect(screen.getByText('Not connected')).toBeInTheDocument())
    expect(screen.getByText('tester@example.com')).toBeInTheDocument()
    expect(screen.getByText(/connect your x account to sync your bookmarks/i)).toBeInTheDocument()
    // No sync trigger button should be present
    expect(screen.queryByRole('button', { name: /sync now/i })).not.toBeInTheDocument()
  })

  it('confirms before disconnecting X and POSTs to the disconnect endpoint', async () => {
    const disconnectSpy = vi.fn<FetchImpl>(() => jsonResponse({ ok: true }))
    mockFetch(ME_BOTH, { 'POST /api/auth/twitter/disconnect': disconnectSpy })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<SettingsClient />)
    await waitFor(() => expect(screen.getAllByText('@tester')[0]).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))

    expect(confirmSpy).toHaveBeenCalled()
    await waitFor(() => expect(disconnectSpy).toHaveBeenCalled())

    confirmSpy.mockRestore()
  })

  it('does not POST disconnect when the confirm dialog is cancelled', async () => {
    const disconnectSpy = vi.fn<FetchImpl>(() => jsonResponse({ ok: true }))
    mockFetch(ME_BOTH, { 'POST /api/auth/twitter/disconnect': disconnectSpy })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<SettingsClient />)
    await waitFor(() => expect(screen.getAllByText('@tester')[0]).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))

    expect(confirmSpy).toHaveBeenCalled()
    expect(disconnectSpy).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
  })

  it('shows a 409 disconnect error inline instead of crashing', async () => {
    mockFetch(ME_BOTH, {
      'POST /api/auth/twitter/disconnect': () =>
        jsonResponse({ error: 'Add an email sign-in first…' }, false, 409),
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<SettingsClient />)
    await waitFor(() => expect(screen.getAllByText('@tester')[0]).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }))

    await waitFor(() => expect(screen.getByText(/add an email sign-in first/i)).toBeInTheDocument())
    // Still connected — the row was not optimistically cleared
    expect(screen.getAllByText('@tester')[0]).toBeInTheDocument()
  })

  it('posts a new email via the Change form', async () => {
    const changeSpy = vi.fn<FetchImpl>(() => jsonResponse({ ok: true }))
    mockFetch(ME_BOTH, { 'POST /api/auth/email/change': changeSpy })

    render(<SettingsClient />)
    await waitFor(() => expect(screen.getByText('tester@example.com')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^change$/i }))
    const input = screen.getByPlaceholderText('new@email.com')
    fireEvent.change(input, { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send confirmation link/i }))

    await waitFor(() => expect(changeSpy).toHaveBeenCalled())
    const [, init] = changeSpy.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: 'new@example.com' })
    await waitFor(() => expect(screen.getByText(/check new@example\.com/i)).toBeInTheDocument())
  })

  it('renders an Add-email form when no email identity is linked', async () => {
    const me = {
      authenticated: true,
      user: { id: 'u1', username: 'tester', displayName: 'Tester', avatarUrl: '' },
      identities: { x: { username: 'tester' }, email: null },
      xConnected: true,
    }
    mockFetch(me)
    render(<SettingsClient />)

    await waitFor(() =>
      expect(screen.getByText(/add an email so you can sign in without x/i)).toBeInTheDocument(),
    )
    expect(screen.getByPlaceholderText('you@email.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add email/i })).toBeInTheDocument()
  })

  it('renders sync history entries from the new /api/sync/history contract', async () => {
    mockFetch(ME_BOTH, {
      'GET /api/sync/history': () =>
        jsonResponse({
          syncs: [
            {
              id: 's1',
              startedAt: '2026-08-19T18:40:00.000Z',
              completedAt: '2026-08-19T18:40:05.000Z',
              status: 'completed',
              newBookmarks: 7,
              totalFetched: 50,
            },
          ],
          lastSyncAt: '2026-08-19T18:40:05.000Z',
          totalBookmarks: 42,
        }),
    })

    render(<SettingsClient />)

    await waitFor(() => expect(screen.getByText('+7 new')).toBeInTheDocument())
    expect(screen.getByText(/42 bookmarks in your collection/i)).toBeInTheDocument()
    expect(screen.getByText('1 page')).toBeInTheDocument()
  })
})
