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

vi.mock('@/components/theater/Stage', () => ({ Stage: () => <div data-testid="stage" /> }))
vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: AccountTabButtons,
  DesktopDock: () => null,
}))
vi.mock('@/components/theater/TheaterMobileChrome', () => ({
  TheaterMobileChrome: () => null,
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
    authMe = {
      me: { authenticated: true, user: { username: 'owner' } },
      loading: false,
      refresh: vi.fn(),
    }
    resetSharedAutoSaveAttempts()
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
})
