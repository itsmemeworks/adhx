/**
 * @vitest-environment jsdom
 *
 * Live / Saved playlist is a LIFO queue: newest-first by ADHX addedAt,
 * unseen-only unless Repeat is on, new posts go to the top (play now if
 * caught up, else Next). Queue sections are Now playing + Next.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'

const mockStage = vi.fn((_props: Record<string, unknown>) => null)
vi.mock('@/components/theater/Stage', () => ({
  Stage: (props: { item: TheaterItem | null; onEnded?: () => void }) => {
    mockStage(props as unknown as Record<string, unknown>)
    return <div data-testid="stage" data-item-key={props.item ? theaterItemKey(props.item) : ''} />
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

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

function textItem(bookmarkId: string, addedHoursAgo = Number(bookmarkId) || 1): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId,
    author: `author${bookmarkId}`,
    url: `/author${bookmarkId}/status/${bookmarkId}`,
    createdAt: hoursAgo(addedHoursAgo),
    addedAt: hoursAgo(addedHoursAgo),
    contentType: 'text',
    text: `post ${bookmarkId}`,
    trendCount: 0,
  } as TheaterItem
}

function seed(items: TheaterItem[]): TheaterFeedSeed {
  return { items, savedToday: 0, recentActivity: 0 }
}

function chromeProps() {
  const props = mockMobileChrome.mock.calls.at(-1)![0] as {
    items: TheaterItem[]
    currentKey: string | null
    queuePlayed?: number
    queueToPlay?: number
    queueLooping?: boolean
    queueTotal?: number
    onNext?: () => void
    onCycleRepeat?: () => void
    isSeen?: (key: string) => boolean
  }
  return props
}

function markWatched(items: TheaterItem[]) {
  window.localStorage.setItem('adhx-seen-v1', JSON.stringify(items.map(theaterItemKey)))
}

async function endCurrent() {
  const onEnded = (mockStage.mock.calls.at(-1)![0] as { onEnded?: () => void }).onEnded
  if (!onEnded) throw new Error('stage has no onEnded')
  await act(async () => onEnded())
}

describe('TheaterShell LIFO queue', () => {
  beforeEach(() => {
    pushArrival = null
    mockMobileChrome.mockClear()
    mockStage.mockClear()
    window.localStorage.clear()
  })

  it('loads newest-first and only unseen posts', async () => {
    const older = textItem('old', 10)
    const newer = textItem('new', 1)
    const seen = textItem('seen', 4)
    markWatched([seen])
    await act(async () => {
      render(<TheaterShell seed={seed([older, seen, newer])} />)
    })
    expect(chromeProps().items.map((i) => i.bookmarkId)).toEqual(['new', 'old', 'seen'])
    expect(chromeProps().currentKey).toBe('twitter:new')
    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(2)
    expect(chromeProps().queueLooping).toBe(false)
  })

  it('plays a caught-up arrival immediately as 1 in queue', async () => {
    markWatched([textItem('1', 2), textItem('2', 3)])
    await act(async () => {
      render(<TheaterShell seed={seed([textItem('1', 2), textItem('2', 3)])} />)
    })
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()
    expect(chromeProps().queueToPlay).toBe(0)

    await act(async () => pushArrival?.(textItem('fresh', 0)))
    expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()
    expect(chromeProps().currentKey).toBe('twitter:fresh')
    expect(chromeProps().items.map((i) => i.bookmarkId)).toEqual(['fresh', '1', '2'])
    expect(chromeProps().queueToPlay).toBe(1)
  })

  it('a second caught-up arrival is still 1 in queue', async () => {
    markWatched([textItem('1', 2), textItem('2', 3)])
    await act(async () => {
      render(<TheaterShell seed={seed([textItem('1', 2), textItem('2', 3)])} />)
    })
    await act(async () => pushArrival?.(textItem('fresh-a', 0)))
    await endCurrent()
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()

    await act(async () => pushArrival?.(textItem('fresh-b', 0)))
    expect(chromeProps().currentKey).toBe('twitter:fresh-b')
    expect(chromeProps().queueToPlay).toBe(1)
    expect(chromeProps().items[0]?.bookmarkId).toBe('fresh-b')
    expect(chromeProps().items.map((i) => i.bookmarkId)).toContain('fresh-a')
  })

  it('a mid-play arrival sits as Next, not a steal', async () => {
    await act(async () => {
      render(<TheaterShell seed={seed([textItem('1', 5), textItem('2', 8)])} />)
    })
    expect(chromeProps().currentKey).toBe('twitter:1')
    await act(async () => pushArrival?.(textItem('fresh', 0)))
    expect(chromeProps().currentKey).toBe('twitter:1')
    expect(chromeProps().items.map((i) => i.bookmarkId)).toEqual(['1', 'fresh', '2'])
    expect(chromeProps().queueToPlay).toBe(3)
  })

  it('Next after a mid-play arrival plays that arrival', async () => {
    await act(async () => {
      render(<TheaterShell seed={seed([textItem('1', 5), textItem('2', 8)])} />)
    })
    await act(async () => pushArrival?.(textItem('fresh', 0)))
    const onNext = chromeProps().onNext
    if (!onNext) throw new Error('no next')
    await act(async () => onNext())
    expect(chromeProps().currentKey).toBe('twitter:fresh')
    expect(chromeProps().items[0]?.bookmarkId).toBe('fresh')
  })

  it('repeat-all Next walks every post, not a two-item bounce', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([textItem('1', 1), textItem('2', 2), textItem('3', 3), textItem('4', 4)])}
        />,
      )
    })
    const cycle = chromeProps().onCycleRepeat
    const onNext = chromeProps().onNext
    if (!cycle || !onNext) throw new Error('no repeat/next')
    await act(async () => cycle())
    expect(chromeProps().queueLooping).toBe(true)
    expect(chromeProps().currentKey).toBe('twitter:1')

    const seen: string[] = ['1']
    for (let i = 0; i < 4; i++) {
      await act(async () => onNext())
      const id = chromeProps().currentKey?.replace('twitter:', '')
      if (id) seen.push(id)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '1'])
    expect(new Set(seen.slice(0, 4)).size).toBe(4)
  })

  it('repeat-all counts the whole playlist; repeat-one is 1', async () => {
    await act(async () => {
      render(<TheaterShell seed={seed([textItem('1', 1), textItem('2', 2), textItem('3', 3)])} />)
    })
    expect(chromeProps().queueToPlay).toBe(3)
    const cycle = chromeProps().onCycleRepeat
    if (!cycle) throw new Error('no repeat')
    await act(async () => cycle())
    expect(chromeProps().queueLooping).toBe(true)
    expect(chromeProps().queueTotal).toBe(3)
    await act(async () => cycle())
    expect(chromeProps().queueLooping).toBe(true)
    expect(chromeProps().queueTotal).toBe(1)
  })

  it('Re-watch all marks the playlist unseen and starts the newest post', async () => {
    const items = [textItem('1', 1), textItem('2', 2), textItem('3', 3)]
    markWatched(items)
    await act(async () => {
      render(<TheaterShell seed={seed(items)} />)
    })
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /re-watch all/i }))
    })
    expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()
    expect(chromeProps().currentKey).toBe('twitter:1')
    expect(chromeProps().queueLooping).toBe(false)
    expect(chromeProps().queueToPlay).toBe(3)
    expect(chromeProps().items.map((i) => i.bookmarkId)).toEqual(['1', '2', '3'])
    expect(chromeProps().isSeen?.('twitter:1')).toBe(false)

    await endCurrent()
    expect(chromeProps().currentKey).toBe('twitter:2')
    expect(chromeProps().isSeen?.('twitter:1')).toBe(true)
    expect(chromeProps().queueToPlay).toBe(2)
    expect(chromeProps().items.map((i) => i.bookmarkId)).toEqual(['2', '3', '1'])
  })

  it('Keep playing from caught-up at mount starts on the newest parked post', async () => {
    const items = [textItem('1', 1), textItem('2', 2), textItem('3', 3)]
    markWatched(items)
    await act(async () => {
      render(<TheaterShell seed={seed(items)} />)
    })
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep playing/i }))
    })
    expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()
    expect(chromeProps().currentKey).toBe('twitter:1')
    expect(chromeProps().queueLooping).toBe(true)
    expect(chromeProps().queueTotal).toBe(3)
  })
})
