/**
 * @vitest-environment jsdom
 *
 * Component tests for Settings (`src/components/next/settings/`): the X
 * bookmarks card (connect, sync with live progress over `/api/sync`, the
 * hour's wait, `?sync=1`), account rows, preferences, danger zone and footer.
 *
 * Note: `getAllByText('@tester')[0]` (not `getByText`) is used throughout —
 * the username row renders `@{username}` too, so an X-derived account with a
 * matching handle shows "@tester" twice (the X row and the username row).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react'
import { SettingsClient } from '@/app/settings/SettingsClient'
import { CONNECT_X_URL } from '@/components/next/settings/SyncCard'

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => {
  const router = {
    push: vi.fn(),
    replace: nav.replace,
    prefetch: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }
  return {
    useRouter: () => router,
    usePathname: () => '/settings',
    useSearchParams: () => nav.params,
    useParams: () => ({}),
  }
})

const preferenceMocks = vi.hoisted(() => ({
  updatePreference: vi.fn(),
  bionicReading: false,
  soundOn: false,
  loading: false,
}))
const { updatePreference } = preferenceMocks

vi.mock('@/lib/preferences-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/preferences-context')>()
  return {
    ...actual,
    usePreferences: () => ({
      preferences: {
        bionicReading: preferenceMocks.bionicReading,
        bodyFont: 'ibm-plex',
        avatarSource: 'x',
        soundOn: preferenceMocks.soundOn,
      },
      updatePreference,
      loading: preferenceMocks.loading,
    }),
  }
})

const ME_BOTH = {
  authenticated: true,
  user: { id: 'u1', username: 'tester', displayName: 'Tester', avatarUrl: '' },
  identities: {
    x: { username: 'tester', avatarUrl: 'https://pbs.twimg.com/profile_images/1/me.jpg' },
    email: { email: 'tester@example.com' },
  },
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
    return jsonResponse({})
  }) as unknown as typeof fetch

  global.fetch = fetchMock
  return fetchMock
}

/** Records every `/api/sync` stream the page opens. */
function stubEventSource() {
  const sources: (EventTarget & { url: string; closed: boolean })[] = []
  class EventSourceMock extends EventTarget {
    url: string
    closed = false
    constructor(url: string) {
      super()
      this.url = url
      sources.push(this)
    }
    close() {
      this.closed = true
    }
  }
  vi.stubGlobal('EventSource', EventSourceMock)
  return sources
}

const send = (source: EventTarget, event: string, data: object) =>
  act(async () => {
    source.dispatchEvent(new MessageEvent(event, { data: JSON.stringify(data) }))
  })

function syncCard() {
  return within(document.getElementById('sync') as HTMLElement)
}

describe('SettingsClient — X bookmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nav.params = new URLSearchParams()
    preferenceMocks.bionicReading = false
    preferenceMocks.soundOn = false
    preferenceMocks.loading = false
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('syncs with live progress, then shows what came in and the hour’s wait', async () => {
    const sources = stubEventSource()
    let synced = false
    mockFetch(ME_BOTH, {
      'GET /api/sync/cooldown': () =>
        jsonResponse(
          synced
            ? { canSync: false, cooldownRemaining: 3_600_000, lastSyncAt: null }
            : { canSync: true, cooldownRemaining: 0, lastSyncAt: null },
        ),
    })
    render(<SettingsClient />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sync X bookmarks' }))
    expect(sources).toHaveLength(1)
    expect(sources[0].url).toBe('/api/sync')

    await send(sources[0], 'progress', { total: 10, new: 2, duplicates: 1, categorized: 0 })
    expect(syncCard().getByText('3 of 10')).toBeInTheDocument()
    expect(
      syncCard().getByRole('progressbar', { name: 'Bringing in your X bookmarks' }),
    ).toHaveAttribute('aria-valuenow', '30')
    expect(syncCard().getByText('Keep this page open until it finishes.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sync X bookmarks' })).not.toBeInTheDocument()

    synced = true
    await send(sources[0], 'complete', { stats: { total: 10, new: 5, duplicates: 5 } })
    expect(syncCard().getByText('Done. 5 new bookmarks.')).toBeInTheDocument()
    expect(syncCard().getByRole('link', { name: 'Watch the newest' })).toHaveAttribute(
      'href',
      '/play?recent=1',
    )
    expect(await syncCard().findByText(/You can sync again in 1h 0m\./)).toBeInTheDocument()
    expect(sources).toHaveLength(1)
  })

  it('offers Reconnect X when X asks to sign in again', async () => {
    const sources = stubEventSource()
    mockFetch(ME_BOTH)
    render(<SettingsClient />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sync X bookmarks' }))
    await send(sources[0], 'error', { message: 'Reconnect X to keep syncing.', code: 'reauth' })

    expect(syncCard().getByText('That sync didn’t finish')).toBeInTheDocument()
    expect(syncCard().getByText('Reconnect X to keep syncing.')).toBeInTheDocument()
    expect(syncCard().getByRole('link', { name: /Reconnect X/ })).toHaveAttribute(
      'href',
      CONNECT_X_URL,
    )
    expect(screen.queryByRole('button', { name: /Try again|Sync X bookmarks/ })).toBeNull()
  })

  it('counts down instead of offering a sync inside the hour', async () => {
    stubEventSource()
    mockFetch(ME_BOTH, {
      'GET /api/sync/cooldown': () =>
        jsonResponse({ canSync: false, cooldownRemaining: 90_000, lastSyncAt: null }),
    })
    render(<SettingsClient />)

    expect(await screen.findByText(/You can sync again in 1m (30|29)s\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sync X bookmarks' })).not.toBeInTheDocument()
  })

  it('?sync=1 starts a sync once, then clears the address', async () => {
    const sources = stubEventSource()
    nav.params = new URLSearchParams('sync=1')
    mockFetch(ME_BOTH)
    render(<SettingsClient />)

    await waitFor(() => expect(sources).toHaveLength(1))
    expect(nav.replace).toHaveBeenCalledWith('/settings', { scroll: false })
    expect(syncCard().getByText('bookmarks in so far')).toBeInTheDocument()
  })

  it('?sync=1 without X shows Connect X and starts nothing', async () => {
    const sources = stubEventSource()
    nav.params = new URLSearchParams('sync=1')
    mockFetch(ME_EMAIL_ONLY)
    render(<SettingsClient />)

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/settings', { scroll: false }))
    expect(sources).toHaveLength(0)
    expect(syncCard().getByRole('link', { name: /Connect X/ })).toBeInTheDocument()
  })

  it('shows Connect X (returning to sync) when X isn’t connected', async () => {
    mockFetch(ME_EMAIL_ONLY)
    render(<SettingsClient />)

    await waitFor(() => expect(screen.getByText('tester@example.com')).toBeInTheDocument())
    expect(syncCard().getByText(/Connect X and we’ll bring in your bookmarks/)).toBeInTheDocument()
    expect(
      syncCard().getByText('We only read your bookmarks. We never post for you.'),
    ).toBeVisible()
    expect(syncCard().getByRole('link', { name: /Connect X/ })).toHaveAttribute(
      'href',
      '/api/auth/twitter?returnUrl=%2Fsettings%3Fsync%3D1',
    )
    expect(screen.queryByRole('button', { name: 'Sync X bookmarks' })).not.toBeInTheDocument()
  })

  it('shows the X account as connected next to the account rows', async () => {
    mockFetch(ME_BOTH)
    render(<SettingsClient />)

    await waitFor(() => expect(screen.getAllByText('@tester')[0]).toBeInTheDocument())
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Light|Dark|System)$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'You' })).toBeInTheDocument()
    expect(screen.getByText('Shows on your saves')).toBeInTheDocument()
    expect(syncCard().getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('tester@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync X bookmarks' })).toBeInTheDocument()
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

  it('renders past syncs and the counts from /api/sync/history', async () => {
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
          totalBookmarks: 50,
          xOnAdhx: 42,
          xSynced: 40,
        }),
    })

    render(<SettingsClient />)

    await waitFor(() => expect(screen.getByText('+7 new')).toBeInTheDocument())
    expect(screen.getByText('50 checked')).toBeInTheDocument()
    expect(screen.getByText('brought in from X').parentElement).toHaveTextContent('40')
    expect(screen.getByText('X posts saved').parentElement).toHaveTextContent('42')
    expect(screen.getByText('saves in all').parentElement).toHaveTextContent('50')
    expect(
      screen.getByText(
        /Last synced .* You can sync everything by hand again a minute after the last sync\./,
      ),
    ).toBeInTheDocument()
  })
})

describe('SettingsClient — account', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nav.params = new URLSearchParams()
  })

  it('posts a new email via the Change form', async () => {
    const changeSpy = vi.fn<FetchImpl>(() => jsonResponse({ ok: true }))
    mockFetch(ME_BOTH, { 'POST /api/auth/email/change': changeSpy })

    render(<SettingsClient />)
    await waitFor(() => expect(screen.getByText('tester@example.com')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Change email' }))
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

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add an email so you can always get back in' }),
    )
    await waitFor(() =>
      expect(screen.getByText(/add an email\. it.?s how you sign in/i)).toBeInTheDocument(),
    )
    expect(screen.getByPlaceholderText('you@email.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add email/i })).toBeInTheDocument()
  })

  it('adds email via the change endpoint so it stays on this account', async () => {
    const me = {
      authenticated: true,
      user: { id: 'u1', username: 'tester', displayName: 'Tester', avatarUrl: '' },
      identities: { x: { username: 'tester' }, email: null },
      xConnected: true,
    }
    const changeSpy = vi.fn<FetchImpl>(() => jsonResponse({ ok: true }))
    mockFetch(me, { 'POST /api/auth/email/change': changeSpy })
    render(<SettingsClient />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add an email so you can always get back in' }),
    )
    await waitFor(() => expect(screen.getByPlaceholderText('you@email.com')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
      target: { value: 'me@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add email/i }))

    await waitFor(() => expect(changeSpy).toHaveBeenCalled())
    const [, init] = changeSpy.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: 'me@example.com' })
    await waitFor(() => expect(screen.getByText(/check me@example\.com/i)).toBeInTheDocument())
  })

  it('offers the X photo in Change picture when X is connected', async () => {
    mockFetch(ME_BOTH)
    render(<SettingsClient />)

    fireEvent.click(await screen.findByRole('button', { name: 'Change picture' }))
    const dialog = screen.getByRole('dialog', { name: 'Change picture' })
    expect(within(dialog).getByRole('radio', { name: /Use your X picture/ })).toBeInTheDocument()
    // The X row still shows the X photo.
    const xPhoto = 'https://pbs.twimg.com/profile_images/1/me.jpg'
    expect(document.querySelectorAll(`img[src="${xPhoto}"]`).length).toBeGreaterThanOrEqual(1)
  })

  it('leaves the X photo out of Change picture when X is not connected', async () => {
    mockFetch(ME_EMAIL_ONLY)
    render(<SettingsClient />)

    fireEvent.click(await screen.findByRole('button', { name: 'Change picture' }))
    const dialog = screen.getByRole('dialog', { name: 'Change picture' })
    expect(within(dialog).queryByRole('radio', { name: /Use your X picture/ })).toBeNull()
    expect(within(dialog).getByRole('radio', { name: /Upload a photo/ })).toBeInTheDocument()
  })

  it('saves a Gob picture and refreshes the account', async () => {
    const avatarSpy = vi.fn<FetchImpl>(() =>
      jsonResponse({ avatarUrl: '/api/files/avatar/0123456789abcdef', source: 'gob' }),
    )
    mockFetch(ME_BOTH, { 'POST /api/account/avatar': avatarSpy })
    render(<SettingsClient />)

    fireEvent.click(await screen.findByRole('button', { name: 'Change picture' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Lime' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(avatarSpy).toHaveBeenCalled())
    const [, init] = avatarSpy.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      source: 'gob',
      colour: 'lime',
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change picture' })).toBeNull())
  })

  it('signs out from the Account card', async () => {
    const logoutSpy = vi.fn<FetchImpl>(() => jsonResponse({ ok: true }))
    mockFetch(ME_EMAIL_ONLY, { 'POST /api/auth/logout': logoutSpy })
    render(<SettingsClient />)

    await waitFor(() => expect(screen.getByText('tester@example.com')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(logoutSpy).toHaveBeenCalled())
  })

  it('shows what the address reports, and lets it be dismissed', async () => {
    nav.params = new URLSearchParams('auth_error=x_already_linked')
    mockFetch(ME_EMAIL_ONLY)
    render(<SettingsClient />)

    expect(
      await screen.findByText('That X account is already linked to another account.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('That X account is already linked to another account.')).toBeNull()
  })
})

describe('SettingsClient — preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nav.params = new URLSearchParams()
    preferenceMocks.bionicReading = false
    preferenceMocks.soundOn = false
    preferenceMocks.loading = false
  })

  it('names and operates the Bionic Reading switch', async () => {
    mockFetch(ME_EMAIL_ONLY)
    const { rerender } = render(<SettingsClient />)

    await waitFor(() => expect(screen.getByText('tester@example.com')).toBeInTheDocument())
    const toggle = screen.getByRole('switch', { name: 'Bionic reading' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)
    expect(updatePreference).toHaveBeenCalledWith('bionicReading', true)

    preferenceMocks.bionicReading = true
    rerender(<SettingsClient />)
    expect(screen.getByRole('switch', { name: 'Bionic reading' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('names and operates the Sound on by default switch', async () => {
    mockFetch(ME_EMAIL_ONLY)
    const { rerender } = render(<SettingsClient />)

    await waitFor(() => expect(screen.getByText('tester@example.com')).toBeInTheDocument())
    const toggle = screen.getByRole('switch', { name: 'Sound on by default' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)
    expect(updatePreference).toHaveBeenCalledWith('soundOn', true)

    preferenceMocks.soundOn = true
    rerender(<SettingsClient />)
    expect(screen.getByRole('switch', { name: 'Sound on by default' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('blocks overlapping Sound on by default updates', async () => {
    let finishUpdate: (() => void) | undefined
    updatePreference.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishUpdate = resolve
      }),
    )
    mockFetch(ME_EMAIL_ONLY)
    render(<SettingsClient />)

    await waitFor(() => expect(screen.getByText('tester@example.com')).toBeInTheDocument())
    const toggle = screen.getByRole('switch', { name: 'Sound on by default' })
    fireEvent.click(toggle)
    expect(toggle).toBeDisabled()

    fireEvent.click(toggle)
    expect(updatePreference).toHaveBeenCalledTimes(1)

    finishUpdate?.()
    await waitFor(() => expect(toggle).not.toBeDisabled())
  })

  it('picks a reading font', async () => {
    mockFetch(ME_EMAIL_ONLY)
    render(<SettingsClient />)

    const group = await screen.findByRole('radiogroup', { name: 'Reading font' })
    expect(within(group).getByRole('radio', { name: /IBM Plex Sans/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    fireEvent.click(within(group).getByRole('radio', { name: /Lexend/ }))
    expect(updatePreference).toHaveBeenCalledWith('bodyFont', 'lexend')
  })
})

describe('SettingsClient — danger zone and footer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nav.params = new URLSearchParams()
  })

  it('clears data only after CLEAR is typed', async () => {
    const clearSpy = vi.fn<FetchImpl>(() => jsonResponse({ ok: true }))
    mockFetch(ME_EMAIL_ONLY, { 'POST /api/account/clear': clearSpy })
    render(<SettingsClient />)

    await waitFor(() => expect(screen.getByText('tester@example.com')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Clear data' }))
    const dialog = screen.getByRole('dialog', { name: 'Clear all data' })
    const confirm = within(dialog).getByRole('button', { name: 'Clear data' })
    expect(confirm).toBeDisabled()

    fireEvent.change(within(dialog).getByPlaceholderText('CLEAR'), { target: { value: 'CLEAR' } })
    expect(confirm).not.toBeDisabled()
    fireEvent.click(confirm)

    await waitFor(() => expect(clearSpy).toHaveBeenCalled())
    expect(
      await screen.findByText('Your data is cleared. You’re still signed in.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Clear all data' })).toBeNull()
  })

  it('keeps Delete account locked until DELETE is typed', async () => {
    mockFetch(ME_EMAIL_ONLY)
    render(<SettingsClient />)

    await waitFor(() => expect(screen.getByText('tester@example.com')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete account' })
    expect(within(dialog).getByRole('button', { name: 'Delete account' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Delete account' })).toBeNull()
  })

  it('links the ADHX version to that GitHub release', async () => {
    mockFetch(ME_BOTH)
    render(<SettingsClient />)

    const version = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0'
    const link = await screen.findByRole('link', { name: `ADHX v${version}` })
    expect(link).toHaveAttribute(
      'href',
      `https://github.com/itsmemeworks/adhx/releases/tag/v${version}`,
    )
  })
})
