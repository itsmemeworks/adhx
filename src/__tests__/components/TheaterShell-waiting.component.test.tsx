/**
 * @vitest-environment jsdom
 *
 * Owner screenshot report: three bugs when a fresh arrival lands on the
 * end-of-feed waiting screen. This file covers the two structural fixes in
 * TheaterShell itself (the keyboard-guard and peek-wrapper-height fixes live
 * in their own test files):
 *
 *  1. The stage now stays MOUNTED (paused) underneath the waiting overlay
 *     instead of being swapped out for `<StageWaiting/>` — unmounting
 *     StageVideo's persistent `<video>` element was what dropped the user's
 *     iOS unmuted-playback grant, so a fresh arrival started muted again
 *     even when the visitor had sound on. `theater-pause` fires the moment
 *     `waiting` flips true.
 *  2. A fresh arrival is pinned to the front of the display order
 *     (`setPinnedKey(arrived)`) — before this fix the session's earlier
 *     lead-pick still held queue position 1, so the new arrival showed as
 *     e.g. "2 / 21" instead of "1 / N".
 *
 * `TheaterShell` has never been mounted end-to-end in a test before (every
 * existing test exercises its exported pure helpers instead) — this harness
 * replaces the heavy chrome/auth/tag dependencies with capturing stubs and
 * `useTheaterFeed` with a controllable stub so a "fresh arrival" can be
 * simulated deterministically instead of waiting on the real 12s poll.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { TheaterShell } from '@/components/theater/TheaterShell'
import { theaterItemKey } from '@/components/theater/types'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'

vi.mock('@/components/theater/Stage', () => ({
  Stage: (props: { item: TheaterItem | null }) => (
    <div data-testid="stage" data-item-key={props.item ? theaterItemKey(props.item) : ''} />
  ),
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

// Controllable stand-in for the real polling hook — lets the test simulate a
// fresh arrival synchronously instead of driving the real 12s interval +
// fetch mock through fake timers.
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

function seed(items: TheaterItem[]): TheaterFeedSeed {
  return { items, savedToday: 0, recentActivity: 0 }
}

function pressArrowDown() {
  fireEvent.keyDown(window, { key: 'ArrowDown' })
}

describe('TheaterShell: waiting-stage fixes', () => {
  beforeEach(() => {
    pushArrival = null
    mockMobileChrome.mockClear()
    window.localStorage.clear()
  })

  it('keeps the Stage mounted (not swapped for StageWaiting) once the queue reaches the end, and pauses it', async () => {
    const items = [textItem('1'), textItem('2')]
    const pauseHeard = vi.fn()
    window.addEventListener('theater-pause', pauseHeard)
    try {
      render(<TheaterShell seed={seed(items)} />)

      // Advance past both items into the waiting stage.
      await act(async () => pressArrowDown())
      await act(async () => pressArrowDown())

      expect(screen.getByText('You’re all caught up')).toBeInTheDocument()
      // The stage stays in the tree — never unmounted for the waiting overlay.
      expect(screen.getByTestId('stage')).toBeInTheDocument()
      expect(pauseHeard).toHaveBeenCalled()
    } finally {
      window.removeEventListener('theater-pause', pauseHeard)
    }
  })

  it('pins a fresh arrival to the front of the queue while waiting (queue position 1, not wherever the prior lead-pick sat)', async () => {
    const items = [textItem('1'), textItem('2')]
    render(<TheaterShell seed={seed(items)} />)

    await act(async () => pressArrowDown())
    await act(async () => pressArrowDown())
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()

    const arrival = textItem('fresh-1')
    await act(async () => pushArrival?.(arrival))

    // Waiting stage exits once the fresh arrival stages.
    expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()

    const lastCallProps = mockMobileChrome.mock.calls.at(-1)![0] as {
      items: TheaterItem[]
      currentKey: string | null
    }
    expect(lastCallProps.currentKey).toBe(theaterItemKey(arrival))
    // Pinned to the FRONT of the display order, not left wherever it sits in
    // the underlying feed list.
    expect(theaterItemKey(lastCallProps.items[0])).toBe(theaterItemKey(arrival))
  })
})
