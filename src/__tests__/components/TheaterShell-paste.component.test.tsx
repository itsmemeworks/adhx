/**
 * @vitest-environment jsdom
 *
 * Personal theater paste: add the post in place and stay on Live /
 * Saved. Never `location.assign` to a preview page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, act, waitFor, screen } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import type { FeedItem } from '@/components/feed/types'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'

vi.mock('@/components/theater/Stage', () => ({ Stage: () => <div data-testid="stage" /> }))

let capturedOnPastePost: ((url: string) => boolean | Promise<boolean>) | undefined
const mockMobileChrome = vi.fn((_props: Record<string, unknown>) => null)
vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: (props: { onPastePost?: (url: string) => boolean | Promise<boolean> }) => {
    capturedOnPastePost = props.onPastePost
    return null
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
    const [items, setItems] = useState(seed.items)
    return {
      items,
      savedToday: 0,
      recentActivity: 0,
      freshKeys: new Set<string>(),
      prependItem: (item: TheaterItem) => setItems((prev) => [item, ...prev]),
    }
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
    author: `author${bookmarkId}`,
    url: `/author${bookmarkId}/status/${bookmarkId}`,
    createdAt: '2026-08-18T00:00:00Z',
    contentType: 'text',
    text: `post ${bookmarkId}`,
    trendCount: 0,
  } as TheaterItem
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

function videoFeedItem(id: string): FeedItem {
  return feedItem(id, {
    media: [{ id: `m${id}`, mediaType: 'video', url: 'x', thumbnailUrl: 'x', shareUrl: 'x' }],
  } as Partial<FeedItem>)
}

function chromeProps() {
  const call = mockMobileChrome.mock.calls.at(-1)
  if (!call) throw new Error('chrome never rendered')
  return call[0] as {
    current?: TheaterItem | null
    currentKey?: string | null
    items?: { bookmarkId?: string; id?: string }[]
    queueTypes?: unknown
    onCycleRepeat?: () => void
    onNext?: () => void
    onPastePost?: (url: string) => boolean | Promise<boolean>
  }
}

const seed = (items: TheaterItem[]): TheaterFeedSeed => ({
  items,
  savedToday: 0,
  recentActivity: 0,
})

describe('TheaterShell: personal paste adds in place', () => {
  beforeEach(() => {
    capturedOnPastePost = undefined
    mockMobileChrome.mockClear()
    window.localStorage.clear()
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/bookmarks/add')) {
        return {
          ok: true,
          json: async () => ({ platform: 'twitter', bookmark: { id: '99' } }),
        }
      }
      if (url.includes('/api/feed')) {
        return { ok: true, json: async () => ({ items: [feedItem('99')] }) }
      }
      return { ok: true, json: async () => ({ items: [] }) }
    }) as never
  })

  it('POSTs add and does not navigate away from Live', async () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignSpy },
      writable: true,
    })

    await act(async () => {
      render(
        <TheaterShell
          seed={seed([textItem('1')])}
          mode="personal"
          initialPersonalTab="live"
          personalItems={[feedItem('1')]}
          onClose={vi.fn()}
        />,
      )
    })

    expect(capturedOnPastePost).toEqual(expect.any(Function))
    await act(async () => {
      await capturedOnPastePost!('https://x.com/alice/status/99')
    })

    const addCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) =>
      String(url).includes('/api/bookmarks/add'),
    )
    expect(addCalls).toHaveLength(1)
    expect(JSON.parse(String((addCalls[0][1] as RequestInit).body))).toEqual({
      url: 'https://x.com/alice/status/99',
      source: 'manual',
    })
    expect(assignSpy).not.toHaveBeenCalled()
    await waitFor(() => expect(chromeProps().currentKey).toBe('twitter:99'))
  })

  it('stages resolving feedback immediately on desktop and mobile, then installs the saved row', async () => {
    let finishAdd!: (value: {
      ok: boolean
      json: () => Promise<{ platform: string; bookmark: { id: string } }>
    }) => void
    const addResponse = new Promise<{
      ok: boolean
      json: () => Promise<{ platform: string; bookmark: { id: string } }>
    }>((resolve) => {
      finishAdd = resolve
    })
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/bookmarks/add')) return addResponse
      if (url.includes('/api/feed')) {
        return { ok: true, json: async () => ({ items: [feedItem('99')] }) }
      }
      return { ok: true, json: async () => ({ items: [] }) }
    }) as never

    await act(async () => {
      render(
        <TheaterShell
          seed={seed([textItem('1')])}
          mode="personal"
          initialPersonalTab="live"
          personalItems={[feedItem('1')]}
          onClose={vi.fn()}
        />,
      )
    })

    let result!: Promise<boolean>
    await act(async () => {
      result = Promise.resolve(capturedOnPastePost!('https://x.com/alice/status/99'))
      await Promise.resolve()
    })

    expect(screen.getByTestId('stage-resolving')).toBeInTheDocument()
    expect(chromeProps().currentKey).toBe('twitter:99')
    expect(chromeProps().current).toBeNull()
    expect(chromeProps().onPastePost).toBe(capturedOnPastePost)

    finishAdd({
      ok: true,
      json: async () => ({ platform: 'twitter', bookmark: { id: '99' } }),
    })
    await act(async () => {
      await result
    })

    await waitFor(() => expect(screen.queryByTestId('stage-resolving')).not.toBeInTheDocument())
    expect(chromeProps().currentKey).toBe('twitter:99')
    expect(chromeProps().current?.bookmarkId).toBe('99')
  })

  it('removes a failed resolving stub and restores the untouched current post', async () => {
    let finishAdd!: (value: { ok: boolean; json: () => Promise<{ error: string }> }) => void
    const addResponse = new Promise<{
      ok: boolean
      json: () => Promise<{ error: string }>
    }>((resolve) => {
      finishAdd = resolve
    })
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/bookmarks/add')) return addResponse
      return { ok: true, json: async () => ({ items: [] }) }
    }) as never

    await act(async () => {
      render(
        <TheaterShell
          seed={seed([textItem('1')])}
          mode="personal"
          initialPersonalTab="live"
          personalItems={[feedItem('1')]}
          onClose={vi.fn()}
        />,
      )
    })
    expect(chromeProps().currentKey).toBe('twitter:1')

    let result!: Promise<boolean>
    await act(async () => {
      result = Promise.resolve(capturedOnPastePost!('https://x.com/alice/status/99'))
      await Promise.resolve()
    })
    expect(screen.getByTestId('stage-resolving')).toBeInTheDocument()
    expect(chromeProps().currentKey).toBe('twitter:99')

    finishAdd({ ok: false, json: async () => ({ error: 'upstream unavailable' }) })
    await act(async () => {
      expect(await result).toBe(false)
    })

    await waitFor(() => expect(screen.queryByTestId('stage-resolving')).not.toBeInTheDocument())
    expect(chromeProps().currentKey).toBe('twitter:1')
    expect((chromeProps().items ?? []).map((item) => item.bookmarkId ?? item.id)).toEqual(['1'])
  })

  it('POSTs add and does not navigate away from Saved', async () => {
    const assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: assignSpy },
      writable: true,
    })

    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[feedItem('1')]}
          onClose={vi.fn()}
        />,
      )
    })

    await act(async () => {
      await capturedOnPastePost!('https://x.com/alice/status/99')
    })

    await waitFor(() => {
      expect(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) =>
          String(url).includes('/api/bookmarks/add'),
        ),
      ).toBe(true)
    })
    expect(assignSpy).not.toHaveBeenCalled()
  })

  it('resets a type filter to All when the pasted post is a different type', async () => {
    window.localStorage.setItem('adhx-theater-types', JSON.stringify(['text']))
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/bookmarks/add')) {
        return {
          ok: true,
          json: async () => ({ platform: 'twitter', bookmark: { id: '99' } }),
        }
      }
      if (url.includes('/api/feed')) {
        return { ok: true, json: async () => ({ items: [videoFeedItem('99')] }) }
      }
      return { ok: true, json: async () => ({ items: [] }) }
    }) as never

    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[feedItem('1')]}
          onClose={vi.fn()}
        />,
      )
    })
    expect(chromeProps().queueTypes).toEqual(['text'])

    await act(async () => {
      await capturedOnPastePost!('https://x.com/alice/status/99')
    })

    expect(chromeProps().queueTypes).toEqual([])
    const items = (chromeProps().items ?? []) as { bookmarkId?: string; id?: string }[]
    const ids = items.map((i) => i.bookmarkId ?? i.id)
    expect(ids).toContain('99')
    expect(chromeProps().currentKey).toBe('twitter:99')
  })

  it('Saved paste mid-play takes the stage; the interrupted post is Next', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[feedItem('1'), feedItem('2'), feedItem('3')]}
          onClose={vi.fn()}
        />,
      )
    })
    expect(chromeProps().currentKey).toBe('twitter:1')

    await act(async () => {
      await capturedOnPastePost!('https://x.com/alice/status/99')
    })

    expect(chromeProps().currentKey).toBe('twitter:99')
    const items = (chromeProps().items ?? []) as { bookmarkId?: string; id?: string }[]
    expect(items.map((i) => i.bookmarkId ?? i.id)).toEqual(['99', '1', '2', '3'])
  })

  it('Saved paste on All Clear plays the new save immediately', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[feedItem('1')]}
          onClose={vi.fn()}
        />,
      )
    })
    const cycle = chromeProps().onCycleRepeat
    const onNext = chromeProps().onNext
    if (!cycle || !onNext) throw new Error('repeat/next control missing')
    await act(async () => cycle())
    await act(async () => cycle())
    await act(async () => onNext())
    expect(screen.getByText('All caught up')).toBeInTheDocument()

    await act(async () => {
      await capturedOnPastePost!('https://x.com/alice/status/99')
    })

    expect(screen.queryByText('All caught up')).not.toBeInTheDocument()
    expect(chromeProps().currentKey).toBe('twitter:99')
  })

  it('keeps a Videos filter when the pasted post is a video', async () => {
    window.localStorage.setItem('adhx-theater-types', JSON.stringify(['video']))
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/bookmarks/add')) {
        return {
          ok: true,
          json: async () => ({ platform: 'twitter', bookmark: { id: '99' } }),
        }
      }
      if (url.includes('/api/feed')) {
        return { ok: true, json: async () => ({ items: [videoFeedItem('99')] }) }
      }
      return { ok: true, json: async () => ({ items: [] }) }
    }) as never

    await act(async () => {
      render(
        <TheaterShell
          seed={seed([])}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[videoFeedItem('1')]}
          onClose={vi.fn()}
        />,
      )
    })
    expect(chromeProps().queueTypes).toEqual(['video'])

    await act(async () => {
      await capturedOnPastePost!('https://x.com/alice/status/99')
    })

    expect(chromeProps().queueTypes).toEqual(['video'])
  })

  it('does not pass onPastePost in shared mode (preview still navigates)', async () => {
    const item = textItem('1')
    await act(async () => {
      render(<TheaterShell seed={seed([item])} mode="shared" sharedItem={item} />)
    })
    expect(capturedOnPastePost).toBeUndefined()
  })
})
