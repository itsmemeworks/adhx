/**
 * @vitest-environment jsdom
 *
 * Shared-preview pages pass a URL stub + a resolve Promise so ADHX chrome
 * paints before FxTwitter. Tweets hide the stage until that Promise settles;
 * Reels/TikTok/Shorts are already video and play immediately.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, act, screen, waitFor } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import type { SharedResolveResult } from '@/lib/theater/shared-resolve'

vi.mock('@/components/theater/Stage', () => ({
  Stage: () => <div data-testid="stage" />,
}))
vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: () => null,
  DesktopDock: () => null,
}))
vi.mock('@/components/theater/TheaterMobileChrome', () => ({
  TheaterMobileChrome: () => null,
}))
vi.mock('@/components/tags', () => ({ TagQuickPicker: () => null }))
vi.mock('@/components/auth', () => ({
  SignInModal: () => null,
  useAuthMe: () => ({ me: null, loading: false, refresh: vi.fn() }),
}))

vi.mock('@/components/theater/useTheaterFeed', () => ({
  useTheaterFeed: (seed: TheaterFeedSeed) => {
    const [items, setItems] = useState(seed.items)
    return {
      items,
      savedToday: 0,
      recentActivity: 0,
      freshKeys: new Set<string>(),
      prependItem: () => undefined,
      replaceItem: (item: TheaterItem) => {
        setItems((prev) =>
          prev.map((existing) => (existing.bookmarkId === item.bookmarkId ? item : existing)),
        )
      },
    }
  },
}))

function seed(items: TheaterItem[]): TheaterFeedSeed {
  return { items, savedToday: 0, recentActivity: 0 }
}

function tweetStub(): TheaterItem {
  return {
    action: 'preview',
    platform: 'twitter',
    bookmarkId: '123',
    author: 'naval',
    url: 'https://x.com/naval/status/123',
    createdAt: '2026-08-24T00:00:00Z',
    contentType: 'text',
    text: null,
  }
}

function reelStub(): TheaterItem {
  return {
    action: 'preview',
    platform: 'instagram',
    bookmarkId: 'abc',
    author: 'instagram',
    url: 'https://www.instagram.com/reel/abc/',
    createdAt: '2026-08-24T00:00:00Z',
    contentType: 'video',
  }
}

describe('TheaterShell sharedResolve', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('shows StageResolving for a tweet stub until FxTwitter settles', async () => {
    const item = tweetStub()
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([item])}
          mode="shared"
          sharedItem={item}
          sharedResolve={new Promise(() => {})}
        />,
      )
    })
    const resolving = screen.getByTestId('stage-resolving')
    expect(resolving).toBeInTheDocument()
    expect(resolving.querySelector('img')).toHaveAttribute('src', '/gob-loader.svg')
    expect(screen.getByText('grabbing it…')).toBeInTheDocument()
    expect(screen.queryByTestId('stage')).not.toBeInTheDocument()
  })

  it('does not block a Reel/TikTok/Short stub — those are already video', async () => {
    const item = reelStub()
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([item])}
          mode="shared"
          sharedItem={item}
          sharedResolve={new Promise(() => {})}
        />,
      )
    })
    expect(screen.getByTestId('stage')).toBeInTheDocument()
    expect(screen.queryByTestId('stage-resolving')).not.toBeInTheDocument()
  })

  it('swaps in StageUnavailable when the tweet resolve misses', async () => {
    const item = tweetStub()
    let settle!: (result: SharedResolveResult) => void
    const sharedResolve = new Promise<SharedResolveResult>((resolve) => {
      settle = resolve
    })
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([item])}
          mode="shared"
          sharedItem={item}
          sharedResolve={sharedResolve}
        />,
      )
    })
    expect(screen.getByTestId('stage-resolving')).toBeInTheDocument()
    await act(async () => {
      settle({ ok: false })
    })
    await waitFor(() => {
      expect(screen.queryByTestId('stage-resolving')).not.toBeInTheDocument()
    })
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument()
  })
})
