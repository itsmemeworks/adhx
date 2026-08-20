/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TheaterAvatarMenu } from '@/components/theater/TheaterAvatarMenu'
import { invalidateAuthMe } from '@/components/auth'

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
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    invalidateAuthMe()
  })

  it('renders nothing when signed out', async () => {
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

  it('opens the menu with the three items', async () => {
    mockAuthMe(AUTHED_ME)
    render(<TheaterAvatarMenu />)
    const button = await screen.findByLabelText('Account menu')

    expect(screen.queryByText('Your collection')).not.toBeInTheDocument()
    fireEvent.click(button)

    expect(screen.getByText('Your collection')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Sign out')).toBeInTheDocument()
    expect(screen.getByText('@weedauwl')).toBeInTheDocument()
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
