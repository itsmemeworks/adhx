/**
 * @vitest-environment jsdom
 *
 * Round 8 (owner: the theater's other public surfaces have a burger menu,
 * /leaderboard had none for signed-out visitors). `LeaderboardMenu` wraps
 * the shared `TheaterAvatarMenu` (allowSignedOut) and supplies the sign-in
 * modal its "Sign in" entry needs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LeaderboardMenu } from '@/components/collections/LeaderboardMenu'
import { invalidateAuthMe } from '@/components/auth'

let mockPathname = '/leaderboard'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

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

describe('LeaderboardMenu', () => {
  beforeEach(() => {
    invalidateAuthMe()
    mockPathname = '/leaderboard'
    mockAuthMe(SIGNED_OUT_ME)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    invalidateAuthMe()
  })

  it('renders the signed-out burger menu', async () => {
    render(<LeaderboardMenu />)
    expect(await screen.findByLabelText('Menu')).toBeInTheDocument()
  })

  it('clicking Sign in opens the sign-in modal', async () => {
    render(<LeaderboardMenu />)
    fireEvent.click(await screen.findByLabelText('Menu'))
    fireEvent.click(screen.getByText('Sign in'))

    await waitFor(() =>
      expect(
        screen.getByText('Save posts into playlists and get them on this leaderboard.'),
      ).toBeInTheDocument(),
    )
  })
})
