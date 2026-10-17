/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AccountMenu, SYNC_HREF } from '@/components/next/AccountMenu'

function mockMe(xConnected: boolean) {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          authenticated: true,
          xConnected,
          user: { username: 'tester', displayName: 'Tester', avatarUrl: '' },
        }),
    } as Response),
  ) as unknown as typeof fetch
}

describe('AccountMenu', () => {
  it('sends Sync X bookmarks to the X card in Settings', async () => {
    mockMe(true)
    render(<AccountMenu />)
    fireEvent.click(await screen.findByRole('button', { name: 'Your account' }))
    expect(SYNC_HREF).toBe('/settings?sync=1')
    expect(screen.getByRole('menuitem', { name: 'Sync X bookmarks' })).toHaveAttribute(
      'href',
      SYNC_HREF,
    )
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  })

  it('says Connect X when X isn’t connected, to the same place', async () => {
    mockMe(false)
    render(<AccountMenu />)
    fireEvent.click(await screen.findByRole('button', { name: 'Your account' }))
    expect(screen.getByRole('menuitem', { name: 'Connect X' })).toHaveAttribute('href', SYNC_HREF)
  })

  it('offers Sign in when signed out, coming back to this page', async () => {
    window.history.replaceState(null, '', '/now')
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ authenticated: false }),
      } as Response),
    ) as unknown as typeof fetch
    render(<AccountMenu />)
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/start?returnTo=%2Fnow',
    )
    window.history.replaceState(null, '', '/')
  })
})
