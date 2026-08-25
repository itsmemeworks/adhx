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
import type { FeedItem } from '@/components/feed/types'

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

function pressNext() {
  fireEvent.keyDown(window, { key: 'ArrowRight' })
}

/**
 * "Caught up" now means nothing unwatched remains ANYWHERE, not just nothing
 * ahead of the cursor — a fresh arrival prepends to index 0, so a forward-only
 * advance used to sail past it and then claim the viewer was caught up (owner
 * report). These tests therefore have to mark the seed watched to reach the
 * waiting stage at all; advancing through unwatched posts now goes to them
 * instead, which is the point.
 */
function markWatched(items: TheaterItem[]) {
  window.localStorage.setItem('adhx-seen-v1', JSON.stringify(items.map(theaterItemKey)))
}

describe('TheaterShell: waiting-stage fixes', () => {
  beforeEach(() => {
    pushArrival = null
    mockMobileChrome.mockClear()
    window.localStorage.clear()
  })

  it('keeps the Stage mounted (not swapped for StageWaiting) once the queue reaches the end, and pauses it', async () => {
    const items = [textItem('1'), textItem('2')]
    markWatched(items)
    const pauseHeard = vi.fn()
    window.addEventListener('theater-pause', pauseHeard)
    try {
      render(<TheaterShell seed={seed(items)} />)

      // Advance past both items into the waiting stage.
      await act(async () => pressNext())
      await act(async () => pressNext())

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
    markWatched(items)
    render(<TheaterShell seed={seed(items)} />)

    await act(async () => pressNext())
    await act(async () => pressNext())
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

/**
 * Owner report: "I loaded the theatre and it went straight to 'You've watched
 * everything.' I hit Continue Watching and it started from 2 out of 19. Why
 * not 1 out of 19?"
 *
 * Right question. Landing on a fully-watched window PARKS on item 1 and shows
 * the caught-up stage — without ever playing it. `keepPlaying` then advanced
 * unconditionally, so item 1 was skipped. Advancing IS correct in the usual
 * case, where you reach the stage because the current item just finished; the
 * two cases had never been distinguished.
 */
describe('TheaterShell: resuming from a caught-up arrival starts on item 1', () => {
  beforeEach(() => {
    pushArrival = null
    mockMobileChrome.mockClear()
    window.localStorage.clear()
  })

  /** The queue the chrome was last handed, plus where the cursor sits in it. */
  function queuePosition() {
    const props = mockMobileChrome.mock.calls.at(-1)![0] as {
      items: TheaterItem[]
      currentKey: string | null
    }
    return {
      index: props.items.findIndex((it) => theaterItemKey(it) === props.currentKey),
      length: props.items.length,
    }
  }

  async function keepPlaying() {
    const btn = screen.getByRole('button', { name: /keep playing/i })
    await act(async () => {
      fireEvent.click(btn)
    })
  }

  it('resumes ON the parked item, not after it', async () => {
    const items = [textItem('1'), textItem('2'), textItem('3')]
    markWatched(items)

    await act(async () => {
      render(<TheaterShell seed={seed(items)} />)
    })

    // Straight to caught-up, parked on item 1 without playing it.
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()
    expect(queuePosition()).toEqual({ index: 0, length: 3 })

    await keepPlaying()

    // "1 of 3", not "2 of 3" — item 1 never played, so it is not behind us.
    expect(queuePosition()).toEqual({ index: 0, length: 3 })
    expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()
  })

  it('still ADVANCES when the stage was reached by finishing a post', async () => {
    const items = [textItem('1'), textItem('2')]
    markWatched(items)
    render(<TheaterShell seed={seed(items)} />)

    // Walk to the end: each press plays out an item, so the last one IS behind
    // us by the time the stage appears.
    await act(async () => pressNext())
    await act(async () => pressNext())
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()
    const before = queuePosition()

    await keepPlaying()

    // Wraps forward rather than replaying the post just watched.
    expect(queuePosition().index).not.toBe(before.index)
  })

  it('advances normally when the viewer browsed away from the parked item first', async () => {
    const items = [textItem('1'), textItem('2'), textItem('3')]
    markWatched(items)
    await act(async () => {
      render(<TheaterShell seed={seed(items)} />)
    })
    expect(queuePosition()).toEqual({ index: 0, length: 3 })

    // Browsing past item 1 means it is no longer the unplayed post we parked
    // on — the parked key self-clears by no longer matching.
    await act(async () => pressNext())
    const browsed = queuePosition().index
    expect(browsed).toBe(1)

    await keepPlaying()
    expect(queuePosition().index).not.toBe(browsed)
  })

  it('re-watch from the caught-up stage also starts at item 1', async () => {
    const items = [textItem('1'), textItem('2'), textItem('3')]
    markWatched(items)
    await act(async () => {
      render(<TheaterShell seed={seed(items)} />)
    })

    const btn = screen.getByRole('button', {
      name: /re-watch all|start from the beginning/i,
    })
    await act(async () => {
      fireEvent.click(btn)
    })

    expect(queuePosition()).toEqual({ index: 0, length: 3 })
  })

  it('P keep-plays from the caught-up stage via the theater keymap', async () => {
    const items = [textItem('1'), textItem('2'), textItem('3')]
    markWatched(items)
    await act(async () => {
      render(<TheaterShell seed={seed(items)} />)
    })
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()

    await act(async () => {
      fireEvent.keyDown(window, { key: 'p' })
    })

    expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()
    expect(queuePosition()).toEqual({ index: 0, length: 3 })
  })

  it('W re-watches from the caught-up stage via the theater keymap', async () => {
    const items = [textItem('1'), textItem('2'), textItem('3')]
    markWatched(items)
    await act(async () => {
      render(<TheaterShell seed={seed(items)} />)
    })
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()

    await act(async () => {
      fireEvent.keyDown(window, { key: 'w' })
    })

    expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()
    expect(queuePosition()).toEqual({ index: 0, length: 3 })
  })
})

/**
 * Owner report, with a screenshot: watching the Live theater, a post added from
 * ANOTHER device arrived and went to the top ("New since you opened", 1/20).
 * It played — and then the theater just stopped on a black stage instead of
 * showing the caught-up screen.
 */
describe('TheaterShell: finishing a fresh arrival lands on the caught-up stage', () => {
  beforeEach(() => {
    pushArrival = null
    mockMobileChrome.mockClear()
    window.localStorage.clear()
  })

  /** Fire the video-ended handler the Stage stub was given. */
  async function endCurrentItem() {
    const onEnded = (mockStage.mock.calls.at(-1)![0] as { onEnded?: () => void }).onEnded
    if (!onEnded) throw new Error('stage has no onEnded')
    await act(async () => onEnded())
  }

  it('shows the caught-up stage after the arrival plays out', async () => {
    // The whole window is already watched, so the shell parks on caught-up.
    const items = [textItem('1'), textItem('2')]
    markWatched(items)
    await act(async () => {
      render(<TheaterShell seed={seed(items)} />)
    })
    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()

    // A post added elsewhere arrives and takes over the stage.
    const arrival = textItem('arrival')
    await act(async () => pushArrival?.(arrival))
    expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()

    // It finishes. Nothing else is unwatched, so the only correct next state
    // is the caught-up stage — not a silent stop.
    await endCurrentItem()

    expect(screen.getByText('You’re all caught up')).toBeInTheDocument()
  })
})

describe('TheaterShell: Live caught-up resumes Saved but stays caught up', () => {
  beforeEach(() => {
    mockMobileChrome.mockClear()
    window.localStorage.clear()
  })

  it('resumes Saved without forgetting Live was caught up', async () => {
    const items = [textItem('1'), textItem('2')]
    markWatched(items)
    const resumeHeard = vi.fn()
    window.addEventListener('theater-resume', resumeHeard)
    const collectionItem = {
      id: 'c1',
      platform: 'twitter',
      author: 'alice',
      authorName: 'Alice',
      text: 'saved',
      tweetUrl: 'https://x.com/alice/status/c1',
      createdAt: '2026-08-18T00:00:00Z',
      processedAt: '2026-08-18T00:00:00Z',
      isArchived: false,
      tags: [],
      media: [],
      links: [],
    } as unknown as FeedItem

    try {
      await act(async () => {
        render(
          <TheaterShell
            seed={seed(items)}
            mode="personal"
            initialPersonalTab="live"
            personalItems={[collectionItem]}
            onClose={vi.fn()}
          />,
        )
      })
      expect(screen.getByText('You’re all caught up')).toBeInTheDocument()

      const props = mockMobileChrome.mock.calls.at(-1)![0] as {
        collection: { onTabChange: (tab: 'live' | 'collection') => void }
      }
      await act(async () => props.collection.onTabChange('collection'))

      expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument()
      expect(resumeHeard).toHaveBeenCalled()

      await act(async () => props.collection.onTabChange('live'))
      expect(screen.getByText('You’re all caught up')).toBeInTheDocument()
    } finally {
      window.removeEventListener('theater-resume', resumeHeard)
    }
  })
})
