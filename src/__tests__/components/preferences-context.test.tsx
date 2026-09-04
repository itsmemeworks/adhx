/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(localStorage.getItem('adhx-theater-sound')).toBe('off')
    expect(sessionStorage.getItem('adhx-theater-sound')).toBeNull()
  })

  it('rolls back the account setting but keeps the browser’s explicit choice on failure', async () => {
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
    expect(localStorage.getItem('adhx-theater-sound')).toBe('on')
    expect(sessionStorage.getItem('adhx-theater-sound')).toBeNull()
  })

  it('does not roll an ABA Theater choice back when a slow Settings save fails', async () => {
    let finishPatch: ((response: Response) => void) | undefined
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/auth/me') return response({ authenticated: true })
      if (url === '/api/preferences' && !init?.method) return response({ soundOn: 'false' })
      return new Promise<Response>((resolve) => {
        finishPatch = resolve
      })
    }) as typeof fetch

    render(
      <PreferencesProvider>
        <Probe />
      </PreferencesProvider>,
    )
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('sound off'))

    fireEvent.click(screen.getByRole('button'))
    localStorage.setItem('adhx-theater-sound', 'off')
    localStorage.setItem('adhx-theater-sound', 'on')
    await act(async () => {
      finishPatch?.({ ok: false, json: async () => ({}) } as Response)
    })

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('sound off'))
    expect(localStorage.getItem('adhx-theater-sound-default')).toBe('off')
    expect(localStorage.getItem('adhx-theater-sound')).toBe('on')
  })

  it('does not let a slow Settings save overwrite a newer Theater choice', async () => {
    let finishPatch: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/auth/me') return response({ authenticated: true })
      if (url === '/api/preferences' && !init?.method) return response({ soundOn: 'false' })
      return new Promise<Response>((resolve) => {
        finishPatch = resolve
      })
    })
    global.fetch = fetchMock as typeof fetch

    render(
      <PreferencesProvider>
        <Probe />
      </PreferencesProvider>,
    )
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('sound off'))

    fireEvent.click(screen.getByRole('button'))
    expect(localStorage.getItem('adhx-theater-sound')).toBe('on')

    // A newer player interaction in another tab wins while PATCH is pending.
    localStorage.setItem('adhx-theater-sound', 'off')
    await act(async () => {
      finishPatch?.({ ok: true, json: async () => ({ success: true }) } as Response)
    })

    expect(localStorage.getItem('adhx-theater-sound-default')).toBe('on')
    expect(localStorage.getItem('adhx-theater-sound')).toBe('off')
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
