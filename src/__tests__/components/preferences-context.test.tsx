/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.unmock('@/lib/preferences-context')

import { PreferencesProvider, usePreferences } from '@/lib/preferences-context'

function Probe() {
  const { preferences, loading, updatePreference } = usePreferences()
  return (
    <button type="button" onClick={() => void updatePreference('soundOn', !preferences.soundOn)}>
      {loading ? 'loading' : preferences.soundOn ? 'sound on' : 'sound off'}
    </button>
  )
}

function response(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)
}

describe('PreferencesProvider sound preference', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('loads the account setting, caches it locally, and persists updates', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/auth/me') return response({ authenticated: true })
      if (url === '/api/preferences' && !init?.method) return response({ soundOn: 'true' })
      return response({ success: true })
    })
    global.fetch = fetchMock as typeof fetch

    render(
      <PreferencesProvider>
        <Probe />
      </PreferencesProvider>,
    )

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('sound on'))
    expect(localStorage.getItem('adhx-theater-sound-default')).toBe('on')

    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('sound off'))
    expect(localStorage.getItem('adhx-theater-sound-default')).toBe('off')
    expect(sessionStorage.getItem('adhx-theater-sound')).toBe('off')
  })

  it('rolls back state without changing browser storage when the server rejects an update', async () => {
    localStorage.setItem('adhx-theater-sound-default', 'off')
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/auth/me') return response({ authenticated: true })
      if (url === '/api/preferences' && !init?.method) return response({ soundOn: 'false' })
      return response({}, false)
    })
    global.fetch = fetchMock as typeof fetch

    render(
      <PreferencesProvider>
        <Probe />
      </PreferencesProvider>,
    )

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('sound off'))
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('sound off'))
    expect(localStorage.getItem('adhx-theater-sound-default')).toBe('off')
    expect(sessionStorage.getItem('adhx-theater-sound')).toBeNull()
  })

  it('uses the local fallback for a signed-out browser', async () => {
    localStorage.setItem('adhx-theater-sound-default', 'on')
    global.fetch = vi.fn(() => response({ authenticated: false })) as typeof fetch

    render(
      <PreferencesProvider>
        <Probe />
      </PreferencesProvider>,
    )

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('sound on'))
  })
})
