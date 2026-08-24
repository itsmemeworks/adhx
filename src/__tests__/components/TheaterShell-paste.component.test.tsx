/**
 * @vitest-environment jsdom
 *
 * Personal theater paste: add the post in place and stay on Live /
 * My Collection. Never `location.assign` to a preview page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import type { FeedItem } from '@/components/feed/types'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'

vi.mock('@/components/theater/Stage', () => ({ Stage: () => <div data-testid="stage" /> }))
vi.mock('@/components/theater/CollectionStage', () => ({
  CollectionStage: () => <div data-testid="collection-stage" />,
  useInstagramStage: () => ({ status: 'idle', slow: false, src: null, poster: null }),
}))

let capturedOnPastePost: ((url: string) => boolean | Promise<boolean>) | undefined
vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: (props: { onPastePost?: (url: string) => boolean | Promise<boolean> }) => {
    capturedOnPastePost = props.onPastePost
    return null
  },
  DesktopDock: () => null,
}))
vi.mock('@/components/theater/TheaterMobileChrome', () => ({
  TheaterMobileChrome: () => null,
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

function feedItem(id: string): FeedItem {
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
  } as unknown as FeedItem
}

const seed = (items: TheaterItem[]): TheaterFeedSeed => ({
  items,
  savedToday: 0,
  recentActivity: 0,
})

describe('TheaterShell: personal paste adds in place', () => {
  beforeEach(() => {
    capturedOnPastePost = undefined
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
  })

  it('POSTs add and does not navigate away from My Collection', async () => {
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

  it('does not pass onPastePost in shared mode (preview still navigates)', async () => {
    const item = textItem('1')
    await act(async () => {
      render(<TheaterShell seed={seed([item])} mode="shared" sharedItem={item} />)
    })
    expect(capturedOnPastePost).toBeUndefined()
  })
})
