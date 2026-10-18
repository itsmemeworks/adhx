/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AccountMenu, SIGN_IN_LINKS_HREF, SYNC_HREF } from '@/components/next/AccountMenu'

function mockMe(xConnected: boolean, xAvailable = true) {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          authenticated: true,
          xConnected,
          xAvailable,
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

  it('leaves X out on an ADHX without an X app', async () => {
    mockMe(false, false)
    render(<AccountMenu />)
    fireEvent.click(await screen.findByRole('button', { name: 'Your account' }))
    expect(screen.queryByRole('menuitem', { name: 'Connect X' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument()
  })

  it('shows an admin how many sign-in links are waiting, and where', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            authenticated: true,
            isAdmin: true,
            waitingSignIns: 2,
            user: { username: 'owner', displayName: 'Owner', avatarUrl: '' },
          }),
      } as Response),
    ) as unknown as typeof fetch
    render(<AccountMenu />)
    const button = await screen.findByRole('button', {
      name: 'Your account, 2 sign-in links waiting',
    })
    expect(button).toHaveTextContent('2')
    fireEvent.click(button)
    expect(screen.getByRole('menuitem', { name: '2 sign-in links waiting' })).toHaveAttribute(
      'href',
      SIGN_IN_LINKS_HREF,
    )
  })

  it('shows no count when nobody is waiting', async () => {
    mockMe(true)
    render(<AccountMenu />)
    fireEvent.click(await screen.findByRole('button', { name: 'Your account' }))
    expect(screen.queryByRole('menuitem', { name: /sign-in link/ })).not.toBeInTheDocument()
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
