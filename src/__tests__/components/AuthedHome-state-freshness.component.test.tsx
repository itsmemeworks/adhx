/**
 * @vitest-environment jsdom
 *
 * Owner: "certain areas of the website don't update when things happen." A
 * state review found several places where the library grid held stale data;
 * these are the regression guards for the ones that were real.
 *
 * The grid is `AuthedHome`'s `items` array. Cross-component mutations reach it
 * through `window` CustomEvents (see `src/lib/client-events.ts`), so each test
 * dispatches the event a real mutation would and asserts what the grid does
 * with it. `FeedGrid` is stubbed to a probe that reports the items it was
 * handed — the assertions are about state, not markup.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState, useEffect } from 'react'
import { render, waitFor, act, screen } from '@testing-library/react'
import FeedPage from '@/app/AuthedHome'
import type { FeedItem } from '@/components/feed/types'
import { SYNC_IN_PROGRESS_MESSAGE } from '@/lib/sync/messages'

let currentQuery = ''
let currentParamsObj = new URLSearchParams(currentQuery)
const urlListeners = new Set<() => void>()

type EventListener = (event: Event) => void

class MockEventSource {
  static instances: MockEventSource[] = []
  listeners: Record<string, EventListener[]> = {}
  onerror: ((event: Event) => void) | null = null

  constructor(public url: string) {
    MockEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: EventListener) {
    ;(this.listeners[type] ||= []).push(listener)
  }

  close() {}

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) })
    this.listeners[type]?.forEach((listener) => listener(event))
  }
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/library',
  useSearchParams: () => {
    const [, forceRender] = useState(0)
    useEffect(() => {
      const l = () => forceRender((n: number) => n + 1)
      urlListeners.add(l)
      return () => {
        urlListeners.delete(l)
      }
    }, [])
    return currentParamsObj
  },
}))

vi.mock('@/lib/theme/context', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
  useThemeOptional: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}))

/** Last props the grid was rendered with. */
let renderedItems: FeedItem[] = []
let renderedJustAddedKey: string | null | undefined
vi.mock('@/components/feed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/feed')>()
  return {
    ...actual,
    FeedGrid: (props: { items: FeedItem[]; justAddedKey?: string | null }) => {
      renderedItems = props.items
      renderedJustAddedKey = props.justAddedKey
      return null
    },
    FilterBar: () => null,
  }
})
vi.mock('@/components/LandingPage', () => ({ LandingPage: () => null }))
vi.mock('@/components/sync/SyncProgress', () => ({ SyncProgress: () => null }))
vi.mock('@/components/theater/TheaterShell', () => ({
  TheaterShell: () => <div data-testid="theater-shell" />,
}))

// The real listener, so a paste can be simulated end to end.
vi.mock('@/components/PasteLinkButton', () => ({ PasteLinkButton: () => null }))

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)
}

function feedItem(id: string, extra: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    platform: 'twitter',
    author: 'alice',
    authorName: 'Alice',
    text: `post ${id}`,
    tweetUrl: `https://x.com/alice/status/${id}`,
    createdAt: '2026-08-18T00:00:00Z',
    processedAt: '2026-08-18T00:00:00Z',
    isArchived: false,
    tags: [],
    media: [],
    links: [],
    ...extra,
  } as unknown as FeedItem
}

let feedRequests: string[] = []
let tagsRequests = 0
/** Successive `/api/feed` list payloads, consumed in order. */
let feedPages: FeedItem[][] = []

beforeEach(() => {
  currentQuery = ''
  currentParamsObj = new URLSearchParams(currentQuery)
  urlListeners.clear()
  renderedItems = []
  renderedJustAddedKey = undefined
  feedRequests = []
  tagsRequests = 0
  feedPages = [[feedItem('1'), feedItem('2')]]

  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()

    if (url.startsWith('/api/feed')) {
      feedRequests.push(url)
      const items = feedPages.length > 1 ? (feedPages.shift() as FeedItem[]) : feedPages[0]
      return jsonResponse({
        items,
        stats: { total: items.length, active: items.length },
        pagination: { page: 1, totalPages: 1 },
      })
    }
    if (url.startsWith('/api/auth/me')) {
      return jsonResponse({
        authenticated: true,
        user: { id: '1', username: 'tester', displayName: 'tester', avatarUrl: null },
        identities: { x: { username: 'tester' }, email: null },
        xConnected: true,
      })
    }
    if (url.startsWith('/api/tags')) {
      tagsRequests += 1
      return jsonResponse({ tags: [] })
    }
    if (url.startsWith('/api/sync/cooldown')) {
      return jsonResponse({ canSync: true, cooldownRemaining: 0, lastSyncAt: null })
    }
    if (url.startsWith('/api/bookmarks/add')) {
      // The id the add endpoint reports must match the row the follow-up
      // `/api/feed?id=` lookup returns, or the prepend silently no-ops.
      return jsonResponse({
        success: true,
        isDuplicate: false,
        platform: 'twitter',
        bookmark: { id: 'new' },
      })
    }
    return jsonResponse({})
  }) as unknown as typeof fetch
})

async function mountGrid() {
  render(<FeedPage />)
  await waitFor(() => expect(renderedItems.length).toBeGreaterThan(0))
}

/** Fire the event `TagQuickPicker`/the grid's tag toggles dispatch. */
function dispatchTagsChanged(bookmarkId: string, tags: string[], platform = 'twitter') {
  act(() => {
    window.dispatchEvent(
      new CustomEvent('bookmark-tags-changed', { detail: { platform, bookmarkId, tags } }),
    )
  })
}

describe('AuthedHome: a tag added elsewhere lands on the card', () => {
  /**
   * THE bug: the event has always carried the post's complete new tag list,
   * and the listener ignored it — refetching only the tag COUNTS. So a tag
   * added in the theater showed there (the theater patches its own snapshot)
   * and then vanished when the overlay closed and the grid's untouched items
   * re-rendered. The tag was saved; the UI disagreed until a reload.
   */
  it('patches the affected item in place', async () => {
    await mountGrid()
    expect(renderedItems.find((i) => i.id === '1')?.tags).toEqual([])

    dispatchTagsChanged('1', ['investments'])

    await waitFor(() =>
      expect(renderedItems.find((i) => i.id === '1')?.tags).toEqual(['investments']),
    )
    // Only that one post moves.
    expect(renderedItems.find((i) => i.id === '2')?.tags).toEqual([])
  })

  it('also refreshes the tag list, which is what it used to do ONLY', async () => {
    await mountGrid()
    const before = tagsRequests
    dispatchTagsChanged('1', ['investments'])
    await waitFor(() => expect(tagsRequests).toBeGreaterThan(before))
  })

  it('removes tags too, not just adds', async () => {
    feedPages = [[feedItem('1', { tags: ['old'] }), feedItem('2')]]
    await mountGrid()
    expect(renderedItems.find((i) => i.id === '1')?.tags).toEqual(['old'])

    dispatchTagsChanged('1', [])
    await waitFor(() => expect(renderedItems.find((i) => i.id === '1')?.tags).toEqual([]))
  })

  it('matches on platform as well as id — the same numeric id exists across platforms', async () => {
    feedPages = [[feedItem('1'), feedItem('1', { platform: 'tiktok' } as Partial<FeedItem>)]]
    await mountGrid()

    dispatchTagsChanged('1', ['tagged'], 'tiktok')

    await waitFor(() => {
      const tiktok = renderedItems.find((i) => (i.platform ?? 'twitter') === 'tiktok')
      expect(tiktok?.tags).toEqual(['tagged'])
    })
    const twitter = renderedItems.find((i) => (i.platform ?? 'twitter') === 'twitter')
    expect(twitter?.tags).toEqual([])
  })

  it('ignores an event with no usable detail rather than blanking tags', async () => {
    feedPages = [[feedItem('1', { tags: ['keep'] })]]
    await mountGrid()

    act(() => {
      window.dispatchEvent(new CustomEvent('bookmark-tags-changed'))
    })

    // A dispatch without detail (a "just refresh the counts" ping) must not be
    // read as "this post now has no tags".
    await waitFor(() => expect(tagsRequests).toBeGreaterThan(0))
    expect(renderedItems.find((i) => i.id === '1')?.tags).toEqual(['keep'])
  })
})

describe('AuthedHome: pasting a link adds the post in place', () => {
  /** The paste listener is real here, so this drives the whole flow. */
  function paste(text: string) {
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
    Object.defineProperty(event, 'target', { value: window })
    act(() => {
      window.dispatchEvent(event)
    })
  }

  it('puts the new post at the top without navigating or refetching the list', async () => {
    await mountGrid()
    const requestsBefore = feedRequests.length
    // The single-item lookup that builds the card returns the new post.
    feedPages = [[feedItem('new')], feedPages[0]]

    paste('https://x.com/alice/status/999')

    await waitFor(() => expect(renderedItems[0]?.id).toBe('new'))
    // The pre-existing rows are still there — no full refetch wiped them, which
    // is why this path deliberately does not fire the feed-changed event.
    expect(renderedItems.map((i) => i.id)).toEqual(['new', '1', '2'])
    // One lookup for the added post; no page-1 reset behind it.
    expect(feedRequests.length).toBe(requestsBefore + 1)
    expect(feedRequests[feedRequests.length - 1]).toContain('id=')
  })

  /**
   * Owner: "the added notification pushes all the content down — I don't think
   * we need a specific temporary badge. Maybe just pulse the row… or have the
   * orange glow around it." So success says nothing in words: the grid is told
   * which card to glow, and no banner is added to the layout.
   */
  it('marks the new card for a glow instead of announcing it in the layout', async () => {
    await mountGrid()
    feedPages = [[feedItem('new')], feedPages[0]]

    paste('https://x.com/alice/status/999')

    await waitFor(() => expect(renderedJustAddedKey).toBe('twitter:new'))
    // No "Added" text anywhere — the card is the confirmation.
    expect(document.body.textContent).not.toMatch(/\bAdded\b/)
  })

  it('clears the glow so it does not become permanent decoration', async () => {
    vi.useFakeTimers()
    try {
      render(<FeedPage />)
      await vi.waitFor(() => expect(renderedItems.length).toBeGreaterThan(0))
      feedPages = [[feedItem('new')], feedPages[0]]

      paste('https://x.com/alice/status/999')
      await vi.waitFor(() => expect(renderedJustAddedKey).toBe('twitter:new'))

      await act(async () => {
        vi.advanceTimersByTime(3_000)
      })
      expect(renderedJustAddedKey).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does nothing for a link that is not a post', async () => {
    await mountGrid()
    const before = renderedItems.map((i) => i.id)

    // An ADHX playlist URL: no single post behind it.
    paste('https://adhx.com/t/weedauwl/investments')

    await waitFor(() => expect(renderedItems.map((i) => i.id)).toEqual(before))
  })
})

describe('AuthedHome: sync error UX', () => {
  it('preserves the in-progress SSE message instead of showing connection loss', async () => {
    MockEventSource.instances = []
    vi.stubGlobal('EventSource', MockEventSource)
    currentQuery = 'firstLogin=true'
    currentParamsObj = new URLSearchParams(currentQuery)

    try {
      render(<FeedPage />)
      await waitFor(() => expect(MockEventSource.instances).toHaveLength(1), { timeout: 2000 })

      act(() => {
        const eventSource = MockEventSource.instances[0]
        eventSource.emit('error', {
          message: SYNC_IN_PROGRESS_MESSAGE,
          code: 'in_progress',
        })
        eventSource.onerror?.(new Event('error'))
      })

      expect(await screen.findByText(SYNC_IN_PROGRESS_MESSAGE)).toBeInTheDocument()
      expect(screen.queryByText(/Connection lost/)).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
