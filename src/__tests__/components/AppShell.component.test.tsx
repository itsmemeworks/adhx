/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppShell } from '@/components/AppShell'

let mockPathname = '/'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/Header', () => ({
  Header: () => <div data-testid="app-header" />,
}))

vi.mock('@/components/PWAInstallPrompt', () => ({
  PWAInstallPrompt: () => <div data-testid="pwa-banner" />,
}))

describe('AppShell theater surfaces', () => {
  beforeEach(() => {
    mockPathname = '/'
  })

  it.each(['/', '/collection', '/t/you/cats', '/alice/status/123'])(
    'hides Header on %s but still mounts the install banner',
    (path) => {
      mockPathname = path
      render(
        <AppShell>
          <div>stage</div>
        </AppShell>,
      )
      expect(screen.queryByTestId('app-header')).not.toBeInTheDocument()
      expect(screen.getByTestId('pwa-banner')).toBeInTheDocument()
    },
  )

  it('hides Header and the install banner on /welcome', () => {
    mockPathname = '/welcome'
    render(
      <AppShell>
        <div>chooser</div>
      </AppShell>,
    )
    expect(screen.queryByTestId('app-header')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pwa-banner')).not.toBeInTheDocument()
  })

  it('keeps the install banner on /trending and /library', () => {
    mockPathname = '/trending'
    const { rerender } = render(
      <AppShell>
        <div>list</div>
      </AppShell>,
    )
    expect(screen.getByTestId('app-header')).toBeInTheDocument()
    expect(screen.getByTestId('pwa-banner')).toBeInTheDocument()

    mockPathname = '/library'
    rerender(
      <AppShell>
        <div>grid</div>
      </AppShell>,
    )
    expect(screen.getByTestId('app-header')).toBeInTheDocument()
    expect(screen.getByTestId('pwa-banner')).toBeInTheDocument()
  })
})
