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
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'

vi.mock('@/components/theater/Stage', () => ({ Stage: () => <div data-testid="stage" /> }))

let captured: {
  articleMode?: boolean
  onToggleArticleMode?: () => void
  onNext?: () => void
} = {}

vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: (props: {
    articleMode?: boolean
    onToggleArticleMode?: () => void
    onNext?: () => void
  }) => {
    captured = {
      articleMode: props.articleMode,
      onToggleArticleMode: props.onToggleArticleMode,
      onNext: props.onNext,
    }
    return null
  },
  DesktopDock: (props: { onNext?: () => void }) => {
    captured.onNext = props.onNext ?? captured.onNext
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
  useAuthMe: () => ({ me: { authenticated: false }, loading: false, refresh: vi.fn() }),
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
      window.dispatchEvent(
        new CustomEvent('tweet-added', {
          detail: {
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
            },
          },
        }),
      )
    })
    expect(captured.articleMode).toBe(true)
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
