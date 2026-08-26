/**
 * @vitest-environment jsdom
 *
 * Live type filter vs preview pulses (the 12s /api/activity poll). A new
 * video must join a Videos queue; a text preview must not, and must not
 * auto-play the caught-up stage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, act, screen } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'
import type { ContentType } from '@/components/matter'

vi.mock('@/components/theater/Stage', () => ({
  Stage: () => <div data-testid="stage" />,
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

vi.mock('@/components/tags', () => ({
  TagQuickPicker: () => null,
}))

let pushArrival: ((item: TheaterItem) => void) | null = null
vi.mock('@/components/theater/useTheaterFeed', () => ({
  useTheaterFeed: (seed: TheaterFeedSeed) => {
    const [items, setItems] = useState(seed.items)
    const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set())
    pushArrival = (item: TheaterItem) => {
      setItems((prev) => [item, ...prev])
      setFreshKeys((prev) => new Set(prev).add(theaterItemKey(item)))
    }
    return {
      items,
      savedToday: seed.savedToday,
      recentActivity: seed.recentActivity,
      freshKeys,
    }
  },
}))

function item(bookmarkId: string, extra: Partial<TheaterItem> = {}): TheaterItem {
  return {
    action: 'preview',
    platform: 'twitter',
    bookmarkId,
    author: `author${bookmarkId}`,
    url: `/author${bookmarkId}/status/${bookmarkId}`,
    createdAt: '2026-08-18T00:00:00Z',
    addedAt: '2026-08-18T00:00:00Z',
    text: `post ${bookmarkId}`,
    trendCount: 0,
    ...extra,
  } as TheaterItem
}

function seed(items: TheaterItem[]): TheaterFeedSeed {
  return { items, savedToday: 0, recentActivity: 0 }
}

function chromeProps() {
  const call = mockMobileChrome.mock.calls.at(-1)
  if (!call) throw new Error('mobile chrome never rendered')
  return call[0]
}

function ids(): string[] {
  return (chromeProps().items as TheaterItem[])
    .map((it) => it.bookmarkId)
    .filter((id): id is string => typeof id === 'string')
}

async function tapType(type: ContentType) {
  const toggle = chromeProps().onToggleQueueType as ((t: ContentType) => void) | undefined
  if (!toggle) throw new Error('queue filter not offered')
  await act(async () => toggle(type))
}

describe('TheaterShell: Live filter vs preview pulses', () => {
  beforeEach(() => {
    pushArrival = null
    mockMobileChrome.mockClear()
    window.localStorage.clear()
  })

  it('drops a text preview from a Videos queue and keeps the current post', async () => {
    const video = item('v1', { contentType: 'video' })
    render(
      <TheaterShell
        seed={seed([
          video,
          item('t1', { contentType: 'text' }),
          item('v2', { contentType: 'video' }),
        ])}
      />,
    )
    await tapType('video')
    expect(ids()).toEqual(['v1', 'v2'])
    expect(chromeProps().currentKey).toBe(theaterItemKey(video))

    await act(async () =>
      pushArrival?.(
        item('preview-text', { contentType: 'text', createdAt: '2026-08-19T00:00:00Z' }),
      ),
    )
    expect(ids()).toEqual(['v1', 'v2'])
    expect(chromeProps().currentKey).toBe(theaterItemKey(video))
  })

  it('prepends a matching video preview without leaving the current post', async () => {
    const video = item('v1', { contentType: 'video' })
    render(<TheaterShell seed={seed([video, item('v2', { contentType: 'video' })])} />)
    await tapType('video')
    expect(chromeProps().currentKey).toBe(theaterItemKey(video))

    const arrival = item('preview-video', {
      contentType: 'video',
      createdAt: '2026-08-19T00:00:00Z',
    })
    await act(async () => pushArrival?.(arrival))
    expect(ids()).toEqual(['v1', 'preview-video', 'v2'])
    expect(chromeProps().currentKey).toBe(theaterItemKey(video))
  })

  it('does not auto-play a filtered-out preview from the caught-up stage', async () => {
    const videos = [item('v1', { contentType: 'video' }), item('v2', { contentType: 'video' })]
    window.localStorage.setItem('adhx-theater-types', '["video"]')
    window.localStorage.setItem('adhx-seen-v1', JSON.stringify(videos.map(theaterItemKey)))
    await act(async () => {
      render(<TheaterShell seed={seed([...videos, item('t1', { contentType: 'text' })])} />)
    })
    expect(chromeProps().queueTypes).toEqual(['video'])
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()

    await act(async () =>
      pushArrival?.(
        item('preview-text', { contentType: 'text', createdAt: '2026-08-19T00:00:00Z' }),
      ),
    )
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()
    expect(ids()).toEqual(['v1', 'v2'])

    const arrival = item('preview-video', {
      contentType: 'video',
      createdAt: '2026-08-19T01:00:00Z',
    })
    await act(async () => pushArrival?.(arrival))
    expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()
    expect(chromeProps().currentKey).toBe(theaterItemKey(arrival))
    expect(ids()[0]).toBe('preview-video')
  })
})
