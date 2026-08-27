/**
 * @vitest-environment jsdom
 */
import { StrictMode, useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { AppShell } from '@/components/AppShell'

let mockPathname = '/'
const appShellMocks = vi.hoisted(() => ({
  auth: {
    me: null as {
      authenticated: boolean
      user: { id: string } | null
    } | null,
    loading: false,
  },
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  },
  preferenceMounts: 0,
  headerEffects: 0,
  headerCleanups: 0,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => appShellMocks.router,
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/Header', async () => {
  const { useEffect } = await import('react')
  return {
    Header: () => {
      useEffect(() => {
        appShellMocks.headerEffects += 1
        return () => {
          appShellMocks.headerCleanups += 1
        }
      }, [])
      return <div data-testid="app-header" />
    },
  }
})

vi.mock('@/components/PWAInstallPrompt', () => ({
  PWAInstallPrompt: () => <div data-testid="pwa-banner" />,
}))

vi.mock('@/components/auth', () => ({
  useAuthMe: () => ({ ...appShellMocks.auth, refresh: vi.fn() }),
}))

vi.mock('@/lib/preferences-context', async () => {
  const { useState } = await import('react')
  return {
    PreferencesProvider: ({ children }: { children: React.ReactNode }) => {
      const [mount] = useState(() => ++appShellMocks.preferenceMounts)
      return (
        <div data-testid="preferences-provider" data-mount={mount}>
          {children}
        </div>
      )
    },
  }
})

vi.mock('@/components/FontProvider', () => ({
  FontProvider: ({ children }: { children: React.ReactNode }) => children,
}))

function signedIn(id: string) {
  return {
    authenticated: true,
    user: { id },
  }
}

let childMounts = 0

function StatefulChild() {
  const [mount] = useState(() => ++childMounts)
  return <div>account-child-{mount}</div>
}

describe('AppShell theater surfaces', () => {
  beforeEach(() => {
    vi.useRealTimers()
    mockPathname = '/'
    appShellMocks.auth.me = signedIn('account-a')
    appShellMocks.auth.loading = false
    appShellMocks.router.replace.mockReset()
    appShellMocks.router.refresh.mockReset()
    appShellMocks.preferenceMounts = 0
    appShellMocks.headerEffects = 0
    appShellMocks.headerCleanups = 0
    childMounts = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(['/', '/live', '/saved', '/collection', '/t/you/cats', '/alice/status/123'])(
    'hides Header on %s but still mounts the install banner',
    (path) => {
      mockPathname = path
      render(
        <AppShell serverAccountId="account-a">
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
      <AppShell serverAccountId="account-a">
        <div>chooser</div>
      </AppShell>,
    )
    expect(screen.queryByTestId('app-header')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pwa-banner')).not.toBeInTheDocument()
  })

  it('keeps the install banner on /trending and /library', () => {
    mockPathname = '/trending'
    const { rerender } = render(
      <AppShell serverAccountId="account-a">
        <div>list</div>
      </AppShell>,
    )
    expect(screen.getByTestId('app-header')).toBeInTheDocument()
    expect(screen.getByTestId('pwa-banner')).toBeInTheDocument()

    mockPathname = '/library'
    rerender(
      <AppShell serverAccountId="account-a">
        <div>grid</div>
      </AppShell>,
    )
    expect(screen.getByTestId('app-header')).toBeInTheDocument()
    expect(screen.getByTestId('pwa-banner')).toBeInTheDocument()
  })

  it('does not mount effectful account Header chrome until a public route scope exactly matches', () => {
    mockPathname = '/trending'
    appShellMocks.auth.me = null
    appShellMocks.auth.loading = true
    const view = render(
      <AppShell serverAccountId="account-a">
        <div>public list</div>
      </AppShell>,
    )

    expect(screen.getByText('public list')).toBeInTheDocument()
    expect(screen.queryByTestId('app-header')).not.toBeInTheDocument()
    expect(appShellMocks.headerEffects).toBe(0)

    appShellMocks.auth.me = signedIn('account-b')
    appShellMocks.auth.loading = false
    view.rerender(
      <AppShell serverAccountId="account-a">
        <div>public list</div>
      </AppShell>,
    )
    expect(screen.queryByTestId('app-header')).not.toBeInTheDocument()
    expect(appShellMocks.headerEffects).toBe(0)

    view.rerender(
      <AppShell serverAccountId="account-b">
        <div>public list</div>
      </AppShell>,
    )
    expect(screen.getByTestId('app-header')).toBeInTheDocument()
    expect(appShellMocks.headerEffects).toBe(1)

    appShellMocks.auth.me = null
    appShellMocks.auth.loading = true
    view.rerender(
      <AppShell serverAccountId="account-b">
        <div>public list</div>
      </AppShell>,
    )
    expect(screen.queryByTestId('app-header')).not.toBeInTheDocument()
    expect(appShellMocks.headerCleanups).toBe(1)
  })

  it('cannot unlock A→B private children until the server scope is B', async () => {
    mockPathname = '/library'
    const view = render(
      <AppShell serverAccountId="account-a">
        <StatefulChild />
      </AppShell>,
    )
    await waitFor(() => expect(screen.getByText('account-child-1')).toBeInTheDocument())

    appShellMocks.auth.me = null
    appShellMocks.auth.loading = true
    view.rerender(
      <AppShell serverAccountId="account-a">
        <StatefulChild />
      </AppShell>,
    )
    expect(screen.queryByText(/account-child-/)).not.toBeInTheDocument()

    appShellMocks.auth.me = signedIn('account-b')
    appShellMocks.auth.loading = false
    view.rerender(
      <AppShell serverAccountId="account-a">
        <StatefulChild />
      </AppShell>,
    )
    expect(screen.queryByText(/account-child-/)).not.toBeInTheDocument()
    await waitFor(() => expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(1))

    // Arbitrary child identity changes are not proof that the payload belongs
    // to B; only the explicit server scope can unlock it.
    view.rerender(
      <AppShell serverAccountId="account-a">
        <StatefulChild />
      </AppShell>,
    )
    expect(screen.queryByText(/account-child-/)).not.toBeInTheDocument()
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('preferences-provider')).toHaveAttribute('data-mount', '1')

    appShellMocks.auth.me = null
    appShellMocks.auth.loading = true
    view.rerender(
      <AppShell serverAccountId="account-a">
        <StatefulChild />
      </AppShell>,
    )
    appShellMocks.auth.me = signedIn('account-b')
    appShellMocks.auth.loading = false
    view.rerender(
      <AppShell serverAccountId="account-a">
        <StatefulChild />
      </AppShell>,
    )
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(1)

    view.rerender(
      <AppShell serverAccountId="account-b">
        <StatefulChild />
      </AppShell>,
    )
    await waitFor(() => expect(screen.getByText('account-child-2')).toBeInTheDocument())
    expect(screen.getByTestId('preferences-provider')).toHaveAttribute('data-mount', '2')
  })

  it('never restores A private children after a remote sign-out settles', async () => {
    mockPathname = '/saved'
    const view = render(
      <AppShell serverAccountId="account-a">
        <StatefulChild />
      </AppShell>,
    )
    await waitFor(() => expect(screen.getByText('account-child-1')).toBeInTheDocument())

    appShellMocks.auth.me = null
    appShellMocks.auth.loading = true
    view.rerender(
      <AppShell serverAccountId="account-a">
        <StatefulChild />
      </AppShell>,
    )
    expect(screen.queryByText(/account-child-/)).not.toBeInTheDocument()

    appShellMocks.auth.loading = false
    view.rerender(
      <AppShell serverAccountId="account-a">
        <StatefulChild />
      </AppShell>,
    )
    expect(screen.queryByText(/account-child-/)).not.toBeInTheDocument()
    await waitFor(() => expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(1))

    view.rerender(
      <AppShell serverAccountId={null}>
        <StatefulChild />
      </AppShell>,
    )
    expect(screen.queryByText(/account-child-/)).not.toBeInTheDocument()
    await waitFor(() => expect(appShellMocks.router.replace).toHaveBeenCalledWith('/'))
  })

  it.each([
    '/live',
    '/saved',
    '/collection',
    '/library',
    '/tags',
    '/settings',
    '/welcome',
    '/admin',
    '/admin/posts',
  ])('redirects a trusted signed-out visit away from private route %s', async (path) => {
    mockPathname = path
    appShellMocks.auth.me = null
    appShellMocks.auth.loading = false

    render(
      <AppShell serverAccountId={null}>
        <StatefulChild />
      </AppShell>,
    )

    expect(screen.queryByText(/account-child-/)).not.toBeInTheDocument()
    await waitFor(() => expect(appShellMocks.router.replace).toHaveBeenCalledWith('/'))
  })

  it.each([
    '/',
    '/trending',
    '/leaderboard',
    '/t/you/cats',
    '/alice/status/123',
    '/reels/reel-id',
    '/p/photo-post-id',
    '/shorts/abcdefghijk',
    '/@creator/video/123',
  ])('does not redirect a trusted signed-out public route %s', async (path) => {
    mockPathname = path
    appShellMocks.auth.me = null
    appShellMocks.auth.loading = false

    render(
      <AppShell serverAccountId={null}>
        <div>public content</div>
      </AppShell>,
    )

    expect(screen.getByText('public content')).toBeInTheDocument()
    await act(async () => {})
    expect(appShellMocks.router.replace).not.toHaveBeenCalled()
  })

  it('keeps public content visible but inert until B matches, then remounts preferences', async () => {
    mockPathname = '/'
    const view = render(
      <AppShell serverAccountId="account-a">
        <StatefulChild />
      </AppShell>,
    )
    expect(screen.getByText('account-child-1')).toBeInTheDocument()
    expect(screen.getByTestId('preferences-provider')).toHaveAttribute('data-mount', '1')
    expect(
      screen.getByText('account-child-1').closest('[data-app-account-scope]'),
    ).not.toHaveAttribute('inert')

    appShellMocks.auth.me = null
    appShellMocks.auth.loading = true
    view.rerender(
      <AppShell serverAccountId="account-a">
        <StatefulChild />
      </AppShell>,
    )
    expect(screen.getByText('account-child-1')).toBeInTheDocument()
    expect(screen.getByText('account-child-1').closest('[data-app-account-scope]')).toHaveAttribute(
      'inert',
    )

    appShellMocks.auth.me = signedIn('account-b')
    appShellMocks.auth.loading = false
    view.rerender(
      <AppShell serverAccountId="account-a">
        <StatefulChild />
      </AppShell>,
    )
    expect(screen.getByText('account-child-1')).toBeInTheDocument()
    expect(screen.getByText('account-child-1').closest('[data-app-account-scope]')).toHaveAttribute(
      'inert',
    )
    await waitFor(() => expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(1))

    view.rerender(
      <AppShell serverAccountId="account-a">
        <StatefulChild />
      </AppShell>,
    )
    expect(screen.getByText('account-child-1')).toBeInTheDocument()
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(1)

    view.rerender(
      <AppShell serverAccountId="account-b">
        <StatefulChild />
      </AppShell>,
    )
    expect(screen.getByText('account-child-2')).toBeInTheDocument()
    expect(screen.getByTestId('preferences-provider')).toHaveAttribute('data-mount', '2')
    expect(
      screen.getByText('account-child-2').closest('[data-app-account-scope]'),
    ).not.toHaveAttribute('inert')
  })

  it('retries an unchanged mismatch with backoff and cancels immediately on exact match', async () => {
    vi.useFakeTimers()
    mockPathname = '/trending'
    appShellMocks.auth.me = signedIn('account-b')
    const view = render(
      <StrictMode>
        <AppShell serverAccountId="account-a">
          <div>public list</div>
        </AppShell>
      </StrictMode>,
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    // Strict Mode setup/cleanup replay still creates only one active loop.
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999)
    })
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(2)

    view.rerender(
      <StrictMode>
        <AppShell serverAccountId="account-b">
          <div>public list</div>
        </AppShell>
      </StrictMode>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(2)
  })

  it('starts a fresh bounded loop for a later A→B→A mismatch and cancels on unmount', async () => {
    vi.useFakeTimers()
    mockPathname = '/trending'
    const view = render(
      <AppShell serverAccountId="account-a">
        <div>public list</div>
      </AppShell>,
    )

    appShellMocks.auth.me = signedIn('account-b')
    view.rerender(
      <AppShell serverAccountId="account-a">
        <div>public list</div>
      </AppShell>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(1)

    view.rerender(
      <AppShell serverAccountId="account-b">
        <div>public list</div>
      </AppShell>,
    )

    appShellMocks.auth.me = signedIn('account-a')
    view.rerender(
      <AppShell serverAccountId="account-b">
        <div>public list</div>
      </AppShell>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(3)

    view.unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(3)
  })

  it('cancels the old timer when the mismatch changes', async () => {
    vi.useFakeTimers()
    mockPathname = '/trending'
    appShellMocks.auth.me = signedIn('account-b')
    const view = render(
      <AppShell serverAccountId="account-a">
        <div>public list</div>
      </AppShell>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(1)

    appShellMocks.auth.me = signedIn('account-c')
    view.rerender(
      <AppShell serverAccountId="account-a">
        <div>public list</div>
      </AppShell>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    // Only C's loop retries; B's pending timer was canceled.
    expect(appShellMocks.router.refresh).toHaveBeenCalledTimes(3)
  })
})
