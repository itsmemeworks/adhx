/**
 * @vitest-environment jsdom
 *
 * Owner report: a tag playlist with exactly ONE post "isn't looping"
 * (/t/peteypie/robots, `#robots · 1`).
 *
 * A one-item loop cannot loop by NAVIGATING. `computeLoopedNext(1, 0, true)`
 * returns 0 — the index it is already on — so the shell sets the key it already
 * has, React bails on the identical state, and the video never restarts. Same
 * family as the stale-rescue-index stall: an "advance" that resolves to the
 * current item is silently nothing.
 *
 * Looping a single post is player-level behaviour, so the fix routes it through
 * the same `repeat` signal the shared-post pin and repeat-one already use.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, act } from '@testing-library/react'
import { TheaterShell, computeLoopedNext } from '@/components/theater/TheaterShell'
import type { TheaterFeedSeed, TheaterItem } from '@/components/theater/types'

/** Captures the `repeat` prop the Stage is handed — the player-level loop. */
const mockStage = vi.fn((_props: Record<string, unknown>) => null)
vi.mock('@/components/theater/Stage', () => ({
  Stage: (props: Record<string, unknown>) => {
    mockStage(props)
    return <div data-testid="stage" />
  },
}))

vi.mock('@/components/theater/TheaterMobileChrome', () => ({
  TheaterMobileChrome: () => null,
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

function videoItem(id: string): TheaterItem {
  return {
    action: 'save',
    platform: 'twitter',
    bookmarkId: id,
    author: 'alice',
    url: `/alice/status/${id}`,
    createdAt: '2026-08-18T00:00:00Z',
    addedAt: '2026-08-18T00:00:00Z',
    contentType: 'video',
    text: `post ${id}`,
    trendCount: 0,
  } as TheaterItem
}

const seed = (items: TheaterItem[]): TheaterFeedSeed => ({
  items,
  savedToday: 0,
  recentActivity: 0,
})

/** The `repeat` prop from the Stage's most recent render. */
function stageRepeat(): boolean | undefined {
  const call = mockStage.mock.calls.at(-1)
  if (!call) throw new Error('stage never rendered')
  return call[0].repeat as boolean | undefined
}

describe('computeLoopedNext: why a one-item loop needs player-level repeat', () => {
  it('resolves "next" to the item it is already on', () => {
    // Not wrong in itself — but the CALLER then sets an identical key, which
    // is a no-op. Documented here so the fix below is not "simplified" away.
    expect(computeLoopedNext(1, 0, true)).toBe(0)
  })

  it('still waits rather than looping when the queue of one does not loop', () => {
    expect(computeLoopedNext(1, 0, false)).toBe('waiting')
  })
})

describe('TheaterShell: a single-post playlist loops at the player', () => {
  beforeEach(() => {
    mockStage.mockClear()
    window.localStorage.clear()
  })

  it('repeats the only post in a one-item playlist', async () => {
    await act(async () => {
      render(<TheaterShell seed={seed([videoItem('only')])} mode="playlist" />)
    })
    expect(stageRepeat()).toBe(true)
  })

  it('does NOT repeat when the playlist has more than one post', async () => {
    await act(async () => {
      render(<TheaterShell seed={seed([videoItem('1'), videoItem('2')])} mode="playlist" />)
    })
    // Two posts loop by navigating between them, which works.
    expect(stageRepeat()).toBe(false)
  })

  it('leaves a one-item LIVE queue alone — it is not supposed to loop', async () => {
    await act(async () => {
      render(<TheaterShell seed={seed([videoItem('only')])} />)
    })
    // Home/live ends on the caught-up stage instead of repeating.
    expect(stageRepeat()).toBe(false)
  })
})
