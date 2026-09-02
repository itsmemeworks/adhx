/**
 * @vitest-environment jsdom
 *
 * Signed-in shared preview: Live ⇄ Saved must hit the same
 * routes as `/` (`/saved`, Close → `/library`). Live is already
 * current on a preview, so that click is a no-op.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, act, fireEvent, screen } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import type { TheaterAccountTabs, TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import { resetSharedAutoSaveAttempts } from '@/lib/theater/autosave-shared'

const pushSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushSpy,
    replace: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/naval/status/123',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

function AccountTabButtons({ accountTabs }: { accountTabs?: TheaterAccountTabs }) {
  if (!accountTabs) return null
  return (
    <div>
      <button type="button" onClick={() => accountTabs.onTabChange('live')}>
        Live
      </button>
      <button type="button" onClick={() => accountTabs.onTabChange('collection')}>
        Saved
      </button>
      <button type="button" onClick={accountTabs.onClose}>
        Close
      </button>
    </div>
  )
}

const mockDesktopChrome = vi.fn((_props: Record<string, unknown>) => null)
const mockMobileChrome = vi.fn((_props: Record<string, unknown>) => null)
vi.mock('@/components/theater/Stage', () => ({ Stage: () => <div data-testid="stage" /> }))
vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: (props: { accountTabs?: TheaterAccountTabs } & Record<string, unknown>) => {
    mockDesktopChrome(props)
    return <AccountTabButtons accountTabs={props.accountTabs} />
  },
  DesktopDock: () => null,
}))
vi.mock('@/components/theater/TheaterMobileChrome', () => ({
  TheaterMobileChrome: (props: Record<string, unknown>) => {
    mockMobileChrome(props)
    return null
  },
}))
vi.mock('@/components/tags', () => ({ TagQuickPicker: () => null }))
vi.mock('@/components/theater/useTheaterFeed', () => ({
  useTheaterFeed: (seed: TheaterFeedSeed) => {
    const [items] = useState(seed.items)
    return { items, savedToday: 0, recentActivity: 0, freshKeys: new Set<string>() }
  },
}))

let authMe: {
  me: { authenticated: boolean; user?: { username: string } } | null
  loading: boolean
  refresh: () => void
} = {
  me: { authenticated: true, user: { username: 'owner' } },
  loading: false,
  refresh: vi.fn(),
}

vi.mock('@/components/auth', () => ({
  SignInModal: () => null,
  useAuthMe: () => authMe,
}))

function textItem(bookmarkId: string): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId,
    author: 'naval',
    url: `/naval/status/${bookmarkId}`,
    createdAt: '2026-08-18T00:00:00Z',
    contentType: 'text',
    text: 'post',
    trendCount: 0,
  } as TheaterItem
}

describe('TheaterShell shared-preview account tabs', () => {
  const originalGetEntries = performance.getEntriesByType

  beforeEach(() => {
    pushSpy.mockClear()
    mockDesktopChrome.mockClear()
    mockMobileChrome.mockClear()
    authMe = {
      me: { authenticated: true, user: { username: 'owner' } },
      loading: false,
      refresh: vi.fn(),
    }
    resetSharedAutoSaveAttempts()
    localStorage.clear()
    sessionStorage.clear()
    window.history.replaceState(null, '', '/naval/status/123')
    performance.getEntriesByType = ((kind: string) => {
      if (kind !== 'navigation') return []
      return [{ type: 'reload', name: 'http://localhost:3000/naval/status/123' }]
    }) as unknown as typeof performance.getEntriesByType
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: [] }),
    })) as never
  })

  afterEach(() => {
    performance.getEntriesByType = originalGetEntries
    resetSharedAutoSaveAttempts()
  })

  it('Saved and Close push the personal-theater routes; Live is a no-op', async () => {
    const item = textItem('123')
    await act(async () => {
      render(
        <TheaterShell
          seed={{ items: [item], savedToday: 0, recentActivity: 0 }}
          mode="shared"
          sharedItem={item}
          authed
        />,
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Live' }))
    expect(pushSpy).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Saved' }))
    expect(pushSpy).toHaveBeenCalledWith('/saved')

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(pushSpy).toHaveBeenCalledWith('/library')
  })

  it('2 pushes /saved from the keyboard; 1 is a no-op', async () => {
    const item = textItem('123')
    await act(async () => {
      render(
        <TheaterShell
          seed={{ items: [item], savedToday: 0, recentActivity: 0 }}
          mode="shared"
          sharedItem={item}
          authed
        />,
      )
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))
    })
    expect(pushSpy).not.toHaveBeenCalled()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }))
    })
    expect(pushSpy).toHaveBeenCalledWith('/saved')
  })

  it('signed-out shared preview does not mount the account tabs', async () => {
    authMe = { me: { authenticated: false }, loading: false, refresh: vi.fn() }
    const item = textItem('123')
    await act(async () => {
      render(
        <TheaterShell
          seed={{ items: [item], savedToday: 0, recentActivity: 0 }}
          mode="shared"
          sharedItem={item}
        />,
      )
    })
    expect(screen.queryByRole('button', { name: 'Saved' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(pushSpy).not.toHaveBeenCalled()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }))
    })
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('passes live effective auth to both chromes after in-place sign-in', async () => {
    authMe = { me: { authenticated: false }, loading: false, refresh: vi.fn() }
    const item = textItem('123')
    const shell = (
      <TheaterShell
        seed={{ items: [item], savedToday: 0, recentActivity: 0 }}
        mode="shared"
        sharedItem={item}
        authed={false}
      />
    )
    let view!: ReturnType<typeof render>
    await act(async () => {
      view = render(shell)
    })
    expect(mockDesktopChrome.mock.calls.at(-1)?.[0].authed).toBe(false)
    expect(mockMobileChrome.mock.calls.at(-1)?.[0].authed).toBe(false)
    expect(screen.queryByRole('button', { name: 'Saved' })).not.toBeInTheDocument()

    authMe = {
      me: { authenticated: true, user: { username: 'owner' } },
      loading: false,
      refresh: vi.fn(),
    }
    await act(async () => {
      view.rerender(
        <TheaterShell
          seed={{ items: [item], savedToday: 0, recentActivity: 0 }}
          mode="shared"
          sharedItem={item}
          authed={false}
        />,
      )
    })

    expect(mockDesktopChrome.mock.calls.at(-1)?.[0].authed).toBe(true)
    expect(mockMobileChrome.mock.calls.at(-1)?.[0].authed).toBe(true)
    expect(mockMobileChrome.mock.calls.at(-1)?.[0].repeatCurrent).toBe(true)
    expect(mockMobileChrome.mock.calls.at(-1)?.[0].repeatMode).toBe('one')
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })

  it('lets settled client sign-out override a true SSR auth hint', async () => {
    const item = textItem('123')
    let view!: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <TheaterShell
          seed={{ items: [item], savedToday: 0, recentActivity: 0 }}
          mode="shared"
          sharedItem={item}
          authed
        />,
      )
    })
    expect(mockDesktopChrome.mock.calls.at(-1)?.[0].authed).toBe(true)
    expect(mockMobileChrome.mock.calls.at(-1)?.[0].authed).toBe(true)
    expect(mockMobileChrome.mock.calls.at(-1)?.[0].repeatCurrent).toBe(true)
    expect(mockMobileChrome.mock.calls.at(-1)?.[0].repeatMode).toBe('one')
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()

    authMe = { me: { authenticated: false }, loading: false, refresh: vi.fn() }
    await act(async () => {
      view.rerender(
        <TheaterShell
          seed={{ items: [item], savedToday: 0, recentActivity: 0 }}
          mode="shared"
          sharedItem={item}
          authed
        />,
      )
    })

    expect(mockDesktopChrome.mock.calls.at(-1)?.[0].authed).toBe(false)
    expect(mockMobileChrome.mock.calls.at(-1)?.[0].authed).toBe(false)
    expect(mockMobileChrome.mock.calls.at(-1)?.[0].repeatCurrent).toBe(true)
    expect(mockMobileChrome.mock.calls.at(-1)?.[0].repeatMode).toBe('one')
    expect(screen.queryByRole('button', { name: 'Saved' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('does not re-pin a released lead when settled client auth signs out', async () => {
    const lead = textItem('123')
    const next = textItem('456')
    let view!: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <TheaterShell
          seed={{ items: [lead, next], savedToday: 0, recentActivity: 0 }}
          mode="shared"
          sharedItem={lead}
          authed
        />,
      )
    })
    const beforeDeparture = mockMobileChrome.mock.calls.at(-1)?.[0]
    expect(beforeDeparture?.repeatCurrent).toBe(true)
    expect(beforeDeparture?.repeatMode).toBe('one')
    await act(async () => {
      ;(beforeDeparture?.onNext as () => void)()
    })
    expect(mockMobileChrome.mock.calls.at(-1)?.[0].currentKey).toBe('twitter:456')
    expect(mockMobileChrome.mock.calls.at(-1)?.[0].repeatMode).toBe('all')

    authMe = { me: { authenticated: false }, loading: false, refresh: vi.fn() }
    await act(async () => {
      view.rerender(
        <TheaterShell
          seed={{ items: [lead, next], savedToday: 0, recentActivity: 0 }}
          mode="shared"
          sharedItem={lead}
          authed
        />,
      )
    })

    const afterSignOut = mockMobileChrome.mock.calls.at(-1)?.[0]
    expect(afterSignOut?.authed).toBe(false)
    expect(afterSignOut?.currentKey).toBe('twitter:456')
    expect(afterSignOut?.repeatCurrent).toBe(true)
    expect(afterSignOut?.repeatMode).toBe('all')
    expect((afterSignOut?.items as TheaterItem[]).map((item) => item.bookmarkId)).toEqual(['456'])
  })

  it('uses the SSR auth hint while client auth is still unresolved', async () => {
    authMe = { me: null, loading: true, refresh: vi.fn() }
    const item = textItem('123')
    await act(async () => {
      render(
        <TheaterShell
          seed={{ items: [item], savedToday: 0, recentActivity: 0 }}
          mode="shared"
          sharedItem={item}
          authed
        />,
      )
    })

    expect(mockDesktopChrome.mock.calls.at(-1)?.[0].authed).toBe(true)
    expect(mockMobileChrome.mock.calls.at(-1)?.[0].authed).toBe(true)
    expect(screen.getByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })
})
