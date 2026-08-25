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
 *  2. The leftover count is what will actually play, so flipping the
 *     control visibly changes leftover vs the full pile.
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

  it('counts leftover while stopping, and the full pile once repeat is on', async () => {
    // Nothing seen, so all three are pending: leftover IS the pile here.
    render(<TheaterShell seed={seed([textItem('1'), textItem('2'), textItem('3')])} />)
    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(3)
    expect(chromeProps().queueLooping).toBe(false)
    expect(chromeProps().queueTotal).toBe(3)

    await cycleRepeat() // -> all: leftover is no longer a stop-count
    expect(chromeProps().queueLooping).toBe(true)
    expect(chromeProps().queueTotal).toBe(3)
  })

  it('counts a user Next as played of the leftover run', async () => {
    render(<TheaterShell seed={seed([textItem('1'), textItem('2'), textItem('3')])} />)
    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(3)

    const onNext = chromeProps().onNext as (() => void) | undefined
    if (!onNext) throw new Error('next control not offered')
    await act(async () => onNext())

    expect(chromeProps().queuePlayed).toBe(1)
    expect(chromeProps().queueToPlay).toBe(3)
    expect(chromeProps().queueLooping).toBe(false)
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

    // One pending post of three — leftover, not a playlist position.
    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(1)
    expect(chromeProps().queueLooping).toBe(false)
    expect(chromeProps().queueTotal).toBe(3)

    await cycleRepeat() // -> all: the watched ones are back in play
    expect(chromeProps().queueLooping).toBe(true)
    expect(chromeProps().queueTotal).toBe(3)
  })
})

/**
 * Owner report: "If I go to a direct preview URL then I don't get the watched,
 * the different categorizations or sections within the playlist. If I just go
 * straight to the root domain then I do see the different sections. We just
 * need to be always consistent here."
 *
 * Shared mode's queue below the shared post IS the live feed, so it now takes
 * the same unseen-first ordering and grouping. The shared post keeps leading
 * (it's why the visitor is here) and is pinned out of the grouping —
 * `pinnedKey`, asserted here at the wiring level; UpNextList's own test covers
 * how it renders.
 */
describe('TheaterShell: a shared preview page groups its queue like home', () => {
  beforeEach(() => {
    mockMobileChrome.mockClear()
    window.localStorage.clear()
  })

  const shared = textItem('shared')

  it('passes the grouping snapshot in shared mode (it used to pass nothing)', async () => {
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([shared, textItem('2'), textItem('3')])}
          mode="shared"
          sharedItem={shared}
        />,
      )
    })
    const props = chromeProps()
    expect(typeof props.wasSeenOnEntry).toBe('function')
    expect(props.pinnedKey).toBe(theaterItemKey(shared))
  })

  it('keeps the shared post leading even though the queue is reordered', async () => {
    // '2' is unwatched and '3' watched, so ordering would sort the tail — but
    // the shared post must stay at index 0 regardless.
    window.localStorage.setItem('adhx-seen-v1', JSON.stringify([theaterItemKey(textItem('3'))]))
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([textItem('3'), shared, textItem('2')])}
          mode="shared"
          sharedItem={shared}
        />,
      )
    })
    const items = chromeProps().items as TheaterItem[]
    expect(items.map((i) => i.bookmarkId)).toEqual(['shared', '2', '3'])
  })

  it('counts a RE-VISITED shared post as pending, so the boundary survives', async () => {
    // The visitor has seen this shared post before, and one queue post. A
    // watched lead would zero the unwatched run and switch the stop-when-
    // caught-up boundary off for the whole queue behind it.
    window.localStorage.setItem(
      'adhx-seen-v1',
      JSON.stringify([theaterItemKey(shared), theaterItemKey(textItem('3'))]),
    )
    await act(async () => {
      render(
        <TheaterShell
          seed={seed([shared, textItem('2'), textItem('3')])}
          mode="shared"
          sharedItem={shared}
        />,
      )
    })
    // shared (exempt) + '2' = a 2-long pending run, not 0 and not all 3.
    expect(chromeProps().queuePlayed).toBe(0)
    expect(chromeProps().queueToPlay).toBe(2)
    expect(chromeProps().queueLooping).toBe(false)
    expect(chromeProps().queueTotal).toBe(3)
  })

  it('leaves a curated playlist ungrouped', async () => {
    await act(async () => {
      render(<TheaterShell seed={seed([textItem('1'), textItem('2')])} mode="playlist" />)
    })
    expect(chromeProps().wasSeenOnEntry).toBeUndefined()
  })
})
