/**
 * @vitest-environment jsdom
 *
 * articleMode is owned by the shell and must reset when the current item
 * changes — otherwise Watch leaks onto the next post.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { act, render } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import type { PersonalTab, TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import {
  notifyCollectionChanged,
  resetClientEventBridgeForTests,
  setClientEventAccount,
} from '@/lib/client-events'

vi.mock('@/components/theater/Stage', () => ({ Stage: () => <div data-testid="stage" /> }))

const authState = vi.hoisted(() => ({
  current: {
    me: { authenticated: false } as {
      authenticated: boolean
      user?: { id: string }
    },
    loading: false,
    refresh: vi.fn(),
  },
}))

let captured: {
  articleMode?: boolean
  onToggleArticleMode?: () => void
  onNext?: () => void
  onTabChange?: (tab: PersonalTab) => void
  itemKeys?: string[]
} = {}

vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: (props: {
    articleMode?: boolean
    onToggleArticleMode?: () => void
    onNext?: () => void
    collection?: { onTabChange: (tab: PersonalTab) => void }
  }) => {
    captured = {
      articleMode: props.articleMode,
      onToggleArticleMode: props.onToggleArticleMode,
      onNext: props.onNext,
      onTabChange: props.collection?.onTabChange,
      itemKeys: captured.itemKeys,
    }
    return null
  },
  DesktopDock: (props: { onNext?: () => void; items?: TheaterItem[] }) => {
    captured.onNext = props.onNext ?? captured.onNext
    captured.itemKeys = props.items?.map(
      (item) => `${item.platform ?? 'twitter'}:${item.bookmarkId}`,
    )
    return null
  },
}))
vi.mock('@/components/theater/TheaterMobileChrome', () => ({
  TheaterMobileChrome: () => null,
}))
vi.mock('@/components/tags', () => ({ TagQuickPicker: () => null }))
vi.mock('@/components/theater/useTheaterFeed', () => ({
  useTheaterFeed: (seed: TheaterFeedSeed) => {
    const [items] = useState(seed.items)
    return {
      items,
      savedToday: 0,
      recentActivity: 0,
      freshKeys: new Set<string>(),
      prependItem: () => undefined,
    }
  },
}))
vi.mock('@/components/auth', () => ({
  SignInModal: () => null,
  useAuthMe: () => authState.current,
}))

function videoItem(bookmarkId: string): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId,
    author: `author${bookmarkId}`,
    url: `/author${bookmarkId}/status/${bookmarkId}`,
    createdAt: '2026-08-18T00:00:00Z',
    contentType: 'video',
    text: `caption ${bookmarkId}`,
    quote: { author: 'bob', text: 'quoted' },
    trendCount: 0,
  } as TheaterItem
}

const seed = (items: TheaterItem[]): TheaterFeedSeed => ({
  items,
  savedToday: 0,
  recentActivity: 0,
})

describe('TheaterShell: articleMode reset', () => {
  beforeEach(() => {
    captured = {}
    window.localStorage.clear()
    resetClientEventBridgeForTests()
    authState.current = {
      me: { authenticated: false },
      loading: false,
      refresh: vi.fn(),
    }
  })

  it('clears article mode when advancing to the next post', async () => {
    await act(async () => {
      render(<TheaterShell seed={seed([videoItem('1'), videoItem('2')])} mode="home" />)
    })

    expect(captured.onToggleArticleMode).toEqual(expect.any(Function))
    expect(captured.articleMode).toBe(false)

    await act(async () => {
      captured.onToggleArticleMode?.()
    })
    expect(captured.articleMode).toBe(true)

    await act(async () => {
      captured.onNext?.()
    })
    expect(captured.articleMode).toBe(false)
  })

  it('does not clear Read when a Saved prepend bumps personalIndex on Live', async () => {
    authState.current = {
      me: { authenticated: true, user: { id: 'user-a' } },
      loading: false,
      refresh: vi.fn(),
    }
    setClientEventAccount('user-a', { broadcast: false })
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([videoItem('1'), videoItem('2')])}
          mode="personal"
          initialPersonalTab="live"
          personalItems={[
            {
              id: 's1',
              platform: 'twitter',
              author: 'a',
              authorName: 'A',
              text: 'saved',
              tweetUrl: 'https://x.com/a/status/s1',
              createdAt: '2026-08-18T00:00:00Z',
              processedAt: '2026-08-18T00:00:00Z',
              isArchived: false,
              tags: [],
              media: [],
              links: [],
            } as never,
          ]}
          onClose={vi.fn()}
        />,
      )
    })
    await act(async () => {
      captured.onToggleArticleMode?.()
    })
    expect(captured.articleMode).toBe(true)

    await act(async () => {
      notifyCollectionChanged({
        added: {
          id: 's0',
          platform: 'twitter',
          author: 'b',
          authorName: 'B',
          text: 'new',
          tweetUrl: 'https://x.com/b/status/s0',
          createdAt: '2026-08-18T00:00:00Z',
          processedAt: '2026-08-18T00:00:00Z',
          isArchived: false,
          tags: [],
          media: [],
          links: [],
        } as never,
      })
    })
    expect(captured.articleMode).toBe(true)

    await act(async () => {
      captured.onTabChange?.('collection')
    })
    expect(captured.itemKeys).toContain('twitter:s0')
  })

  it('isolates the stage so Read video stays under chrome', async () => {
    let view: ReturnType<typeof render> | undefined
    await act(async () => {
      view = render(<TheaterShell seed={seed([videoItem('1')])} mode="home" />)
    })
    const stage = view!.getByTestId('theater-stage')
    expect(stage.className).toMatch(/\bisolate\b/)
    expect(stage.className).toMatch(/\bz-0\b/)
  })
})
