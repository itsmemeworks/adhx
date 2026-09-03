import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RootLayout, { viewport } from '@/app/layout'

const layoutMocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
}))

vi.mock('next/font/google', () => {
  const font = () => ({ variable: '--test-font' })
  return {
    IBM_Plex_Sans: font,
    Inter: font,
    Lexend: font,
    Atkinson_Hyperlegible: font,
    Indie_Flower: font,
    Newsreader: font,
    Roboto_Mono: font,
  }
})

vi.mock('@/lib/auth/session', () => ({
  getCurrentUserId: layoutMocks.getCurrentUserId,
}))

vi.mock('@/components/AppShell', () => ({
  AppShell: ({
    children,
    serverAccountId,
  }: {
    children: React.ReactNode
    serverAccountId: string | null
  }) => <div data-server-account-id={serverAccountId ?? 'signed-out'}>{children}</div>,
}))

describe('RootLayout auth scope binding', () => {
  beforeEach(() => {
    layoutMocks.getCurrentUserId.mockReset()
  })

  it('passes the live ban-aware immutable account ID with the RSC payload', async () => {
    layoutMocks.getCurrentUserId.mockResolvedValue('account-b')

    const markup = renderToStaticMarkup(
      await RootLayout({
        children: <main>private payload</main>,
      }),
    )

    expect(layoutMocks.getCurrentUserId).toHaveBeenCalledOnce()
    expect(markup).toContain('<html lang="en" class="dark">')
    expect(markup).not.toContain("localStorage.getItem('theme')")
    expect(markup).toContain('data-server-account-id="account-b"')
    expect(markup).toContain('private payload')
  })

  it('binds signed-out payloads explicitly to null', async () => {
    layoutMocks.getCurrentUserId.mockResolvedValue(null)

    const markup = renderToStaticMarkup(
      await RootLayout({
        children: <main>public payload</main>,
      }),
    )

    expect(markup).toContain('data-server-account-id="signed-out"')
  })
})

describe('RootLayout viewport', () => {
  it('covers iOS safe areas so fixed theater chrome paints to the browser edge', () => {
    expect(viewport.viewportFit).toBe('cover')
  })
})
