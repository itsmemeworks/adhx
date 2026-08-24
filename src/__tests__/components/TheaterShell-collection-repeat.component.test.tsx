/**
 * @vitest-environment jsdom
 *
 * `/collection` used to hide the repeat control (`repeatEnabled = !isCollectionTab`)
 * and video-end always walked off the end of the queue. The control is the
 * same off → all → one switch as Live; playback wrapping is
 * `personalAdvanceOnEndedIndex`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, act, screen, fireEvent } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { theaterItemKey, type TheaterFeedSeed, type TheaterItem } from '@/components/theater/types'
import type { FeedItem } from '@/components/feed/types'

let stageOnEnded: (() => void) | undefined
vi.mock('@/components/theater/Stage', () => ({
  Stage: (props: { onEnded?: () => void }) => {
    stageOnEnded = props.onEnded
    return <div data-testid="stage" />
  },
}))

const mockMobileChrome = vi.fn((_props: Record<string, unknown>) => null)
vi.mock('@/components/theater/TheaterMobileChrome', () => ({
  TheaterMobileChrome: (props: Record<string, unknown>) => {
    mockMobileChrome(props)
    return null
  },
}))

vi.mock('@/components/theater/TheaterDesktopChrome', () => ({
  DesktopStageChrome: () => null,
  DesktopDock: () => null,
}))

vi.mock('@/components/auth', () => ({
  SignInModal: () => null,
  useAuthMe: () => ({ me: null, loading: false, refresh: vi.fn() }),
}))

vi.mock('@/components/tags', () => ({ TagQuickPicker: () => null }))

vi.mock('@/components/theater/useTheaterFeed', () => ({
  useTheaterFeed: (seed: TheaterFeedSeed) => {
    const [items] = useState(seed.items)
    return { items, savedToday: 0, recentActivity: 0, freshKeys: new Set<string>() }
  },
}))

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

const emptySeed: TheaterFeedSeed = { items: [] as TheaterItem[], savedToday: 0, recentActivity: 0 }

function chromeProps() {
  const call = mockMobileChrome.mock.calls.at(-1)
  if (!call) throw new Error('mobile chrome never rendered')
  return call[0]
}

async function cycleRepeat() {
  const cycle = chromeProps().onCycleRepeat as (() => void) | undefined
  if (!cycle) throw new Error('repeat control not offered')
  await act(async () => cycle())
}

describe('TheaterShell: collection tab has the repeat control', () => {
  beforeEach(() => {
    mockMobileChrome.mockClear()
    stageOnEnded = undefined
    window.localStorage.clear()
  })

  it('offers the repeat button on /collection', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={emptySeed}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[feedItem('1'), feedItem('2')]}
          onClose={vi.fn()}
        />,
      )
    })
    expect(chromeProps().repeatMode).toBe('off')
    expect(typeof chromeProps().onCycleRepeat).toBe('function')
  })

  it('wraps to the first post when a video ends on the last item in repeat-all', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={emptySeed}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[feedItem('1'), feedItem('2')]}
          onClose={vi.fn()}
        />,
      )
    })
    await cycleRepeat() // off -> all
    expect(chromeProps().repeatMode).toBe('all')
    expect(chromeProps().currentKey).toBe('twitter:1')

    await act(async () => stageOnEnded?.())
    expect(chromeProps().currentKey).toBe('twitter:2')

    await act(async () => stageOnEnded?.())
    expect(chromeProps().currentKey).toBe('twitter:1')
    expect(screen.queryByText('All caught up')).not.toBeInTheDocument()
  })

  it('Keep playing on All Clear restarts the queue in repeat-all', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={emptySeed}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[feedItem('1')]}
          onClose={vi.fn()}
        />,
      )
    })
    const onNext = chromeProps().onNext as () => void
    await act(async () => onNext())
    expect(screen.getByText('All caught up')).toBeInTheDocument()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Keep playing' })))
    expect(screen.queryByText('All caught up')).not.toBeInTheDocument()
    expect(chromeProps().currentKey).toBe('twitter:1')
    expect(chromeProps().repeatMode).toBe('all')
  })

  it('advances a timed post via theater-advance and wraps in repeat-all', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={emptySeed}
          mode="personal"
          initialPersonalTab="collection"
          personalItems={[feedItem('1'), feedItem('2')]}
          onClose={vi.fn()}
        />,
      )
    })
    await cycleRepeat() // off -> all
    expect(chromeProps().currentKey).toBe('twitter:1')

    await act(async () => {
      window.dispatchEvent(new CustomEvent('theater-advance'))
    })
    expect(chromeProps().currentKey).toBe('twitter:2')

    await act(async () => {
      window.dispatchEvent(new CustomEvent('theater-advance'))
    })
    expect(chromeProps().currentKey).toBe('twitter:1')
    expect(screen.queryByText('All caught up')).not.toBeInTheDocument()
  })
})

function liveText(bookmarkId: string): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId,
    author: `author${bookmarkId}`,
    url: `/author${bookmarkId}/status/${bookmarkId}`,
    createdAt: '2026-08-18T00:00:00Z',
    contentType: 'text',
    text: `live ${bookmarkId}`,
    trendCount: 0,
  } as TheaterItem
}

describe('TheaterShell: collection is not the live waiting stage', () => {
  beforeEach(() => {
    mockMobileChrome.mockClear()
    stageOnEnded = undefined
    window.localStorage.clear()
  })

  it('does not pause or swallow Space when every live seed post is already seen', async () => {
    const live = [liveText('seen1'), liveText('seen2')]
    window.localStorage.setItem('adhx-seen-v1', JSON.stringify(live.map(theaterItemKey)))
    const pauseHeard = vi.fn()
    const toggleHeard = vi.fn()
    window.addEventListener('theater-pause', pauseHeard)
    window.addEventListener('theater-toggle-play', toggleHeard)
    try {
      await act(async () => {
        render(
          <TheaterShell
            seed={{ items: live, savedToday: 0, recentActivity: 0 }}
            mode="personal"
            initialPersonalTab="collection"
            personalItems={[feedItem('c1')]}
            onClose={vi.fn()}
          />,
        )
      })

      expect(screen.getByTestId('stage')).toBeInTheDocument()
      expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()
      expect(pauseHeard).not.toHaveBeenCalled()

      await act(async () => {
        fireEvent.keyDown(window, { key: ' ' })
      })
      expect(toggleHeard).toHaveBeenCalled()
    } finally {
      window.removeEventListener('theater-pause', pauseHeard)
      window.removeEventListener('theater-toggle-play', toggleHeard)
    }
  })
})
