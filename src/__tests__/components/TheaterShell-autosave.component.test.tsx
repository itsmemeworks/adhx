/**
 * @vitest-environment jsdom
 *
 * TheaterShell shared-lead autosave: the shell POSTs /api/bookmarks/add
 * only when `sharedAutoSaveReason` says so. Dwell still only pulses
 * /api/activity/preview.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useState } from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import { markPreviewOpenIntent, resetSharedAutoSaveAttempts } from '@/lib/theater/autosave-shared'

vi.mock('@/components/theater/Stage', () => ({ Stage: () => <div data-testid="stage" /> }))
vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: () => null,
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

function textItem(bookmarkId: string, author = `author${bookmarkId}`): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId,
    author,
    url: `/${author}/status/${bookmarkId}`,
    createdAt: '2026-08-18T00:00:00Z',
    contentType: 'text',
    text: `post ${bookmarkId}`,
    trendCount: 0,
  } as TheaterItem
}

const seed = (items: TheaterItem[]): TheaterFeedSeed => ({
  items,
  savedToday: 0,
  recentActivity: 0,
})

function stubNavigation(type: string, documentUrl: string) {
  performance.getEntriesByType = ((kind: string) => {
    if (kind !== 'navigation') return []
    return [{ type, name: documentUrl }]
  }) as unknown as typeof performance.getEntriesByType
}

function bookmarkAddBodies(): { url?: string; source?: string }[] {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    .filter(([url]) => String(url).includes('/api/bookmarks/add'))
    .map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')))
}

function previewPulseCalls(): number {
  return (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) =>
    String(url).includes('/api/activity/preview'),
  ).length
}

const originalGetEntries = performance.getEntriesByType

describe('TheaterShell shared-lead autosave', () => {
  beforeEach(() => {
    resetSharedAutoSaveAttempts()
    sessionStorage.clear()
    window.localStorage.clear()
    authMe = {
      me: { authenticated: true, user: { username: 'owner' } },
      loading: false,
      refresh: vi.fn(),
    }
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ items: [] }),
    })) as never
    window.history.replaceState(null, '', '/naval/status/123')
    stubNavigation('navigate', 'http://localhost:3000/naval/status/123')
  })

  afterEach(() => {
    performance.getEntriesByType = originalGetEntries
    sessionStorage.clear()
    resetSharedAutoSaveAttempts()
  })

  it('POSTs /api/bookmarks/add for a signed-in prefix landing', async () => {
    const item = textItem('123', 'naval')
    await act(async () => {
      render(<TheaterShell seed={seed([item])} mode="shared" sharedItem={item} authed />)
    })
    await waitFor(() => expect(bookmarkAddBodies()).toHaveLength(1))
    expect(bookmarkAddBodies()[0]).toEqual({
      url: 'https://x.com/naval/status/123',
      source: 'url_prefix',
    })
  })

  it('does not POST on reload of a theater-rewritten preview URL', async () => {
    stubNavigation('reload', 'http://localhost:3000/naval/status/123')
    const item = textItem('123', 'naval')
    await act(async () => {
      render(<TheaterShell seed={seed([item])} mode="shared" sharedItem={item} authed />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(bookmarkAddBodies()).toEqual([])
  })

  it('does not POST for an in-app hop from /trending', async () => {
    stubNavigation('navigate', 'http://localhost:3000/trending')
    const item = textItem('123', 'naval')
    await act(async () => {
      render(<TheaterShell seed={seed([item])} mode="shared" sharedItem={item} authed />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(bookmarkAddBodies()).toEqual([])
  })

  it('POSTs when a paste intent arrived via client navigation', async () => {
    stubNavigation('navigate', 'http://localhost:3000/library')
    markPreviewOpenIntent('paste')
    const item = textItem('123', 'naval')
    await act(async () => {
      render(<TheaterShell seed={seed([item])} mode="shared" sharedItem={item} authed />)
    })
    await waitFor(() => expect(bookmarkAddBodies()).toHaveLength(1))
    expect(bookmarkAddBodies()[0]?.source).toBe('url_prefix')
    expect(sessionStorage.getItem('adhx-preview-open-intent')).toBeNull()
  })

  it('POSTs when the document was loaded at /share', async () => {
    stubNavigation('navigate', 'http://localhost:3000/share')
    const item = textItem('123', 'naval')
    await act(async () => {
      render(<TheaterShell seed={seed([item])} mode="shared" sharedItem={item} authed />)
    })
    await waitFor(() => expect(bookmarkAddBodies()).toHaveLength(1))
  })

  it('does not POST when signed out', async () => {
    authMe = { me: null, loading: false, refresh: vi.fn() }
    const item = textItem('123', 'naval')
    await act(async () => {
      render(<TheaterShell seed={seed([item])} mode="shared" sharedItem={item} />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(bookmarkAddBodies()).toEqual([])
  })

  it('does not POST in home mode even if the address bar looks like a preview', async () => {
    const item = textItem('123', 'naval')
    await act(async () => {
      render(<TheaterShell seed={seed([item])} mode="home" authed />)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(bookmarkAddBodies()).toEqual([])
  })

  it('does not POST an unavailable shared lead', async () => {
    const item = textItem('123', 'naval')
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([item])}
          mode="shared"
          sharedItem={item}
          sharedUnavailable
          authed
        />,
      )
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(bookmarkAddBodies()).toEqual([])
  })

  it('POSTs without url_prefix source for ?save=1 even on reload', async () => {
    window.history.replaceState(null, '', '/naval/status/123?save=1')
    stubNavigation('reload', 'http://localhost:3000/naval/status/123')
    const item = textItem('123', 'naval')
    await act(async () => {
      render(<TheaterShell seed={seed([item])} mode="shared" sharedItem={item} authed />)
    })
    await waitFor(() => expect(bookmarkAddBodies()).toHaveLength(1))
    expect(bookmarkAddBodies()[0]).toEqual({
      url: 'https://x.com/naval/status/123',
    })
  })

  it('does not treat a 2s dwell pulse as a save (home mode)', async () => {
    vi.useFakeTimers()
    const item = textItem('99', 'alice')
    await act(async () => {
      render(<TheaterShell seed={seed([item])} mode="home" />)
    })
    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })
    expect(bookmarkAddBodies()).toEqual([])
    expect(previewPulseCalls()).toBe(1)
    vi.useRealTimers()
  })

  it('POSTs only once when the same lead remounts (session dedupe)', async () => {
    const item = textItem('123', 'naval')
    const first = render(
      <TheaterShell seed={seed([item])} mode="shared" sharedItem={item} authed />,
    )
    await waitFor(() => expect(bookmarkAddBodies()).toHaveLength(1))
    first.unmount()
    render(<TheaterShell seed={seed([item])} mode="shared" sharedItem={item} authed />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(bookmarkAddBodies()).toHaveLength(1)
    expect(theaterItemKey(item)).toBe('twitter:123')
  })
})
