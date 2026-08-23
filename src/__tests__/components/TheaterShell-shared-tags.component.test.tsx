/**
 * @vitest-environment jsdom
 *
 * Signed-in shared preview: tagging the lead must update chips / Tag · N
 * in place. The picker already saved (collection shows the tag); the
 * shared chrome used to ignore `bookmark-tags-changed`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, act, waitFor, screen } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import { notifyTagsChanged } from '@/lib/client-events'
import { resetSharedAutoSaveAttempts } from '@/lib/theater/autosave-shared'

vi.mock('@/components/theater/Stage', () => ({ Stage: () => <div data-testid="stage" /> }))
vi.mock('@/components/theater/CollectionStage', () => ({
  CollectionStage: () => <div data-testid="collection-stage" />,
  useInstagramStage: () => ({ status: 'idle', slow: false, src: null, poster: null }),
}))
vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: ({
    itemTags,
    accountTabs,
  }: {
    itemTags?: string[]
    accountTabs?: { tab: string }
  }) => (
    <div data-testid="desktop-tags" data-account-tab={accountTabs?.tab ?? ''}>
      {(itemTags ?? []).join(',')}
    </div>
  ),
  DesktopDock: () => null,
}))
vi.mock('@/components/theater/TheaterMobileChrome', () => ({
  TheaterMobileChrome: ({
    itemTags,
    accountTabs,
  }: {
    itemTags?: string[]
    accountTabs?: { tab: string }
  }) => (
    <div data-testid="mobile-tags" data-account-tab={accountTabs?.tab ?? ''}>
      {(itemTags ?? []).join(',')}
    </div>
  ),
}))
vi.mock('@/components/tags', () => ({ TagQuickPicker: () => null }))
vi.mock('@/components/theater/useTheaterFeed', () => ({
  useTheaterFeed: (seed: TheaterFeedSeed) => {
    const [items] = useState(seed.items)
    return { items, savedToday: 0, recentActivity: 0, freshKeys: new Set<string>() }
  },
}))

vi.mock('@/components/auth', () => ({
  SignInModal: () => null,
  useAuthMe: () => ({
    me: { authenticated: true, user: { username: 'owner' } },
    loading: false,
    refresh: vi.fn(),
  }),
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

describe('TheaterShell shared-lead tags', () => {
  const originalGetEntries = performance.getEntriesByType

  beforeEach(() => {
    resetSharedAutoSaveAttempts()
    sessionStorage.clear()
    window.history.replaceState(null, '', '/naval/status/123')
    performance.getEntriesByType = ((kind: string) => {
      if (kind !== 'navigation') return []
      return [{ type: 'reload', name: 'http://localhost:3000/naval/status/123' }]
    }) as unknown as typeof performance.getEntriesByType
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.includes('/api/feed')) {
        return {
          ok: true,
          json: async () => ({
            items: [{ id: '123', platform: 'twitter', tags: ['social'] }],
          }),
        }
      }
      return { ok: true, json: async () => ({}) }
    }) as never
  })

  afterEach(() => {
    performance.getEntriesByType = originalGetEntries
    resetSharedAutoSaveAttempts()
  })

  it('seeds chips from /api/feed when the shared lead is already tagged', async () => {
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
    await waitFor(() => expect(screen.getByTestId('desktop-tags')).toHaveTextContent('social'))
    expect(screen.getByTestId('mobile-tags')).toHaveTextContent('social')
    expect(screen.getByTestId('desktop-tags')).toHaveAttribute('data-account-tab', 'live')
    expect(screen.getByTestId('mobile-tags')).toHaveAttribute('data-account-tab', 'live')
  })

  it('patches chips when TagQuickPicker broadcasts bookmark-tags-changed', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: [{ id: '123', platform: 'twitter', tags: [] }] }),
    })) as never
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
    await waitFor(() => expect(screen.getByTestId('desktop-tags')).toHaveTextContent(''))

    await act(async () => {
      notifyTagsChanged({ platform: 'twitter', bookmarkId: '123', tags: ['social'] })
    })
    expect(screen.getByTestId('desktop-tags')).toHaveTextContent('social')
    expect(screen.getByTestId('mobile-tags')).toHaveTextContent('social')
  })
})
