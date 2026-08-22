/**
 * @vitest-environment jsdom
 *
 * The repeat control IS the auto-advance switch (owner asked whether the
 * boundary needed one of its own; it doesn't). Two properties make it read like
 * a switch rather than a per-visit toggle:
 *
 *  1. "Keep playing" (mode 'all') PERSISTS across visits, so a viewer who
 *     wants continuous play doesn't re-set it every time. 'one' deliberately
 *     does NOT persist — it's about the post in front of you, and inheriting it
 *     next visit would strand you looping something at random.
 *  2. The mobile position counter is out of what will actually play, so
 *     flipping the control visibly changes the denominator.
 *
 * Harness copied from TheaterShell-waiting.component.test.tsx: the chromes are
 * capturing stubs, so the test drives `onCycleRepeat` and reads back the props
 * the shell hands them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, act } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'

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

vi.mock('@/components/theater/useTheaterFeed', () => ({
  useTheaterFeed: (seed: TheaterFeedSeed) => {
    const [items] = useState(seed.items)
    return {
      items,
      savedToday: seed.savedToday,
      recentActivity: seed.recentActivity,
      freshKeys: new Set<string>(),
    }
  },
}))

function textItem(bookmarkId: string): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId,
    author: `author${bookmarkId}`,
    url: `/author${bookmarkId}/status/${bookmarkId}`,
    createdAt: '2026-08-18T00:00:00Z',
    addedAt: '2026-08-18T00:00:00Z',
    contentType: 'text',
    text: `post ${bookmarkId}`,
    trendCount: 0,
  } as TheaterItem
}

function seed(items: TheaterItem[]): TheaterFeedSeed {
  return { items, savedToday: 0, recentActivity: 0 }
}

/** Latest props the shell handed the mobile chrome. */
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

const STORAGE_KEY = 'adhx-theater-repeat'

describe('TheaterShell: repeat is a remembered switch', () => {
  beforeEach(() => {
    mockMobileChrome.mockClear()
    window.localStorage.clear()
  })

  it('remembers "keep playing" across visits', async () => {
    const { unmount } = render(<TheaterShell seed={seed([textItem('1'), textItem('2')])} />)
    expect(chromeProps().repeatMode).toBe('off')

    await cycleRepeat() // off -> all
    expect(chromeProps().repeatMode).toBe('all')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('all')

    // A later visit picks it back up rather than resetting to off.
    unmount()
    mockMobileChrome.mockClear()
    render(<TheaterShell seed={seed([textItem('1'), textItem('2')])} />)
    expect(chromeProps().repeatMode).toBe('all')
  })

  it('does NOT let "repeat this post" overwrite the remembered choice', async () => {
    render(<TheaterShell seed={seed([textItem('1'), textItem('2')])} />)

    await cycleRepeat() // off -> all
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('all')

    await cycleRepeat() // all -> one
    expect(chromeProps().repeatMode).toBe('one')
    // 'one' is about the current post, so the durable preference stands.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('all')
  })

  it('records turning it back off, so "off" is a choice too', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'all')
    render(<TheaterShell seed={seed([textItem('1'), textItem('2')])} />)
    expect(chromeProps().repeatMode).toBe('all')

    await cycleRepeat() // all -> one
    await cycleRepeat() // one -> off
    expect(chromeProps().repeatMode).toBe('off')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('off')
  })

  it('counts the position out of the unwatched run, and out of everything once repeat is on', async () => {
    // Nothing seen, so all three are pending: the run IS the whole queue here.
    render(<TheaterShell seed={seed([textItem('1'), textItem('2'), textItem('3')])} />)
    expect(chromeProps().queueTotal).toBe(3)

    await cycleRepeat() // -> all: everything plays either way
    expect(chromeProps().queueTotal).toBe(3)
  })

  it('shrinks the denominator to the unwatched run when most posts were already watched', async () => {
    // Two of three watched before this session started.
    window.localStorage.setItem(
      'adhx-seen-v1',
      JSON.stringify([theaterItemKey(textItem('2')), theaterItemKey(textItem('3'))]),
    )
    await act(async () => {
      render(<TheaterShell seed={seed([textItem('1'), textItem('2'), textItem('3')])} />)
    })

    // One pending post, so "1 / 1" rather than a misleading "1 / 3".
    expect(chromeProps().queueTotal).toBe(1)

    await cycleRepeat() // -> all: the watched ones are back in play
    expect(chromeProps().queueTotal).toBe(3)
  })
})
