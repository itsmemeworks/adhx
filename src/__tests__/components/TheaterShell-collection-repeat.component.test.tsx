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
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import type { FeedItem } from '@/components/feed/types'

vi.mock('@/components/theater/Stage', () => ({ Stage: () => <div data-testid="stage" /> }))

let collectionOnEnded: (() => void) | undefined
vi.mock('@/components/theater/CollectionStage', () => ({
  CollectionStage: (props: { onEnded?: () => void }) => {
    collectionOnEnded = props.onEnded
    return <div data-testid="collection-stage" />
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
    collectionOnEnded = undefined
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

    await act(async () => collectionOnEnded?.())
    expect(chromeProps().currentKey).toBe('twitter:2')

    await act(async () => collectionOnEnded?.())
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
})
